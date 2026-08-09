"""Emoera 通行证 (lotus-passport) OIDC 客户端。

本地服务: http://localhost:8000/api/v1   (Django, service="lotus-passport")
生产服务: https://accountapi.emoera.com/api

通行证签发 RS256 签名的 JWT access token，并提供 JWKS 公钥端点用于校验签名。
本模块优先用 JWKS 在本地校验 token 签名（无需每次网络请求），失败再回退到 userinfo 端点。

凭证（client_id / client_secret）申请下来后把 PASSPORT_ENABLED 置为 true 即可启用；
本地可用 /api/v1/dev/login/ 直接拿 dev token 做联调。
"""
import base64
import json
import time
from typing import Optional
from urllib.parse import urlencode

import httpx
from jose import jwt

from .config import settings

_jwks_cache: dict = {"keys": None, "fetched_at": 0}
_JWKS_TTL = 3600


def _jwks_url() -> str:
    return settings.OIDC_JWKS_URL or f"{settings.OIDC_ISSUER.rstrip('/')}/.well-known/jwks.json"


def _userinfo_url() -> str:
    return settings.OIDC_USERINFO_URL or f"{settings.OIDC_ISSUER.rstrip('/')}/userinfo/"


def get_jwks() -> Optional[list]:
    now = time.time()
    if _jwks_cache["keys"] and now - _jwks_cache["fetched_at"] < _JWKS_TTL:
        return _jwks_cache["keys"]
    try:
        r = httpx.get(_jwks_url(), timeout=5)
        if r.status_code == 200:
            data = r.json()
            _jwks_cache["keys"] = data.get("keys")
            _jwks_cache["fetched_at"] = now
            return _jwks_cache["keys"]
    except Exception:
        return None
    return None


def _decode_header(token: str) -> dict:
    try:
        h = token.split(".")[0]
        padding = "=" * (-len(h) % 4)
        return json.loads(base64.urlsafe_b64decode(h + padding))
    except Exception:
        return {}


def verify_token(access_token: str) -> Optional[dict]:
    """校验通行证签发的 access token，返回 claims 或 None。"""
    if not access_token:
        return None

    # 1) 优先用 JWKS 本地校验签名
    try:
        header = _decode_header(access_token)
        kid = header.get("kid")
        jwks = get_jwks()
        if jwks:
            key = next((k for k in jwks if k.get("kid") == kid), None)
            if key:
                claims = jwt.decode(
                    access_token,
                    key,
                    algorithms=["RS256"],
                    options={"verify_aud": False},
                )
                if claims.get("token_type") != "access":
                    return None
                return claims
    except Exception:
        pass

    # 2) 回退：调用 userinfo 端点校验
    try:
        r = httpx.get(
            _userinfo_url(),
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=5,
        )
        if r.status_code == 200:
            return r.json()
    except Exception:
        return None
    return None


def authorization_url(state: str, provider: Optional[str] = None) -> str:
    prov = provider or settings.OIDC_PROVIDER
    base = settings.OIDC_ISSUER.rstrip("/")
    params = {
        "response_type": "code",
        "client_id": settings.OIDC_CLIENT_ID,
        "redirect_uri": settings.OIDC_REDIRECT_URI,
        "scope": settings.OIDC_SCOPE,
        "state": state,
    }
    return f"{base}/oauth/{prov}/login/?" + urlencode(params)


def exchange_code(code: str, provider: Optional[str] = None) -> Optional[dict]:
    prov = provider or settings.OIDC_PROVIDER
    base = settings.OIDC_ISSUER.rstrip("/")
    data = {
        "code": code,
        "client_id": settings.OIDC_CLIENT_ID,
        "client_secret": settings.OIDC_CLIENT_SECRET,
        "redirect_uri": settings.OIDC_REDIRECT_URI,
    }
    try:
        r = httpx.post(f"{base}/oauth/{prov}/callback/", data=data, timeout=10)
        if r.status_code == 200:
            return r.json()
    except Exception:
        return None
    return None
