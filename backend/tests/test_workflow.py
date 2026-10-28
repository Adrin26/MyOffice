import threading

from app.core.config import Settings
from app.database.models import RunRecord, TaskRecord
from app.services.crewai_service import CrewAIService
from app.services.model_catalog import ModelCatalog
from tests.conftest import VALID_AGENT, FakeLLM, wait_for_run

PROJECT = "ai-research-team"


def start(client, topic="Property prices in Kuala Lumpur"):
    return client.post(f"/api/projects/{PROJECT}/runs", json={"inputs": {"topic": topic}})


def test_successful_run_executes_real_crew(client, behaviour, settings: Settings):
    resp = start(client)
    assert resp.status_code == 202, resp.text
    run = wait_for_run(client, resp.json()["id"])
    assert run["status"] == "completed", run
    assert run["completed_tasks"] == run["total_tasks"] == 3
    assert behaviour.calls == ["Researcher", "Business Analyst", "Report Writer"]

    tasks = client.get(f"/api/runs/{run['id']}/tasks").json()
    assert [t["status"] for t in tasks] == ["completed"] * 3
    assert [t["agent_role"] for t in tasks] == ["Researcher", "Business Analyst", "Report Writer"]
    assert tasks[2]["depends_on"] == [tasks[0]["id"], tasks[1]["id"]]

    agents = {a["id"]: a for a in client.get("/api/agents").json()}
    assert all(agents[k]["status"] == "completed" for k in ("agt_researcher", "agt_analyst", "agt_writer"))

    events = client.get(f"/api/runs/{run['id']}/events").json()
    types = [e["type"] for e in events]
    for expected in ("workflow.queued", "agent.queued", "workflow.started", "task.started",
                     "agent.started", "task.completed", "agent.completed", "result.created",
                     "workflow.completed"):
        assert expected in types, expected
    assert types.count("task.completed") == 3
    assert types.index("workflow.started") < types.index("workflow.completed")
    ids = [e["id"] for e in events]
    assert ids == sorted(ids) and len(set(ids)) == len(ids)

    # Original output behaviour: report.md written by the Report Writer task.
    assert (settings.runs_dir / run["id"] / "report.md").read_text(encoding="utf-8").startswith("# Test Report")
    assert settings.legacy_report_path.read_text(encoding="utf-8").startswith("# Test Report")


def test_results_are_normalized(client):
    run = wait_for_run(client, start(client).json()["id"])
    result = client.get(f"/api/runs/{run['id']}/results").json()
    assert result["status"] == "completed" and result["warning"] is None
    assert result["title"] == "Test Report"
    assert result["summary"] == "The fake crew produced this summary."
    assert [s["title"] for s in result["sections"]] == ["Executive Summary", "Key Findings", "Recommendations"]
    assert [s["kind"] for s in result["sections"]] == ["summary", "findings", "recommendations"]
    assert "| City | Median price |" in result["sections"][1]["markdown"]
    assert {"label": "Example", "url": "https://example.com/source"} in result["sources"]
    kinds = sorted(a["kind"] for a in result["artifacts"])
    assert kinds == ["report", "result", "task_output", "task_output", "task_output"]

    report = next(a for a in result["artifacts"] if a["kind"] == "report")
    dl = client.get(report["url"])
    assert dl.status_code == 200 and dl.text.startswith("# Test Report")


def test_duplicate_start_rejected(client, behaviour):
    behaviour.gate = threading.Event()
    first = start(client)
    assert first.status_code == 202
    second = start(client)
    assert second.status_code == 409
    assert second.json()["error"]["details"]["run_id"] == first.json()["id"]
    behaviour.gate.set()
    wait_for_run(client, first.json()["id"])
    assert start(client).status_code == 202


def test_failure_marks_task_and_agent_and_keeps_partial_results(client, behaviour):
    behaviour.fail_roles["Business Analyst"] = "LLM exploded with key sk-abcdef1234567890"
    run = wait_for_run(client, start(client).json()["id"])
    assert run["status"] == "failed"
    assert "sk-abcdef" not in run["error_message"] and "[redacted]" in run["error_message"]

    tasks = client.get(f"/api/runs/{run['id']}/tasks").json()
    assert [t["status"] for t in tasks] == ["completed", "failed", "pending"]

    agents = {a["id"]: a for a in client.get("/api/agents").json()}
    assert agents["agt_researcher"]["status"] == "completed"
    assert agents["agt_analyst"]["status"] == "error"
    assert agents["agt_analyst"]["error_message"]
    assert agents["agt_writer"]["status"] == "idle"

    types = [e["type"] for e in client.get(f"/api/runs/{run['id']}/events").json()]
    assert "task.failed" in types and "agent.failed" in types and "workflow.failed" in types

    result = client.get(f"/api/runs/{run['id']}/results").json()
    assert result["status"] == "partial" and result["warning"]
    assert [t["key"] for t in result["task_outputs"]] == ["research"]


def test_custom_agent_participates_after_original_pipeline(client, behaviour):
    agent = client.post("/api/agents", json=VALID_AGENT).json()
    run = wait_for_run(client, start(client).json()["id"])
    assert run["status"] == "completed"
    assert behaviour.calls == ["Researcher", "Business Analyst", "Report Writer", "Fact Checker"]
    tasks = client.get(f"/api/runs/{run['id']}/tasks").json()
    assert tasks[-1]["agent_id"] == agent["id"] and tasks[-1]["status"] == "completed"
    assert agent["id"] in [p["agent_id"] for p in run["participants"]]
    # The presentation still uses the Report Writer's report.
    assert client.get(f"/api/runs/{run['id']}/results").json()["title"] == "Test Report"


