from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from . import events
from ..schemas import UserRegister

router = APIRouter(tags=["users"])


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
def register_user(payload: UserRegister, db: Session = Depends(get_db)):
    """报名入口（公开，参与者扫码报名用）。"""
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

    user = models.User(
        name=name,
        department=(payload.department or "").strip() or None,
        room_id=rid,
    )
    db.add(user)
    db.execute(
        text("UPDATE rooms SET total_users = total_users + 1 WHERE id = :rid"),
        {"rid": rid},
    )
    try:
        db.commit()
        db.refresh(user)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to register user")
    # 参与者报名后，让房间内所有人（含管理员）实时看到新增
    events.publish(room_id, "users_updated", {"action": "register", "name": name, "userId": user.id})
    return {
        "success": True,
        "message": "User registered successfully",
        "userId": user.id,
    }


@router.delete("/users")
def delete_user(
    userId: int,
    roomId: str,
    db: Session = Depends(get_db),
):
    room = db.execute(
        text("SELECT id FROM rooms WHERE room_id = :rid"), {"rid": roomId}
    ).mappings().first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
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
    db.commit()
    events.publish(roomId, "users_updated", {"action": "delete", "userId": userId})
    return {"success": True, "message": "User deleted successfully"}
