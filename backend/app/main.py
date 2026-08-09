from contextlib import asynccontextmanager
import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import auth
from .database import init_database, SessionLocal
from .routers import oidc as oidc_router
from .routers import events
from .routers import history, lottery, manual, reset, rooms, users, activities


async def _periodic_cleanup():
    """每 30 分钟清理过期房间。"""
    while True:
        await asyncio.sleep(1800)
        try:
            db = SessionLocal()
            auth.cleanup_expired_rooms(db)
            db.close()
        except Exception:
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_database()
    # 启动时立即清理一次 + 后台定时
    try:
        db = SessionLocal()
        auth.cleanup_expired_rooms(db)
        db.close()
    except Exception:
        pass
    task = asyncio.create_task(_periodic_cleanup())
    yield
    task.cancel()


app = FastAPI(title="EmoEra Lottery API", version="1.0.0", lifespan=lifespan)

# 开发期放开 CORS；cookie 鉴权需要 allow_credentials=True
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(rooms.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(manual.router, prefix="/api")
app.include_router(lottery.router, prefix="/api")
app.include_router(history.router, prefix="/api")
app.include_router(reset.router, prefix="/api")
app.include_router(events.router, prefix="/api")
app.include_router(oidc_router.router, prefix="/api")
app.include_router(activities.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}
