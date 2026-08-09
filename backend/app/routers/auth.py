import secrets
from typing import Optional

from fastapi import APIRouter, HTTPException

from .. import passport
from ..config import settings

router = APIRouter(tags=["auth"])


@router.get("/auth/login")
def login():
    """返回 OIDC 授权页 URL（前端拿到后跳转）。凭证申请下来、PASSPORT_ENABLED=true 后生效。"""
    if not settings.PASSPORT_ENABLED:
        raise HTTPException(status_code=503, detail="Passport (OIDC) not enabled")
    state = secrets.token_urlsafe(16)
    return {"authorization_url": passport.authorization_url(state), "state": state}


@router.get("/auth/callback")
def callback(code: str, state: Optional[str] = None):
    """授权回调：用 code 换取 token（access_token / id_token 等）。"""
    if not settings.PASSPORT_ENABLED:
        raise HTTPException(status_code=503, detail="Passport (OIDC) not enabled")
    tokens = passport.exchange_code(code)
    if not tokens:
        raise HTTPException(status_code=400, detail="Failed to exchange authorization code")
    return tokens
