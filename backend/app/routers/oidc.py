"""OIDC 通行证回调端点。

登录流程：前端 GET /api/auth/login → 返回授权 URL → 用户跳转到通行证 →
通行证回调 /api/auth/callback?code=xxx → 后端验证 → 签发 session cookie → 重定向到前端
"""

from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from .. import auth, passport
from ..config import settings

router = APIRouter(tags=["oidc"])


@router.get("/auth/callback")
def callback(request: Request, code: str, state: Optional[str] = None):
    """OIDC 授权回调：用 code 换 token，验证后签发 session cookie，重定向到前端。"""
    if not settings.PASSPORT_ENABLED:
        raise HTTPException(status_code=503, detail="Passport not enabled")

    # 1. 用 code 换取 access_token
    tokens = passport.exchange_code(code)
    if not tokens:
        raise HTTPException(status_code=400, detail="Failed to exchange authorization code")

    access_token = tokens.get("access_token") or tokens.get("accessToken") or ""

    # 2. 验证 token 并提取用户信息
    claims = passport.verify_token(access_token)
    if not claims:
        raise HTTPException(status_code=400, detail="Failed to verify access token")

    user_name = claims.get("name") or claims.get("nickname") or claims.get("preferred_username") or claims.get("sub") or "unknown"
    user_id = claims.get("sub") or claims.get("user_id") or f"oidc:{user_name}"

    # 3. 签发 session cookie
    cookie = auth.make_session(user_id, user_name)

    # 4. 重定向到前端首页
    response = RedirectResponse(url=settings.FRONTEND_URL)
    response.set_cookie(
        key="emoera_session",
        value=cookie,
        max_age=settings.SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        path="/",
    )
    return response