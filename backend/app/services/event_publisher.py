"""Persist-then-broadcast event publishing.

Every event is first written to SQLite (giving it a monotonically increasing id)
and only then pushed to live WebSocket subscribers. Clients use the id to drop
duplicates and to reconcile with a state snapshot after reconnecting.
"""
from __future__ import annotations

import asyncio
import logging
import threading
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select

from app.core.time import utcnow_iso
from app.database.models import EventRecord
from app.database.session import Database
from app.schemas.runs import EventOut

log = logging.getLogger(__name__)

QUEUE_SIZE = 1000


def event_to_out(rec: EventRecord) -> EventOut:
    return EventOut(
        id=rec.id, run_id=rec.run_id, type=rec.type, timestamp=rec.timestamp, level=rec.level,
        agent_id=rec.agent_id, agent_name=rec.agent_name, task_id=rec.task_id,
        task_name=rec.task_name, message=rec.message, data=rec.data or {},
    )


@dataclass(eq=False)
class Subscriber:
    queue: asyncio.Queue
    run_id: str | None = None
    overflowed: bool = field(default=False)


class EventPublisher:
    def __init__(self, db: Database):
        self.db = db
        self._lock = threading.Lock()
        self._subscribers: set[Subscriber] = set()
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop | None) -> None:
        self._loop = loop

    def subscribe(self, run_id: str | None = None) -> Subscriber:
        sub = Subscriber(queue=asyncio.Queue(maxsize=QUEUE_SIZE), run_id=run_id)
        with self._lock:
            self._subscribers.add(sub)
        return sub

    def unsubscribe(self, sub: Subscriber) -> None:
        with self._lock:
            self._subscribers.discard(sub)

    def publish(
        self,
        type: str,
        message: str,
        *,
        run_id: str | None = None,
        level: str = "info",
        agent_id: str | None = None,
        agent_name: str | None = None,
        task_id: str | None = None,
        task_name: str | None = None,
        data: dict[str, Any] | None = None,
    ) -> EventOut:
        with self._lock:
            with self.db.session() as s:
                rec = EventRecord(
                    run_id=run_id, type=type, timestamp=utcnow_iso(), level=level,
                    agent_id=agent_id, agent_name=agent_name, task_id=task_id,
                    task_name=task_name, message=message, data=data or {},
                )
                s.add(rec)
                s.flush()
                out = event_to_out(rec)
            payload = {"kind": "event", "event": out.model_dump(mode="json")}
            self._broadcast_locked(payload, run_id)
        return out

    def _broadcast_locked(self, payload: dict, run_id: str | None) -> None:
        loop = self._loop
        if loop is None or loop.is_closed():
            return
        for sub in list(self._subscribers):
            if sub.run_id is not None and sub.run_id != run_id:
                continue
            try:
                loop.call_soon_threadsafe(_offer, sub, payload)
            except RuntimeError:  # loop shutting down
                return

    def recent(self, run_id: str | None = None, limit: int = 50) -> list[EventOut]:
        with self.db.session() as s:
            q = select(EventRecord).order_by(EventRecord.id.desc()).limit(limit)
            if run_id is not None:
                q = q.where(EventRecord.run_id == run_id)
            rows = list(s.execute(q).scalars())
        return [event_to_out(r) for r in reversed(rows)]

    def last_event_id(self) -> int:
        with self.db.session() as s:
            return s.execute(select(EventRecord.id).order_by(EventRecord.id.desc()).limit(1)).scalar() or 0


def _offer(sub: Subscriber, payload: dict) -> None:
    if sub.overflowed:
        return
    try:
        sub.queue.put_nowait(payload)
    except asyncio.QueueFull:
        # The client is too slow; it gets a resync instruction and a fresh snapshot.
        sub.overflowed = True
        log.warning("WebSocket subscriber overflowed; forcing resync")
