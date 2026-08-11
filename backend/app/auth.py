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
    """校验 session cookie 并返回 payload（uid/name/iat），无效则返回 None。

    两层校验：
    1. HMAC 签名 — 防止 cookie 内容被篡改；
    2. iat + SESSION_MAX_AGE > now — 服务端主动判定过期。
       仅依赖浏览器 / 反向代理的 max-age 不够稳：复制 cookie 出来、手工 replay 都
       能绕过；服务端主动过期后即便签名正确也拒收。
    """
    try:
        raw, sig = cookie.rsplit(".", 1)
        expected = hmac.new(
            settings.SESSION_SECRET.encode(), raw.encode(), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(raw)
        # 服务端过期校验
        iat = int(payload.get("iat", 0))
        if iat <= 0 or int(time.time()) - iat > settings.SESSION_MAX_AGE:
            return None
        return payload
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


# 历史 schema 升级时用于标记"无主房间"的固定 creator_id；详见 database._backfill_orphan_rooms。
# 任意登录用户都能对这类房间行使管理权限（抽奖/删除/清空中奖记录），让旧数据
# 在被真正认领前不至于变成只读。
ROOM_ORPHAN_CREATOR_ID = "system:orphan"


# ── 端点 ──────────────────────────────────────────────────────

@router.post("/auth/login")
def login(response: Response):
    """登录入口。生产走 OIDC 通行证；本地未启用 passport 时直接签发本地身份 cookie。"""
    if settings.PASSPORT_ENABLED:
        # 生产：返回 OIDC 授权 URL（前端拿到后跳转通行证）。
        # 同时把 state 写到短期 HttpOnly cookie（OIDC_STATE_MAX_AGE 秒），
        # callback 时一次性等值校验，防登录 CSRF。
        from . import passport
        import secrets
        state = secrets.token_urlsafe(32)
        response.set_cookie(
            key="oidc_state",
            value=state,
            max_age=settings.OIDC_STATE_MAX_AGE,
            httponly=True,
            secure=False,  # 上线 HTTPS 时改为 True（需保证 TLS 终止在应用前）
            samesite="lax",
            path="/",
        )
        return {"authorization_url": passport.authorization_url(state), "state": state}

    # 仅本地开发：直接签发本地身份 cookie，方便以创建者身份测试
    cookie = make_session(settings.LOCAL_USER_ID, settings.LOCAL_USER_NAME)
    response.set_cookie(
        key="emoera_session",
        value=cookie,
        max_age=settings.SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        path="/",
    )
    return {
        "local": True,
        "user_id": settings.LOCAL_USER_ID,
        "user_name": settings.LOCAL_USER_NAME,
    }


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
    """检查 user 是不是该房间的管理者。

    返回 True 的两种情况：
    1. user.user_id == rooms.creator_id（正常情况）
    2. rooms.creator_id == ROOM_ORPHAN_CREATOR_ID（历史无主房间，任何登录用户视为 owner）

    返回 False：未登录、未找到房间、且不是 orphan。
    """
    if not user.is_authenticated:
        return False
    from sqlalchemy import text
    row = db.execute(
        text("SELECT creator_id FROM rooms WHERE room_id = :rid"),
        {"rid": room_id},
    ).first()
    if row is None:
        return False
    creator_id = row[0]
    if creator_id == ROOM_ORPHAN_CREATOR_ID:
        return True  # 历史无主房间放行
    return creator_id == user.user_id


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
    """统计用户创建的**独立**房间（不属于任何活动）。活动内的房间受活动限额约束，不计入个人限额。"""
    from sqlalchemy import text
    row = db.execute(
        text("SELECT COUNT(*) FROM rooms WHERE creator_id = :uid AND activity_id IS NULL"),
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