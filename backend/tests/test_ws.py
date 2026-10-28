import json

from tests.conftest import VALID_AGENT


def recv(ws):
    return json.loads(ws.receive_text())


def recv_until(ws, predicate, limit=200):
    for _ in range(limit):
        msg = recv(ws)
        if predicate(msg):
            return msg
    raise AssertionError("expected message not received")


def test_snapshot_on_connect(client):
    with client.websocket_connect("/ws") as ws:
        msg = recv(ws)
        assert msg["kind"] == "snapshot"
        snap = msg["snapshot"]
        assert snap["project"]["id"] == "ai-research-team"
        assert len(snap["agents"]) == 3
        assert snap["active"] is False


def test_live_events_after_snapshot(client):
    with client.websocket_connect("/ws") as ws:
        snap = recv(ws)["snapshot"]
        client.post("/api/agents", json=VALID_AGENT)
        msg = recv_until(ws, lambda m: m["kind"] == "event")
        assert msg["event"]["type"] == "agent.registered"
        assert msg["event"]["id"] > snap["last_event_id"]
        assert msg["event"]["data"]["agent"]["name"] == "Quinn"


def test_run_events_stream_to_client(client):
    with client.websocket_connect("/ws") as ws:
        recv(ws)
        client.post("/api/projects/ai-research-team/runs", json={"inputs": {"topic": "AI"}})
        seen = []
        msg = recv_until(ws, lambda m: m["kind"] == "event" and (seen.append(m["event"]["type"]) or m["event"]["type"] == "workflow.completed"))
        assert msg["event"]["level"] == "success"
        assert "agent.started" in seen and "task.completed" in seen and "result.created" in seen


def test_sync_request_returns_fresh_snapshot(client):
    with client.websocket_connect("/ws") as ws:
        recv(ws)
        ws.send_text(json.dumps({"type": "ping"}))
        assert recv(ws)["kind"] == "pong"
        ws.send_text(json.dumps({"type": "sync"}))
        assert recv(ws)["kind"] == "snapshot"
        ws.send_text("not json")
        ws.send_text(json.dumps({"type": "ping"}))
        assert recv(ws)["kind"] == "pong"
