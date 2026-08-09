import json
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..database import get_db

router = APIRouter(tags=["history"])


def _named_in(ids: list) -> tuple:
    """生成 (占位符SQL, 参数dict) 用于 IN 子句。"""
    placeholders = ", ".join(f":id{i}" for i in range(len(ids)))
    params = {f"id{i}": v for i, v in enumerate(ids)}
    return placeholders, params


@router.get("/history")
def get_history(
    roomId: Optional[str] = None,
    roomIds: Optional[str] = None,
    recordType: str = "all",
    db: Session = Depends(get_db),
):
    result: dict = {}

    if recordType in ("lottery", "all"):
        if roomId:
            rows = db.execute(
                text(
                    """
                    SELECT lw.id, lw.round_number, lw.won_at, lw.prize_name,
                      u.name as winner_name, u.department as winner_department,
                      r.room_id, r.name as room_name
                    FROM lottery_winners lw
                    JOIN users u ON lw.user_id = u.id
                    JOIN rooms r ON lw.room_id = r.id
                    WHERE r.room_id = :rid
                    ORDER BY lw.won_at DESC, lw.round_number DESC
                    """
                ),
                {"rid": roomId},
            ).mappings().all()
            result["lotteryRecords"] = [dict(r) for r in rows]
        elif roomIds:
            try:
                lst = json.loads(roomIds)
                if isinstance(lst, list) and lst:
                    ph, params = _named_in(lst)
                    rows = db.execute(
                        text(
                            f"""
                            SELECT lw.id, lw.round_number, lw.won_at, lw.prize_name,
                              u.name as winner_name, u.department as winner_department,
                              r.room_id, r.name as room_name
                            FROM lottery_winners lw
                            JOIN users u ON lw.user_id = u.id
                            JOIN rooms r ON lw.room_id = r.id
                            WHERE r.room_id IN ({ph})
                            ORDER BY lw.won_at DESC, lw.round_number DESC
                            """
                        ),
                        params,
                    ).mappings().all()
                    result["lotteryRecords"] = [dict(r) for r in rows]
            except Exception:
                pass
        else:
            rows = db.execute(
                text(
                    """
                    SELECT lw.round_number, MIN(lw.won_at) as won_at, lw.prize_name, COUNT(*) as winner_count,
                      r.room_id, r.name as room_name,
                      GROUP_CONCAT(CONCAT(u.name, '(', COALESCE(u.department, ''), ')') SEPARATOR ', ') as winners
                    FROM lottery_winners lw
                    JOIN users u ON lw.user_id = u.id
                    JOIN rooms r ON lw.room_id = r.id
                    GROUP BY lw.room_id, lw.round_number, lw.prize_name, r.room_id, r.name
                    ORDER BY won_at DESC, lw.round_number DESC
                    LIMIT 100
                    """
                )
            ).mappings().all()
            result["lotteryRecords"] = [dict(r) for r in rows]

    if recordType in ("rooms", "all"):
        room_query = """
            SELECT r.room_id, r.name, r.description, r.created_at, r.total_users, r.current_winners,
              COUNT(DISTINCT lw.round_number) as total_rounds
            FROM rooms r
            LEFT JOIN lottery_winners lw ON r.id = lw.room_id
        """
        params: dict = {}
        if roomId:
            room_query += " WHERE r.room_id = :rid"
            params = {"rid": roomId}
        elif roomIds:
            try:
                lst = json.loads(roomIds)
                if isinstance(lst, list) and lst:
                    ph, p = _named_in(lst)
                    room_query += f" WHERE r.room_id IN ({ph})"
                    params = p
            except Exception:
                pass
        room_query += (
            " GROUP BY r.id, r.room_id, r.name, r.description, r.created_at, "
            "r.total_users, r.current_winners ORDER BY r.created_at DESC"
        )
        if not roomId and not roomIds:
            room_query += " LIMIT 50"

        rows = db.execute(text(room_query), params).mappings().all()
        result["roomRecords"] = [dict(r) for r in rows]

    return result
