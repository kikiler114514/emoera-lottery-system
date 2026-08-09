from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import Optional

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
    db: Session = Depends(get_db),
):
    room_id = payload.roomId
    if not room_id or not isinstance(room_id, str):
        raise HTTPException(status_code=400, detail="Valid room ID is required")

    existing = db.execute(
        text("""
            SELECT r.room_id, r.name, r.description,
              (SELECT COUNT(*) FROM users WHERE room_id = r.id) as total_users,
              (SELECT COUNT(*) FROM lottery_winners WHERE room_id = r.id) as current_winners
            FROM rooms r
            WHERE r.room_id = :rid
        """),
        {"rid": room_id},
    ).mappings().first()
    if existing:
        return {"room": dict(existing), "message": "Room already exists"}

    room_name = payload.name or f"抽奖房间 {room_id.upper()}"
    description = payload.description or f"房间ID: {room_id}"
    activity_id: Optional[int] = None
    if payload.activityId:
        act = db.execute(
            text("SELECT id FROM activities WHERE activity_id = :aid"),
            {"aid": payload.activityId},
        ).mappings().first()
        if act:
            activity_id = act["id"]

    room = models.Room(
        room_id=room_id,
        name=room_name,
        description=description,
        total_users=0,
        current_winners=0,
        activity_id=activity_id,
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
def delete_room(room_id: str, db: Session = Depends(get_db)):
    """删除房间，级联删除其下的所有参与者和中奖记录。"""
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
