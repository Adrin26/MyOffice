from tests.conftest import VALID_AGENT


def test_builtin_agents_seeded_from_learn_crewai(client):
    agents = client.get("/api/agents").json()
    assert [a["role"] for a in agents] == ["Researcher", "Business Analyst", "Report Writer"]
    assert all(a["kind"] == "builtin" and a["participant"] for a in agents)
    assert all(a["status"] == "idle" for a in agents)
    assert sorted(a["workstation"] for a in agents) == [0, 1, 2]
    assert "{topic}" in agents[0]["goal"]


def test_create_agent_assigns_id_and_workstation(client):
    resp = client.post("/api/agents", json=VALID_AGENT)
    assert resp.status_code == 201, resp.text
    agent = resp.json()
    assert agent["id"].startswith("agt_")
    assert agent["kind"] == "custom" and agent["participant"] is True
    assert agent["workstation"] == 3
    assert agent["appearance"]["shirt_color"].startswith("#")
    assert client.get(f"/api/agents/{agent['id']}").json()["name"] == "Quinn"


def test_agent_persists_across_restart(make_client):
    with make_client() as c1:
        agent_id = c1.post("/api/agents", json=VALID_AGENT).json()["id"]
    with make_client() as c2:
        ids = [a["id"] for a in c2.get("/api/agents").json()]
        assert agent_id in ids
        assert len(ids) == 4


def _problems(resp):
    body = resp.json()
    assert resp.status_code == 422, body
    return " ".join(map(str, body["error"]["details"] or []))


def test_rejects_unknown_tool(client):
    assert "Unknown tool" in _problems(client.post("/api/agents", json={**VALID_AGENT, "tools": ["shell"]}))


def test_rejects_unapproved_model(client):
    assert "approved" in _problems(client.post("/api/agents", json={**VALID_AGENT, "llm_model": "evil-model"}))


def test_rejects_unknown_placeholders(client):
    body = {**VALID_AGENT, "task_description": "Do {something} with {topic} please"}
    assert "placeholder" in _problems(client.post("/api/agents", json=body))


def test_rejects_python_injection_fields(client):
    resp = client.post("/api/agents", json={**VALID_AGENT, "python": "os.system('x')"})
    assert resp.status_code == 422


def test_enabled_requires_task(client):
    body = {**VALID_AGENT, "task_description": None, "task_expected_output": None}
    assert "required" in _problems(client.post("/api/agents", json=body))
    body["enabled"] = False
    assert client.post("/api/agents", json=body).status_code == 201


def test_rejects_bad_appearance(client):
    body = {**VALID_AGENT, "appearance": {"shirt_color": "red"}}
    assert client.post("/api/agents", json=body).status_code == 422


def test_builtin_prompts_are_read_only(client):
    resp = client.patch("/api/agents/agt_researcher", json={"goal": "Something else entirely"})
    assert resp.status_code == 422
    resp = client.patch("/api/agents/agt_researcher", json={"name": "Riley", "appearance": {"hair_style": "cap"}})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Riley" and resp.json()["appearance"]["hair_style"] == "cap"


def test_cannot_delete_builtin(client):
    assert client.delete("/api/agents/agt_writer").status_code == 422


def test_update_and_delete_custom(client):
    agent = client.post("/api/agents", json=VALID_AGENT).json()
    resp = client.patch(f"/api/agents/{agent['id']}", json={"enabled": False, "role": "Editor"})
    assert resp.status_code == 200
    assert resp.json()["enabled"] is False and resp.json()["participant"] is False
    assert client.delete(f"/api/agents/{agent['id']}").status_code == 204
    assert client.get(f"/api/agents/{agent['id']}").status_code == 404


def test_workstation_swap(client):
    agent = client.post("/api/agents", json=VALID_AGENT).json()
    resp = client.patch(f"/api/agents/{agent['id']}", json={"workstation": 0})
    assert resp.status_code == 200
    by_id = {a["id"]: a for a in client.get("/api/agents").json()}
    assert by_id[agent["id"]]["workstation"] == 0
    assert by_id["agt_researcher"]["workstation"] == 3


def test_participant_limit(client, settings):
    for i in range(settings.max_custom_participants):
        assert client.post("/api/agents", json={**VALID_AGENT, "name": f"A{i}"}).status_code == 201
    assert client.post("/api/agents", json={**VALID_AGENT, "name": "Too many"}).status_code == 409


def test_tools_and_models_endpoints(client, monkeypatch):
    monkeypatch.delenv("SERPER_API_KEY", raising=False)
    tools = {t["key"]: t for t in client.get("/api/tools").json()}
    assert tools["calculator"]["available"] is True
    assert tools["web_search"]["available"] is False
    models = client.get("/api/models").json()
    assert "gpt-4o-mini" in models["allowed"]
    assert models["ollama_available"] is True
    local = {o["id"]: o for o in models["options"] if o["provider"] == "ollama"}
    assert set(local) == {"ollama/llama3.2:latest", "ollama/qwen2.5:7b"}
    assert local["ollama/qwen2.5:7b"]["label"] == "qwen2.5:7b"


def test_custom_agent_accepts_local_model(client):
    resp = client.post("/api/agents", json={**VALID_AGENT, "llm_model": "ollama/qwen2.5:7b"})
    assert resp.status_code == 201, resp.text
    assert resp.json()["llm_model"] == "ollama/qwen2.5:7b"
    assert "valid Ollama" in _problems(client.post("/api/agents", json={**VALID_AGENT, "llm_model": "ollama/bad name"}))


def test_builtin_model_can_be_changed_and_cleared(client):
    resp = client.patch("/api/agents/agt_researcher", json={"llm_model": "ollama/llama3.2:latest"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["llm_model"] == "ollama/llama3.2:latest"
    assert "approved" in _problems(client.patch("/api/agents/agt_writer", json={"llm_model": "evil-model"}))
    resp = client.patch("/api/agents/agt_researcher", json={"llm_model": None})
    assert resp.status_code == 200 and resp.json()["llm_model"] is None


def test_error_shape(client):
    body = client.get("/api/agents/nope").json()
    assert body["error"]["code"] == "not_found"
