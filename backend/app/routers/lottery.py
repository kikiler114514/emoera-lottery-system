import random

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from . import events
from ..schemas import LotteryDraw, LotteryReset

router = APIRouter(tags=["lottery"])


@router.post("/lottery")
def draw(
    payload: LotteryDraw,
    db: Session = Depends(get_db),
):
    room_id = payload.roomId
    if not room_id:
        raise HTTPException(status_code=400, detail="roomId is required")

    room = db.execute(
        text("SELECT id FROM rooms WHERE room_id = :rid"), {"rid": room_id}
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
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to conduct lottery: {e}")

    events.publish(
        room_id,
        "lottery_drawn",
        {"roundNumber": round_number, "winnerIds": [w["id"] for w in shuffled]},
    )

    winners = [
        {"id": w["id"], "name": w["name"], "department": w["department"]}
        for w in shuffled
    ]
    return {"success": True, "roundNumber": round_number, "winners": winners}


@router.put("/lottery")
def reset_room_winners(
    payload: LotteryReset,
    db: Session = Depends(get_db),
):
    room_id = payload.roomId
    if not room_id:
        raise HTTPException(status_code=400, detail="roomId is required")

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
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to reset: {e}")

    events.publish(room_id, "lottery_reset")
    return {"success": True, "message": "Room reset successfully"}
