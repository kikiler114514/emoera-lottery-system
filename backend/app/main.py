from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import init_database
from .routers import auth as auth_router
from .routers import events
from .routers import history, lottery, manual, reset, rooms, users, activities


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时建表（幂等）
    init_database()
    yield


app = FastAPI(title="EmoEra Lottery API", version="1.0.0", lifespan=lifespan)

# 开发期放开 CORS；本系统用 Bearer token 鉴权（非 cookie），故无需 credentials。
# 生产环境请将 allow_origins 改为前端真实域名。
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(rooms.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(manual.router, prefix="/api")
app.include_router(lottery.router, prefix="/api")
app.include_router(history.router, prefix="/api")
app.include_router(reset.router, prefix="/api")
app.include_router(events.router, prefix="/api")
app.include_router(auth_router.router, prefix="/api")
app.include_router(activities.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}
