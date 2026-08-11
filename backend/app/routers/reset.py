"""POST /api/reset-db —— 仅供调试用，会清空整库。

⚠️ 安全约束：
1. `ENABLE_DB_RESET=true` 必须显式设置，否则禁用（生产环境务必保持默认 false）。
2. 调用方必须已登录（OIDC 或 LOCAL 身份均可），否则 401。
3. 本端点无独立的"管理员角色"判定，登录身份即可——内部工具场景。
"""

from fastapi import APIRouter, Depends, HTTPException

from .. import auth
from ..config import settings
from ..database import reset_database

router = APIRouter(tags=["reset"])


@router.post("/reset-db")
def reset_db(user: auth.UserIdentity = Depends(auth.require_login)):
    # 1) 开关默认关，避免被误用 / 被远程调用清空生产库
    if not settings.ENABLE_DB_RESET:
        raise HTTPException(
            status_code=503,
            detail="reset-db 未启用（需在 .env 中显式设置 ENABLE_DB_RESET=true）",
        )
    # 2) 已登录校验（兜底，require_login 会先抛 401）
    if not user.is_authenticated:
        raise HTTPException(status_code=401, detail="请先登录")

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
