"""OIDC 通行证回调端点。

登录流程：前端 GET /api/auth/login → 返回授权 URL → 用户跳转到通行证 →
通行证回调 /api/auth/callback?code=xxx → 后端验证 → 签发 session cookie → 重定向到前端

⚠️ 安全性：
1. 必须校验 `state` 参数与登录时种入的 `oidc_state` cookie 等值，否则拒绝。
2. 校验通过的 cookie 立即删除（一次性消费），防止回放。
"""

import secrets
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse

from .. import auth, passport
from ..config import settings

router = APIRouter(tags=["oidc"])


@router.get("/auth/callback")
def callback(request: Request, code: str, state: Optional[str] = None, response: Response = None):
    """OIDC 授权回调：用 code 换 token，验证后签发 session cookie，重定向到前端。"""
    if not settings.PASSPORT_ENABLED:
        raise HTTPException(status_code=503, detail="Passport not enabled")

    # 1. state 一次性等值校验（防登录 CSRF / 账号错绑）
    expected_state = request.cookies.get("oidc_state")
    if not state or not expected_state or not secrets.compare_digest(state, expected_state):
        # 校验失败的响应要清理掉残留 cookie，避免下次继续被攻击者利用
        if response is not None:
            response.delete_cookie("oidc_state", path="/")
        raise HTTPException(status_code=400, detail="Invalid or expired login state")

    # 2. 用 code 换取 access_token
    tokens = passport.exchange_code(code)
    if not tokens:
        raise HTTPException(status_code=400, detail="Failed to exchange authorization code")

    access_token = tokens.get("access_token") or tokens.get("accessToken") or ""

    # 3. 验证 token 并提取用户信息
    claims = passport.verify_token(access_token)
    if not claims:
        raise HTTPException(status_code=400, detail="Failed to verify access token")

    user_name = claims.get("name") or claims.get("nickname") or claims.get("preferred_username") or claims.get("sub") or "unknown"
    user_id = claims.get("sub") or claims.get("user_id") or f"oidc:{user_name}"

    # 4. 签发 session cookie
    cookie = auth.make_session(user_id, user_name)

    # 5. 重定向到前端首页 + 一次性销毁 state cookie
    redirect = RedirectResponse(url=settings.FRONTEND_URL)
    redirect.set_cookie(
        key="emoera_session",
        value=cookie,
        max_age=settings.SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        path="/",
    )
    redirect.delete_cookie("oidc_state", path="/")
    return redirect