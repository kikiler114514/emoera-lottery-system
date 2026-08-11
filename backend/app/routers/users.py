import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import auth
from ..database import get_db
from .. import models
from . import events
from ..schemas import UserRegister

router = APIRouter(tags=["users"])


# ── 匿名会话 fingerprint（限同一浏览器在同一房间的报名数）────────────
# Cookie 名沿用 settings.ANON_FP_COOKIE，便于跨端点保持一致；
# 同时本地保留常量便于单元测试 / 调试覆盖。
ANON_FP_COOKIE = "emoera_anon_fp"


def _get_or_create_fingerprint(request: Request, response: Response) -> str:
    """取出已有 fingerprint；没有则生成一个，写入长期 cookie 返回。

    用 cookie 而非 IP 哈希，是因为：
    - NAT 网络下 IP 不可靠；
    - 浏览器场景下 cookie 是更稳定且用户可控的"匿名会话标识"。
    注意：用户清掉 cookie 即可换身份，这与既有"未登录限额"的强度相当，
    因此足以在内部工具场景下防止"扫一个码就 N 个人混进去"。
    """
    fp = request.cookies.get(ANON_FP_COOKIE)
    if not fp:
        fp = secrets.token_urlsafe(32)
        response.set_cookie(
            key=ANON_FP_COOKIE,
            value=fp,
            max_age=getattr(auth.settings, "ANON_FP_COOKIE_MAX_AGE", 86400 * 30),
            httponly=True,
            samesite="lax",
            path="/",
        )
    return fp


@router.get("/users")
def list_users(roomId: str, db: Session = Depends(get_db)):
    room = db.execute(
        text("SELECT id FROM rooms WHERE room_id = :rid"), {"rid": roomId}
    ).mappings().first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    rows = db.execute(
        text(
            """
            SELECT u.id, u.name, u.department, u.created_at,
              EXISTS(SELECT 1 FROM lottery_winners lw WHERE lw.user_id = u.id) as participated
            FROM users u
            WHERE u.room_id = :rid
            ORDER BY u.created_at DESC
            """
        ),
        {"rid": room["id"]},
    ).mappings().all()
    return {"users": [dict(r) for r in rows]}


@router.post("/users")
def register_user(
    payload: UserRegister,
    request: Request,
    response: Response,
    user: auth.UserIdentity = Depends(auth.require_auth),
    db: Session = Depends(get_db),
):
    """报名入口（公开，参与者扫码报名用）。未登录同会话限报 N 人（默认 1）。"""
    name = (payload.name or "").strip()
    room_id = payload.roomId
    if not name or not room_id:
        raise HTTPException(status_code=400, detail="name and roomId are required")

    room = db.execute(
        text("SELECT id FROM rooms WHERE room_id = :rid"), {"rid": room_id}
    ).mappings().first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    rid = room["id"]

    existing = db.execute(
        text("SELECT id FROM users WHERE name = :n AND room_id = :rid"),
        {"n": name, "rid": rid},
    ).mappings().first()
    if existing:
        raise HTTPException(status_code=409, detail="User already registered in this room")

    # 未登录用户：按"会话 fingerprint + 房间"限 N 人，而不是按"房间内全部参与者"。
    # 旧实现会用房间总人数做阈值，导致后到的任何未登录扫码都被 403。
    if not user.is_authenticated:
        fingerprint = _get_or_create_fingerprint(request, response)
        fp_count = db.execute(
            text(
                "SELECT COUNT(*) FROM anonymous_participants "
                "WHERE fingerprint = :fp AND room_id = :rid"
            ),
            {"fp": fingerprint, "rid": rid},
        ).scalar()
        if fp_count >= auth.settings.MAX_NONLOGIN_PARTICIPANTS:
            raise HTTPException(
                status_code=403,
                detail="未登录用户最多报名 1 人，请登录后添加更多",
            )

    user_obj = models.User(
        name=name,
        department=(payload.department or "").strip() or None,
        room_id=rid,
    )
    db.add(user_obj)
    db.flush()  # 立刻拿到 user_obj.id，给 anonymous_participants 引用

    # 记录未登录会话的占用（成功提交后才插入）
    if not user.is_authenticated:
        fingerprint = _get_or_create_fingerprint(request, response)
        db.add(
            models.AnonymousParticipant(
                fingerprint=fingerprint,
                room_id=rid,
                user_id=user_obj.id,
            )
        )

    db.execute(
        text("UPDATE rooms SET total_users = total_users + 1 WHERE id = :rid"),
        {"rid": rid},
    )
    auth.touch_room_last_used(room_id, db)
    try:
        db.commit()
        db.refresh(user_obj)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to register user")
    events.publish(room_id, "users_updated", {"action": "register", "name": name, "userId": user_obj.id})
    return {
        "success": True,
        "message": "User registered successfully",
        "userId": user_obj.id,
    }


@router.delete("/users")
def delete_user(
    userId: int,
    roomId: str,
    user: auth.UserIdentity = Depends(auth.require_auth),
    db: Session = Depends(get_db),
):
    """删除参与者（仅房间创建者可删）。"""
    room = db.execute(
        text("SELECT id, creator_id FROM rooms WHERE room_id = :rid"),
        {"rid": roomId},
    ).mappings().first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if not auth.check_room_owner(roomId, user, db):
        raise HTTPException(status_code=403, detail="只有房间创建者才能删除参与者")

    rid = room["id"]

    # 先检查该用户是否中过奖（delete 后无法查询）
    won_count = db.execute(
        text("SELECT COUNT(*) as cnt FROM lottery_winners WHERE user_id = :uid"),
        {"uid": userId},
    ).mappings().first()
    winner_decrement = won_count["cnt"] if won_count else 0

    result = db.execute(
        text("DELETE FROM users WHERE id = :uid AND room_id = :rid"),
        {"uid": userId, "rid": rid},
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="User not found in this room")

    db.execute(
        text("UPDATE rooms SET total_users = GREATEST(total_users - 1, 0) WHERE id = :rid"),
        {"rid": rid},
    )
    if winner_decrement > 0:
        db.execute(
            text("UPDATE rooms SET current_winners = GREATEST(current_winners - :c, 0) WHERE id = :rid"),
            {"c": winner_decrement, "rid": rid},
        )
    auth.touch_room_last_used(roomId, db)
    db.commit()
    events.publish(roomId, "users_updated", {"action": "delete", "userId": userId})
    return {"success": True, "message": "User deleted successfully"}