def test_disabled_custom_agent_does_not_participate(client, behaviour):
    client.post("/api/agents", json={**VALID_AGENT, "enabled": False})
    wait_for_run(client, start(client).json()["id"])
    assert "Fact Checker" not in behaviour.calls


def test_participant_cannot_be_deleted_during_run(client, behaviour):
    agent = client.post("/api/agents", json=VALID_AGENT).json()
    behaviour.gate = threading.Event()
    run_id = start(client).json()["id"]
    assert client.delete(f"/api/agents/{agent['id']}").status_code == 409
    assert client.patch(f"/api/agents/{agent['id']}", json={"enabled": False}).status_code == 409
    behaviour.gate.set()
    wait_for_run(client, run_id)
    assert client.delete(f"/api/agents/{agent['id']}").status_code == 204
    # History keeps the removed agent's name.
    assert client.get(f"/api/runs/{run_id}/tasks").json()[-1]["agent_name"] == "Quinn"


def test_invalid_inputs(client):
    assert start(client, topic="   ").status_code == 422
    resp = client.post(f"/api/projects/{PROJECT}/runs", json={"inputs": {"topic": "x", "evil": "y"}})
    assert resp.status_code == 422
    assert client.post("/api/projects/nope/runs", json={"inputs": {"topic": "x"}}).status_code == 404


def test_missing_api_key_reports_not_ready(make_client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with make_client(CrewAIService()) as client:
        resp = start(client)
        assert resp.status_code == 503
        assert "OPENAI_API_KEY" in resp.json()["error"]["message"]


def test_each_agent_gets_its_own_model(make_client, behaviour):
    requested: list[str | None] = []

    def factory(model):
        requested.append(model)
        return FakeLLM(model=model or "fake-model", behaviour=behaviour)

    with make_client(CrewAIService(llm_factory=factory)) as client:
        client.patch("/api/agents/agt_researcher", json={"llm_model": "ollama/qwen2.5:7b"})
        client.post("/api/agents", json={**VALID_AGENT, "llm_model": "ollama/llama3.2:latest"})
        run = wait_for_run(client, start(client).json()["id"])
        assert run["status"] == "completed"
    assert "ollama/qwen2.5:7b" in requested and "ollama/llama3.2:latest" in requested
    assert None in requested  # analyst and writer keep the default model


def test_local_only_run_needs_no_openai_key_but_needs_installed_models(make_client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with make_client(CrewAIService()) as client:
        for key in ("researcher", "analyst"):
            client.patch(f"/api/agents/agt_{key}", json={"llm_model": "ollama/qwen2.5:7b"})
        client.patch("/api/agents/agt_writer", json={"llm_model": "ollama/mistral:7b"})
        resp = start(client)
        assert resp.status_code == 503
        message = resp.json()["error"]["message"]
        assert "OPENAI_API_KEY" not in message
        assert "ollama pull mistral:7b" in message

        monkeypatch.setattr(ModelCatalog, "ollama_models", lambda self: None)
        assert "not reachable" in start(client).json()["error"]["message"]


def test_restart_marks_interrupted_runs_failed_and_keeps_history(make_client, settings):
    with make_client() as c1:
        run = wait_for_run(c1, start(c1).json()["id"])
        container = c1.app.state.container
        with container.db.session() as s:
            s.add(RunRecord(id="run_aaaaaaaaaaaa", project_id=PROJECT, status="running",
                            inputs={"topic": "t"}, participants=[], total_tasks=1,
                            completed_tasks=0, created_at="2026-01-01T00:00:00.000Z"))
            s.flush()
            s.add(TaskRecord(id="tsk_x", run_id="run_aaaaaaaaaaaa", position=0, key="research",
                             name="n", description="d", expected_output="e", agent_id="agt_researcher",
                             agent_name="Researcher", agent_role="Researcher", depends_on=[],
                             status="running"))
    with make_client() as c2:
        stale = c2.get("/api/runs/run_aaaaaaaaaaaa").json()
        assert stale["status"] == "failed" and "Interrupted" in stale["error_message"]
        assert c2.get("/api/runs/run_aaaaaaaaaaaa/tasks").json()[0]["status"] == "failed"
        # Completed run and its results survive the restart.
        assert c2.get(f"/api/runs/{run['id']}").json()["status"] == "completed"
        assert c2.get(f"/api/runs/{run['id']}/results").json()["title"] == "Test Report"
        # Agents reflect the last displayed run after restart.
        snap = c2.get("/api/state").json()
        assert snap["current_run"]["id"] == run["id"]
        assert {a["status"] for a in snap["agents"]} == {"completed"}


def test_reset_workspace(client):
    wait_for_run(client, start(client).json()["id"])
    assert client.post("/api/workspace/reset").status_code == 204
    snap = client.get("/api/state").json()
    assert snap["current_run"] is None
    assert {a["status"] for a in snap["agents"]} == {"idle"}


def test_artifact_access_is_restricted(client):
    run = wait_for_run(client, start(client).json()["id"])
    assert client.get(f"/api/runs/{run['id']}/artifacts/../../etc").status_code == 404
    assert client.get(f"/api/runs/{run['id']}/artifacts/art_doesnotexist").status_code == 404
    assert client.get("/api/runs/..%2F..%2Fsecret/results").status_code == 404
