from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import Optional

from .. import auth
from ..database import get_db
from .. import models
from . import events
from ..schemas import RoomCreate

router = APIRouter(tags=["rooms"])


@router.get("/rooms")
def list_rooms(db: Session = Depends(get_db)):
    rows = db.execute(
        text(
            """
            SELECT r.*,
              (SELECT COUNT(*) FROM users WHERE room_id = r.id) as total_users,
              (SELECT COUNT(*) FROM lottery_winners WHERE room_id = r.id) as current_winners
            FROM rooms r
            ORDER BY r.created_at DESC
            """
        )
    ).mappings().all()
    return {"rooms": [dict(r) for r in rows]}


@router.post("/rooms")
def create_or_get_room(
    payload: RoomCreate,
    user: auth.UserIdentity = Depends(auth.require_auth),
    db: Session = Depends(get_db),
):
    room_id = payload.roomId
    if not room_id or not isinstance(room_id, str):
        raise HTTPException(status_code=400, detail="Valid room ID is required")

    # 已有房间：直接返回（任何人可获取）
    existing = db.execute(
        text("""
            SELECT r.room_id, r.name, r.description, r.creator_id, r.creator_name,
              (SELECT COUNT(*) FROM users WHERE room_id = r.id) as total_users,
              (SELECT COUNT(*) FROM lottery_winners WHERE room_id = r.id) as current_winners
            FROM rooms r
            WHERE r.room_id = :rid
        """),
        {"rid": room_id},
    ).mappings().first()
    if existing:
        auth.touch_room_last_used(room_id, db)
        db.commit()
        return {"room": dict(existing), "message": "Room already exists"}

    # 创建新房间：必须登录
    if not user.is_authenticated:
        raise HTTPException(status_code=401, detail="请先登录后再创建房间")

    # 先解析活动（若传了 activityId），因为限额规则依赖是否在活动内
    activity_id: Optional[int] = None
    if payload.activityId:
        act = db.execute(
            text("SELECT id, creator_id FROM activities WHERE activity_id = :aid"),
            {"aid": payload.activityId},
        ).mappings().first()
        if act:
            activity_id = act["id"]
            # 活动内限额检查：每个活动最多 MAX_ROOMS_PER_ACTIVITY 个房间
            act_room_count = auth.count_activity_rooms(activity_id, db)
            if act_room_count >= auth.settings.MAX_ROOMS_PER_ACTIVITY:
                raise HTTPException(
                    status_code=403,
                    detail=f"每个活动最多 {auth.settings.MAX_ROOMS_PER_ACTIVITY} 个房间",
                )

    # 个人限额：非活动下的独立房间每人最多 MAX_ROOMS_PER_USER 个；
    # 活动内的房间受活动限额约束，不再叠加个人限额（否则活动创建者没法加房间）
    if activity_id is None:
        room_count = auth.count_user_rooms(user.user_id, db)
        if room_count >= auth.settings.MAX_ROOMS_PER_USER:
            raise HTTPException(
                status_code=403,
                detail=f"每人最多创建 {auth.settings.MAX_ROOMS_PER_USER} 个独立房间",
            )

    room_name = payload.name or f"抽奖房间 {room_id.upper()}"
    description = payload.description or f"房间ID: {room_id}"

    room = models.Room(
        room_id=room_id,
        name=room_name,
        description=description,
        total_users=0,
        current_winners=0,
        activity_id=activity_id,
        creator_id=user.user_id,
        creator_name=user.user_name,
    )
    db.add(room)
    try:
        db.commit()
        db.refresh(room)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create room")
    events.publish(room_id, "room_created")
    return {
        "room": {
            "id": room.id,
            "room_id": room.room_id,
            "name": room.name,
            "description": room.description,
            "creator_id": room.creator_id,
            "creator_name": room.creator_name,
            "total_users": 0,
            "current_winners": 0,
        },
        "message": "Room created successfully",
    }


@router.get("/rooms/{room_id}")
def get_room(room_id: str, db: Session = Depends(get_db)):
    row = db.execute(
        text(
            """
            SELECT r.*,
              (SELECT COUNT(*) FROM users WHERE room_id = r.id) as total_users,
              (SELECT COUNT(*) FROM lottery_winners WHERE room_id = r.id) as current_winners
            FROM rooms r
            WHERE r.room_id = :rid
            """
        ),
        {"rid": room_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Room not found")
    return {"room": dict(row)}


@router.delete("/rooms/{room_id}")
def delete_room(
    room_id: str,
    user: auth.UserIdentity = Depends(auth.require_auth),
    db: Session = Depends(get_db),
):
    """删除房间，级联删除其下的所有参与者和中奖记录（仅创建者可删）。"""
    # 先判断房间是否存在，再判断权限，避免不存在的房间误返回403
    existing = db.execute(
        text("SELECT creator_id FROM rooms WHERE room_id = :rid"),
        {"rid": room_id},
    ).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Room not found")
    if not user.is_authenticated or existing[0] != user.user_id:
        raise HTTPException(status_code=403, detail="只有房间创建者才能删除房间")
    result = db.execute(
        text("DELETE FROM rooms WHERE room_id = :rid"),
        {"rid": room_id},
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Room not found")
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete room")
    return {"success": True, "message": "Room deleted successfully"}