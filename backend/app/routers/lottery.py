import random

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import auth
from ..database import get_db
from .. import models
from . import events
from ..schemas import LotteryDraw, LotteryReset

router = APIRouter(tags=["lottery"])


def _check_room_owner(room_id: str, user: auth.UserIdentity, db: Session):
    if not auth.check_room_owner(room_id, user, db):
        raise HTTPException(status_code=403, detail="只有房间创建者才能执行抽奖操作")


@router.post("/lottery")
def draw(
    payload: LotteryDraw,
    user: auth.UserIdentity = Depends(auth.require_auth),
    db: Session = Depends(get_db),
):
    """执行抽奖。

    ⚠️ 并发安全要点：
    1. 进入抽奖流程后立即用 `SELECT ... FOR UPDATE` 锁住 rooms 行（按主键 id 锁定，
       覆盖范围最小，锁持到事务提交）。
    2. round_number 计算、候选人筛选、写入 lottery_winners 必须在同一个事务内完成，
       否则两个浏览器标签同时发起抽奖会出现：
         - 两边都查到相同的"尚未中奖"候选集；
         - 两边都算出相同的 next_round。
    3. 锁释放 = db.commit()。所有写操作必须在 commit 之前。
    """
    room_id = payload.roomId
    if not room_id:
        raise HTTPException(status_code=400, detail="roomId is required")

    _check_room_owner(room_id, user, db)

    # SELECT ... FOR UPDATE 必须在事务内；SessionLocal 已 autocommit=False，
    # 第一次 execute 时 SQLAlchemy 会自动开启事务。
    room = db.execute(
        text("SELECT id FROM rooms WHERE room_id = :rid FOR UPDATE"),
        {"rid": room_id},
    ).mappings().first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    rid = room["id"]

    if payload.preventDuplicateWinners:
        rows = db.execute(
            text(
                """
                SELECT u.id, u.name, u.department FROM users u
                LEFT JOIN lottery_winners lw ON u.id = lw.user_id
                WHERE u.room_id = :rid AND lw.user_id IS NULL
                """
            ),
            {"rid": rid},
        ).mappings().all()
    else:
        rows = db.execute(
            text("SELECT id, name, department FROM users WHERE room_id = :rid"),
            {"rid": rid},
        ).mappings().all()

    if not rows:
        msg = (
            "No available users found in this room (all users have already won)"
            if payload.preventDuplicateWinners
            else "No users found in this room"
        )
        raise HTTPException(status_code=400, detail=msg)

    if len(rows) < payload.count:
        raise HTTPException(
            status_code=400,
            detail=f"Only {len(rows)} users available, but {payload.count} requested",
        )

    shuffled = random.sample(list(rows), payload.count)

    rn = db.execute(
        text(
            "SELECT COALESCE(MAX(round_number), 0) + 1 as next_round "
            "FROM lottery_winners WHERE room_id = :rid"
        ),
        {"rid": rid},
    ).mappings().first()
    round_number = rn["next_round"] if rn else 1

    try:
        for w in shuffled:
            db.add(
                models.LotteryWinner(
                    room_id=rid,
                    user_id=w["id"],
                    round_number=round_number,
                    prize_name=payload.prizeName,
                )
            )
        db.execute(
            text("UPDATE rooms SET current_winners = current_winners + :c WHERE id = :rid"),
            {"c": len(shuffled), "rid": rid},
        )
        auth.touch_room_last_used(room_id, db)
        db.commit()  # 提交后房间行锁释放
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to conduct lottery: {e}")

    # 广播抽奖结果（含候选人列表，供非创建者播放转盘动画）
    # 顺带把奖品名称一起广播：非创建者在另一浏览器窗口下没有本地的 prizeName，
    # 收到事件后才能在自己的中奖弹窗里正确展示奖品。
    all_candidates = db.execute(
        text("SELECT id, name, department FROM users WHERE room_id = :rid"),
        {"rid": rid},
    ).mappings().all()

    winners = [
        {"id": w["id"], "name": w["name"], "department": w["department"]}
        for w in shuffled
    ]

    events.publish(
        room_id,
        "lottery_drawn",
        {
            "roundNumber": round_number,
            "prizeName": payload.prizeName,
            "winners": winners,
            "candidates": [{"id": c["id"], "name": c["name"], "department": c["department"]} for c in all_candidates],
        },
    )

    return {"success": True, "roundNumber": round_number, "winners": winners}


@router.put("/lottery")
def reset_room_winners(
    payload: LotteryReset,
    user: auth.UserIdentity = Depends(auth.require_auth),
    db: Session = Depends(get_db),
):
    room_id = payload.roomId
    if not room_id:
        raise HTTPException(status_code=400, detail="roomId is required")

    _check_room_owner(room_id, user, db)

    room = db.execute(
        text("SELECT id FROM rooms WHERE room_id = :rid"), {"rid": room_id}
    ).mappings().first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    rid = room["id"]

    try:
        db.execute(
            text("DELETE FROM lottery_winners WHERE room_id = :rid"), {"rid": rid}
        )
        db.execute(
            text("UPDATE rooms SET current_winners = 0 WHERE id = :rid"), {"rid": rid}
        )
        auth.touch_room_last_used(room_id, db)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to reset: {e}")

    events.publish(room_id, "lottery_reset")
    return {"success": True, "message": "Room reset successfully"}