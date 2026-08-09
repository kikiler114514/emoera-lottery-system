from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import auth
from ..database import get_db
from .. import models
from ..schemas import ActivityCreate, ActivityUpdate

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
            GROUP BY a.id, a.activity_id, a.name, a.description,
                     a.creator_id, a.creator_name, a.created_at, a.updated_at, a.last_used_at
            ORDER BY a.created_at DESC
        """)
    ).mappings().all()
    return {"activities": [dict(r) for r in rows]}


@router.post("/activities")
def create_activity(
    payload: ActivityCreate,
    user: auth.UserIdentity = Depends(auth.require_auth),
    db: Session = Depends(get_db),
):
    """创建新活动（需登录）。"""
    if not user.is_authenticated:
        raise HTTPException(status_code=401, detail="请先登录后再创建活动")

    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Activity name is required")

    # 限额：每人最多 2 个活动
    act_count = auth.count_user_activities(user.user_id, db)
    if act_count >= auth.settings.MAX_ACTIVITIES_PER_USER:
        raise HTTPException(
            status_code=403,
            detail=f"每人最多创建 {auth.settings.MAX_ACTIVITIES_PER_USER} 个活动",
        )

    activity_id = _generate_activity_id()
    activity = models.Activity(
        activity_id=activity_id,
        name=name,
        description=payload.description or "",
        creator_id=user.user_id,
        creator_name=user.user_name,
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
        "creator_id": activity.creator_id,
        "creator_name": activity.creator_name,
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
            GROUP BY a.id, a.activity_id, a.name, a.description,
                     a.creator_id, a.creator_name, a.created_at, a.updated_at, a.last_used_at
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
    payload: ActivityUpdate,
    user: auth.UserIdentity = Depends(auth.require_auth),
    db: Session = Depends(get_db),
):
    """更新活动信息（仅创建者可改）。"""
    if not auth.check_activity_owner(activity_id, user, db):
        raise HTTPException(status_code=403, detail="只有活动创建者才能修改活动")

    updates = []
    params = {"aid": activity_id}
    if payload.name and payload.name.strip():
        updates.append("name = :name")
        params["name"] = payload.name.strip()
    if payload.description is not None:
        updates.append("description = :desc")
        params["desc"] = payload.description or ""

    if not updates:
        return {"success": True, "message": "Nothing to update"}

    result = db.execute(
        text(f"UPDATE activities SET {', '.join(updates)} WHERE activity_id = :aid"),
        params,
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
    user: auth.UserIdentity = Depends(auth.require_auth),
    db: Session = Depends(get_db),
):
    """删除活动（仅创建者可删，关联房间的 activity_id 会被置为 NULL）。"""
    if not auth.check_activity_owner(activity_id, user, db):
        raise HTTPException(status_code=403, detail="只有活动创建者才能删除活动")

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