from fastapi import APIRouter, HTTPException

from ..database import reset_database

router = APIRouter(tags=["reset"])


@router.post("/reset-db")
def reset_db():
    try:
        reset_database()
        return {
            "success": True,
            "message": "Database reset successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to reset database: {e}"
        )
