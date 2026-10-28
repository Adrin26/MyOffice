from __future__ import annotations

import os

os.environ["CREWAI_TRACING_ENABLED"] = "false"
os.environ["CREWAI_TESTING"] = "true"
os.environ["OTEL_SDK_DISABLED"] = "true"
os.environ["CREWAI_DISABLE_TELEMETRY"] = "true"

import threading
import time
from collections.abc import Callable
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import pytest
from crewai.llms.base_llm import BaseLLM
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.services.crewai_service import CrewAIService

REPORT = """# Test Report

## Executive Summary
The fake crew produced this summary.

## Key Findings
- Finding one
- Finding two

| City | Median price |
| --- | --- |
| A | 100 |
| B | 200 |

## Recommendations
1. Do the thing. See [Example](https://example.com/source).
"""


class FakeBehaviour:
    """Shared, thread-safe control over what the fake LLM does."""

    def __init__(self) -> None:
        self.calls: list[str] = []
        self.fail_roles: dict[str, str] = {}
        self.gate: threading.Event | None = None
        self.delay = 0.0
        self._lock = threading.Lock()

    def respond(self, role: str) -> str:
        with self._lock:
            self.calls.append(role)
        if self.gate is not None:
            self.gate.wait(timeout=20)
        if self.delay:
            time.sleep(self.delay)
        if role in self.fail_roles:
            raise RuntimeError(self.fail_roles[role])
        body = REPORT if role == "Report Writer" else f"## Output from {role}\nSome content for {role}."
        return f"Thought: I now know the final answer\nFinal Answer: {body}"


class FakeLLM(BaseLLM):
    behaviour: Any = None

    def call(self, messages, tools=None, callbacks=None, available_functions=None,
             from_task=None, from_agent=None, response_model=None) -> Any:
        role = getattr(from_agent, "role", None) or "unknown"
        return self.behaviour.respond(role)


@pytest.fixture(autouse=True)
def _no_real_credentials(request, monkeypatch):
    """Unit tests must never reach OpenAI, even if a real .env is present."""
    if request.node.get_closest_marker("integration"):
        return
    monkeypatch.setattr("dotenv.load_dotenv", lambda *a, **k: False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)


@pytest.fixture
def behaviour() -> FakeBehaviour:
    return FakeBehaviour()


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        data_dir=tmp_path / "data",
        runs_dir=tmp_path / "runs",
        legacy_report_path=tmp_path / "report.md",
        database_url=None,
    )


@pytest.fixture
def fake_service(behaviour: FakeBehaviour) -> CrewAIService:
    return CrewAIService(llm_factory=lambda model: FakeLLM(model=model or "fake-model", behaviour=behaviour))


@pytest.fixture
def make_client(settings: Settings, fake_service: CrewAIService) -> Callable:
    @contextmanager
    def _make(service: CrewAIService | None = None):
        app = create_app(settings, service or fake_service)
        with TestClient(app) as client:
            yield client

    return _make


@pytest.fixture
def client(make_client):
    with make_client() as c:
        yield c


def wait_for_run(client: TestClient, run_id: str, timeout: float = 30) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        run = client.get(f"/api/runs/{run_id}").json()
        if run["status"] in ("completed", "failed") and client.get("/api/health").json()["active_run_id"] is None:
            return run
        time.sleep(0.05)
    raise AssertionError(f"run {run_id} did not finish")


VALID_AGENT = {
    "name": "Quinn",
    "role": "Fact Checker",
    "goal": "Check the final report about {topic} for unsupported claims.",
    "backstory": "A meticulous editor who flags claims that need sources.",
    "tools": ["calculator"],
    "task_name": "Fact check",
    "task_description": "Review the final report on {topic} and list claims needing verification.",
    "task_expected_output": "A bullet list of claims that need verification.",
    "enabled": True,
}
