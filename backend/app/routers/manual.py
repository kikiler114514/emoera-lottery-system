from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import auth
from ..database import get_db
from .. import models
from . import events
from ..schemas import UserRegister, BatchUsersCreate

router = APIRouter(tags=["users-manual"])


def _check_room_owner(room_id: str, user: auth.UserIdentity, db: Session):
    """检查是否为房间创建者，否则 403。"""
    if not auth.check_room_owner(room_id, user, db):
        raise HTTPException(status_code=403, detail="只有房间创建者才能添加参与者")


@router.post("/users/manual")
def add_single(
    payload: UserRegister,
    user: auth.UserIdentity = Depends(auth.require_auth),
    db: Session = Depends(get_db),
):
    name = (payload.name or "").strip()
    room_id = payload.roomId
    if not name or not room_id:
        raise HTTPException(status_code=400, detail="name and roomId are required")

    _check_room_owner(room_id, user, db)

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

    user_obj = models.User(
        name=name,
        department=(payload.department or "").strip() or None,
        room_id=rid,
    )
    db.add(user_obj)
    db.execute(
        text("UPDATE rooms SET total_users = total_users + 1 WHERE id = :rid"),
        {"rid": rid},
    )
    auth.touch_room_last_used(room_id, db)
    db.commit()
    db.refresh(user_obj)
    events.publish(room_id, "users_updated", {"action": "add", "name": name, "userId": user_obj.id})
    return {"success": True, "message": "User added successfully", "userId": user_obj.id}


@router.put("/users/manual")
def batch_generate(
    payload: BatchUsersCreate,
    user: auth.UserIdentity = Depends(auth.require_auth),
    db: Session = Depends(get_db),
):
    count = payload.count
    start_from = payload.startFrom
    room_id = payload.roomId
    if not count or count < 1:
        raise HTTPException(status_code=400, detail="Valid count is required")
    if not room_id:
        raise HTTPException(status_code=400, detail="roomId is required")

    _check_room_owner(room_id, user, db)

    room = db.execute(
        text("SELECT id FROM rooms WHERE room_id = :rid"), {"rid": room_id}
    ).mappings().first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    rid = room["id"]

    added = []
    try:
        new_users = []
        for i in range(count):
            uname = f"用户{start_from + i}"
            existing = db.execute(
                text("SELECT id FROM users WHERE name = :n AND room_id = :rid"),
                {"n": uname, "rid": rid},
            ).mappings().first()
            if not existing:
                new_users.append(models.User(name=uname, department=None, room_id=rid))
                added.append(uname)
        if new_users:
            db.add_all(new_users)
            db.execute(
                text("UPDATE rooms SET total_users = total_users + :c WHERE id = :rid"),
                {"c": len(new_users), "rid": rid},
            )
        auth.touch_room_last_used(room_id, db)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to add users: {e}")

    events.publish(room_id, "users_updated", {"action": "batch", "addedCount": len(added)})
    return {
        "success": True,
        "message": f"Successfully added {len(added)} users",
        "addedCount": len(added),
        "skippedCount": count - len(added),
        "addedUsers": added,
    }