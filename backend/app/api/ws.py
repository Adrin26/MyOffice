"""WebSocket channel.

Protocol (server -> client):
  {"kind": "snapshot", "snapshot": StateSnapshot}   on connect and on request
  {"kind": "event", "event": EventOut}               live, ordered by event id
  {"kind": "resync"}                                 client fell behind; a snapshot follows
  {"kind": "pong"}
Client -> server: {"type": "ping"} or {"type": "sync"}.

The subscription is registered *before* the snapshot is taken, so no event can
fall between them; clients drop events whose id <= snapshot.last_event_id.
"""
from __future__ import annotations

import asyncio
import contextlib
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool

from app.api.deps import ws_container

log = logging.getLogger(__name__)
router = APIRouter()


async def _serve(websocket: WebSocket, run_id: str | None) -> None:
    c = ws_container(websocket)
    await websocket.accept()
    sub = c.publisher.subscribe(run_id)

    async def send_snapshot() -> None:
        snap = await run_in_threadpool(c.manager.snapshot, run_id)
        await websocket.send_text(json.dumps({"kind": "snapshot", "snapshot": snap.model_dump(mode="json")}))

    async def reader() -> None:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except ValueError:
                continue
            if not isinstance(msg, dict):
                continue
            if msg.get("type") == "ping":
                await websocket.send_text('{"kind":"pong"}')
            elif msg.get("type") == "sync":
                await send_snapshot()

    async def writer() -> None:
        while True:
            try:
                payload = await asyncio.wait_for(sub.queue.get(), timeout=1.0)
            except TimeoutError:
                payload = None
            if sub.overflowed:
                sub.overflowed = False
                while not sub.queue.empty():
                    sub.queue.get_nowait()
                await websocket.send_text('{"kind":"resync"}')
                await send_snapshot()
                continue
            if payload is not None:
                await websocket.send_text(json.dumps(payload))

    try:
        await send_snapshot()
        tasks = [asyncio.create_task(reader()), asyncio.create_task(writer())]
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for t in pending:
            t.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await t
        for t in done:
            exc = t.exception()
            if exc and not isinstance(exc, WebSocketDisconnect):
                log.debug("WebSocket closed: %r", exc)
    except WebSocketDisconnect:
        pass
    finally:
        c.publisher.unsubscribe(sub)


@router.websocket("/ws")
async def ws_all(websocket: WebSocket):
    await _serve(websocket, None)


@router.websocket("/ws/runs/{run_id}")
async def ws_run(websocket: WebSocket, run_id: str):
    await _serve(websocket, run_id)
