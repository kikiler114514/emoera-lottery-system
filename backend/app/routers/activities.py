from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..schemas import ActivityCreate

router = APIRouter(tags=["activities"])


def _generate_activity_id() -> str:
    import secrets
    import string
    chars = string.ascii_lowercase + string.digits
    return ''.join(secrets.choice(chars) for _ in range(8))


@router.get("/activities")
def list_activities(db: Session = Depends(get_db)):
    """列出所有活动，附带聚合统计"""
    rows = db.execute(
        text("""
            SELECT a.*,
              COUNT(DISTINCT r.id) as room_count,
              COALESCE(SUM(r.total_users), 0) as total_users,
              COALESCE(SUM(r.current_winners), 0) as total_winners
            FROM activities a
            LEFT JOIN rooms r ON a.id = r.activity_id
            GROUP BY a.id, a.activity_id, a.name, a.description, a.created_at, a.updated_at
            ORDER BY a.created_at DESC
        """)
    ).mappings().all()
    return {"activities": [dict(r) for r in rows]}


@router.post("/activities")
def create_activity(
    payload: ActivityCreate,
    db: Session = Depends(get_db),
    ):
    """创建新活动"""
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Activity name is required")

    activity_id = _generate_activity_id()
    activity = models.Activity(
        activity_id=activity_id,
        name=name,
        description=payload.description or "",
    )
    db.add(activity)
    try:
        db.commit()
        db.refresh(activity)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create activity")

    return {
        "id": activity.id,
        "activity_id": activity.activity_id,
        "name": activity.name,
        "description": activity.description,
        "created_at": str(activity.created_at),
    }


@router.get("/activities/{activity_id}")
def get_activity(activity_id: str, db: Session = Depends(get_db)):
    """活动详情 + 关联房间列表"""
    activity = db.execute(
        text("""
            SELECT a.*,
              COUNT(DISTINCT r.id) as room_count,
              COALESCE(SUM(r.total_users), 0) as total_users,
              COALESCE(SUM(r.current_winners), 0) as total_winners
            FROM activities a
            LEFT JOIN rooms r ON a.id = r.activity_id
            WHERE a.activity_id = :aid
            GROUP BY a.id, a.activity_id, a.name, a.description, a.created_at, a.updated_at
        """),
        {"aid": activity_id},
    ).mappings().first()

    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    rooms = db.execute(
        text("""
            SELECT r.*,
              (SELECT COUNT(*) FROM users WHERE room_id = r.id) as total_users,
              (SELECT COUNT(*) FROM lottery_winners WHERE room_id = r.id) as current_winners
            FROM rooms r
            WHERE r.activity_id = :aid
            ORDER BY r.created_at ASC
        """),
        {"aid": activity["id"]},
    ).mappings().all()

    return {
        "activity": dict(activity),
        "rooms": [dict(r) for r in rooms],
    }


@router.get("/activities/{activity_id}/history")
def get_activity_history(activity_id: str, db: Session = Depends(get_db)):
    """活动维度的抽奖历史（所有房间的汇总）"""
    activity = db.execute(
        text("SELECT id FROM activities WHERE activity_id = :aid"),
        {"aid": activity_id},
    ).mappings().first()

    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    rows = db.execute(
        text("""
            SELECT lw.id, lw.round_number, lw.won_at, lw.prize_name,
              u.name as winner_name, u.department as winner_department,
              r.room_id, r.name as room_name
            FROM lottery_winners lw
            JOIN users u ON lw.user_id = u.id
            JOIN rooms r ON lw.room_id = r.id
            WHERE r.activity_id = :aid
            ORDER BY lw.won_at DESC, lw.round_number DESC
        """),
        {"aid": activity["id"]},
    ).mappings().all()

    return {"records": [dict(r) for r in rows]}


@router.put("/activities/{activity_id}")
def update_activity(
    activity_id: str,
    payload: ActivityCreate,
    db: Session = Depends(get_db),
    ):
    """更新活动信息"""
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Activity name is required")

    result = db.execute(
        text("UPDATE activities SET name = :name, description = :desc WHERE activity_id = :aid"),
        {"name": name, "desc": payload.description or "", "aid": activity_id},
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Activity not found")
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update activity")
    return {"success": True, "message": "Activity updated"}


@router.delete("/activities/{activity_id}")
def delete_activity(
    activity_id: str,
    db: Session = Depends(get_db),
    ):
    """删除活动（关联房间的 activity_id 会被置为 NULL）"""
    result = db.execute(
        text("DELETE FROM activities WHERE activity_id = :aid"),
        {"aid": activity_id},
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Activity not found")
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete activity")
    return {"success": True, "message": "Activity deleted"}