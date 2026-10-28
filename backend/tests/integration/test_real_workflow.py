"""Runs the real learn_crewai.py workflow through the backend (costs OpenAI credits).

Enable with:  $env:RUN_REAL_CREWAI = "1";  python -m pytest -m integration
"""
import os

import pytest
from dotenv import load_dotenv
from fastapi.testclient import TestClient

from app.core.config import ROOT_DIR
from app.main import create_app
from app.services.crewai_service import CrewAIService
from tests.conftest import wait_for_run

load_dotenv(ROOT_DIR / ".env")

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        os.getenv("RUN_REAL_CREWAI") != "1" or not os.getenv("OPENAI_API_KEY"),
        reason="set RUN_REAL_CREWAI=1 and OPENAI_API_KEY to run the real workflow",
    ),
]


def test_real_workflow_end_to_end(settings):
    app = create_app(settings, CrewAIService())
    with TestClient(app) as client:
        resp = client.post("/api/projects/ai-research-team/runs",
                           json={"inputs": {"topic": "Benefits of remote work for small teams"}})
        assert resp.status_code == 202, resp.text
        run = wait_for_run(client, resp.json()["id"], timeout=600)
        assert run["status"] == "completed", run["error_message"]
        tasks = client.get(f"/api/runs/{run['id']}/tasks").json()
        assert [t["status"] for t in tasks] == ["completed"] * 3
        types = {e["type"] for e in client.get(f"/api/runs/{run['id']}/events").json()}
        assert {"task.started", "agent.progress", "task.completed", "workflow.completed"} <= types
        result = client.get(f"/api/runs/{run['id']}/results").json()
        assert result["status"] == "completed" and result["report_markdown"]
        assert (settings.runs_dir / run["id"] / "report.md").is_file()
