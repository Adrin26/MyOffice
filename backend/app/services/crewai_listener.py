"""Bridge from CrewAI's global event bus to the active WorkflowManager.

CrewAI's bus is process-global, so handlers are registered once and forward to
whichever manager is currently installed (tests install a fresh one per app).
"""
from __future__ import annotations

import logging
import threading
from typing import Any, Protocol

from crewai.events import crewai_event_bus
from crewai.events.types.agent_events import (
    AgentExecutionCompletedEvent, AgentExecutionErrorEvent, AgentExecutionStartedEvent,
)
from crewai.events.types.llm_events import (
    LLMCallCompletedEvent, LLMCallFailedEvent, LLMCallStartedEvent,
)
from crewai.events.types.task_events import TaskCompletedEvent, TaskFailedEvent, TaskStartedEvent
from crewai.events.types.tool_usage_events import (
    ToolUsageErrorEvent, ToolUsageFinishedEvent, ToolUsageStartedEvent,
)

log = logging.getLogger(__name__)

EVENT_KINDS: dict[type, str] = {
    TaskStartedEvent: "task_started",
    TaskCompletedEvent: "task_completed",
    TaskFailedEvent: "task_failed",
    AgentExecutionStartedEvent: "agent_started",
    AgentExecutionCompletedEvent: "agent_completed",
    AgentExecutionErrorEvent: "agent_error",
    LLMCallStartedEvent: "llm_started",
    LLMCallCompletedEvent: "llm_completed",
    LLMCallFailedEvent: "llm_failed",
    ToolUsageStartedEvent: "tool_started",
    ToolUsageFinishedEvent: "tool_finished",
    ToolUsageErrorEvent: "tool_error",
}


class EventSink(Protocol):
    def on_crewai_event(self, kind: str, event: Any) -> None: ...


_target: EventSink | None = None
_registered = False
_reg_lock = threading.Lock()


def install(sink: EventSink | None) -> None:
    global _target, _registered
    with _reg_lock:
        _target = sink
        if _registered:
            return
        for event_type, kind in EVENT_KINDS.items():
            crewai_event_bus.on(event_type)(_make_handler(kind))
        _registered = True


def _make_handler(kind: str):
    def handler(_source: Any, event: Any) -> None:
        sink = _target
        if sink is None:
            return
        try:
            sink.on_crewai_event(kind, event)
        except Exception:  # never break the crew because monitoring failed
            log.exception("Failed to process CrewAI event %s", kind)

    handler.__name__ = f"workplace_{kind}"
    return handler


def flush(timeout: float = 15.0) -> None:
    try:
        crewai_event_bus.flush(timeout=timeout)
    except Exception:
        log.warning("CrewAI event bus flush failed", exc_info=True)
