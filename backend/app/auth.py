"""Session / OIDC 鉴权模块。

登录流程：
  GET /api/auth/login → OIDC 授权页 → GET /api/auth/callback → 签发 session cookie

中间件 require_auth() 从 cookie 中解析用户身份。
"""

import hashlib
import hmac
import json
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db

router = APIRouter(tags=["auth"])


# ── Session 工具 ──────────────────────────────────────────────

def _sign_payload(payload: dict) -> str:
    raw = json.dumps(payload, separators=(",", ":"))
    sig = hmac.new(
        settings.SESSION_SECRET.encode(), raw.encode(), hashlib.sha256
    ).hexdigest()
    return f"{raw}.{sig}"


def _verify_payload(cookie: str) -> Optional[dict]:
    try:
        raw, sig = cookie.rsplit(".", 1)
        expected = hmac.new(
            settings.SESSION_SECRET.encode(), raw.encode(), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        return json.loads(raw)
    except Exception:
        return None


def make_session(user_id: str, user_name: str) -> str:
    """签发 session cookie（供 OIDC callback 调用）。"""
    return _sign_payload({"uid": user_id, "name": user_name, "iat": int(time.time())})


def _get_session_cookie(request: Request) -> Optional[dict]:
    cookie = request.cookies.get("emoera_session")
    if not cookie:
        return None
    return _verify_payload(cookie)


# ── 用户身份模型 ──────────────────────────────────────────────

class UserIdentity:
    def __init__(self, user_id: str, user_name: str):
        self.user_id = user_id
        self.user_name = user_name

    @property
    def is_authenticated(self) -> bool:
        return bool(self.user_id)


ANONYMOUS = UserIdentity("", "")


# ── 端点 ──────────────────────────────────────────────────────

@router.get("/auth/login")
def login():
    """返回 OIDC 授权页 URL（前端拿到后跳转）。"""
    if not settings.PASSPORT_ENABLED:
        raise HTTPException(status_code=503, detail="Passport not enabled")
    from . import passport
    state = __import__("secrets").token_urlsafe(16)
    return {"authorization_url": passport.authorization_url(state), "state": state}


@router.get("/auth/me")
def get_me(request: Request):
    """获取当前登录用户信息。"""
    session = _get_session_cookie(request)
    if not session:
        return {"authenticated": False, "user_id": "", "user_name": ""}
    return {
        "authenticated": True,
        "user_id": session["uid"],
        "user_name": session["name"],
    }


@router.post("/auth/logout")
def logout(response: Response):
    """清除 session cookie。"""
    response.delete_cookie("emoera_session", path="/")
    return {"ok": True}


# ── FastAPI 依赖 ──────────────────────────────────────────────

def require_auth(request: Request) -> UserIdentity:
    """从 cookie 中解析用户身份。未登录返回 ANONYMOUS（不抛 401）。"""
    session = _get_session_cookie(request)
    if not session:
        return ANONYMOUS
    return UserIdentity(session["uid"], session["name"])


def require_login(request: Request) -> UserIdentity:
    """必须登录，否则 401。"""
    user = require_auth(request)
    if not user.is_authenticated:
        raise HTTPException(status_code=401, detail="请先登录")
    return user


# ── 权限检查辅助函数 ──────────────────────────────────────────

def check_room_owner(room_id: str, user: UserIdentity, db: Session) -> bool:
    if not user.is_authenticated:
        return False
    from sqlalchemy import text
    row = db.execute(
        text("SELECT creator_id FROM rooms WHERE room_id = :rid"),
        {"rid": room_id},
    ).first()
    return row is not None and row[0] == user.user_id


def check_activity_owner(activity_id: str, user: UserIdentity, db: Session) -> bool:
    if not user.is_authenticated:
        return False
    from sqlalchemy import text
    row = db.execute(
        text("SELECT creator_id FROM activities WHERE activity_id = :aid"),
        {"aid": activity_id},
    ).first()
    return row is not None and row[0] == user.user_id


def count_user_rooms(user_id: str, db: Session) -> int:
    from sqlalchemy import text
    row = db.execute(
        text("SELECT COUNT(*) FROM rooms WHERE creator_id = :uid"),
        {"uid": user_id},
    ).scalar()
    return row or 0


def count_user_activities(user_id: str, db: Session) -> int:
    from sqlalchemy import text
    row = db.execute(
        text("SELECT COUNT(*) FROM activities WHERE creator_id = :uid"),
        {"uid": user_id},
    ).scalar()
    return row or 0


def count_activity_rooms(activity_id: int, db: Session) -> int:
    from sqlalchemy import text
    row = db.execute(
        text("SELECT COUNT(*) FROM rooms WHERE activity_id = :aid"),
        {"aid": activity_id},
    ).scalar()
    return row or 0


def touch_room_last_used(room_id: str, db: Session) -> None:
    from sqlalchemy import text
    db.execute(
        text("UPDATE rooms SET last_used_at = NOW() WHERE room_id = :rid"),
        {"rid": room_id},
    )


def cleanup_expired_rooms(db: Session) -> int:
    from sqlalchemy import text
    result = db.execute(
        text("DELETE FROM rooms WHERE last_used_at < NOW() - INTERVAL :days DAY"),
        {"days": settings.ROOM_EXPIRE_DAYS},
    )
    db.commit()
    deleted = result.rowcount
    if deleted:
        print(f"Auto-cleaned {deleted} expired rooms")
    return deleted