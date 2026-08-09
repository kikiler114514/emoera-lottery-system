"""房间级实时事件（SSE）。

设计要点：
- mutation 端点都是同步 `def`，因此事件总线用线程安全的 `queue.Queue`，
  sync 端点里直接 `publish()` 即可，无需关心事件循环。
- SSE 端点（async）用 `loop.run_in_executor` 非阻塞地取出消息，并靠 `q.get(timeout)`
  实现心跳保活与断线检测。
- 注意：这是单进程内存方案，仅适用于单 uvicorn worker（开发/小规模部署）。
  多 worker 需换为 Redis 发布订阅等外部总线。
"""

import asyncio
import json
import queue
import threading
from typing import Dict, List

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

router = APIRouter(tags=["events"])

# room_id -> 该房间的订阅者队列列表（线程安全）
_subscribers: Dict[str, List[queue.Queue]] = {}
_lock = threading.Lock()


def publish(room_id: str, event_type: str, payload: dict | None = None) -> None:
    """向某房间的所有订阅者推送事件。在 sync 端点中直接调用，线程安全。"""
    with _lock:
        subs = _subscribers.get(room_id)
    if not subs:
        return
    message = json.dumps(
        {"type": event_type, **(payload or {})},
        ensure_ascii=False,
    )
    # 复制一份，避免迭代期间被 unsubscribe 修改
    for q in list(subs):
        try:
            q.put_nowait(message)
        except Exception:
            pass


@router.get("/events")
async def sse_events(roomId: str, request: Request):
    """房间事件流。前端用 EventSource 订阅，无需鉴权（仅按 roomId 隔离）。"""
    loop = asyncio.get_event_loop()
    q: "queue.Queue[str]" = queue.Queue()
    with _lock:
        _subscribers.setdefault(roomId, []).append(q)

    async def event_stream():
        try:
            yield ": connected\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    # 阻塞最多 20s，超时则发心跳保活并继续
                    message = await loop.run_in_executor(
                        None, lambda: q.get(timeout=20)
                    )
                except queue.Empty:
                    yield ": ping\n\n"
                    continue
                yield f"data: {message}\n\n"
        finally:
            with _lock:
                subs = _subscribers.get(roomId)
                if subs and q in subs:
                    subs.remove(q)
                    if not subs:
                        _subscribers.pop(roomId, None)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
