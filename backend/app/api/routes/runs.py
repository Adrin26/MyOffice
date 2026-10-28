from fastapi import APIRouter, Depends, Query

from app.api.deps import get_container
from app.container import Container
from app.schemas.runs import EventOut, RunOut, StateSnapshot, TaskOut

router = APIRouter(tags=["runs"])


@router.get("/api/runs", response_model=list[RunOut])
def list_runs(limit: int = Query(50, ge=1, le=200), c: Container = Depends(get_container)):
    return c.manager.list_runs(limit)


@router.get("/api/runs/{run_id}", response_model=RunOut)
def get_run(run_id: str, c: Container = Depends(get_container)):
    return c.manager.get_run(run_id)


@router.get("/api/runs/{run_id}/tasks", response_model=list[TaskOut])
def get_run_tasks(run_id: str, c: Container = Depends(get_container)):
    return c.manager.list_tasks(run_id)


@router.get("/api/runs/{run_id}/events", response_model=list[EventOut])
def get_run_events(
    run_id: str,
    after_id: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=2000),
    c: Container = Depends(get_container),
):
    c.manager.get_run(run_id)
    return c.manager.list_events(run_id=run_id, after_id=after_id, limit=limit)


@router.get("/api/events", response_model=list[EventOut])
def search_events(
    run_id: str | None = None,
    type: str | None = Query(None, max_length=40),
    agent_id: str | None = Query(None, max_length=40),
    level: str | None = Query(None, pattern="^(info|success|warning|error)$"),
    q: str | None = Query(None, max_length=100),
    after_id: int = Query(0, ge=0),
    limit: int = Query(300, ge=1, le=2000),
    c: Container = Depends(get_container),
):
    return c.manager.list_events(run_id=run_id, after_id=after_id, limit=limit, type=type,
                                 agent_id=agent_id, level=level, q=q)


@router.get("/api/state", response_model=StateSnapshot)
def get_state(c: Container = Depends(get_container)):
    """Full state snapshot (same payload the WebSocket sends on connect)."""
    return c.manager.snapshot()


@router.post("/api/workspace/reset", status_code=204)
def reset_workspace(c: Container = Depends(get_container)):
    c.manager.reset_workspace()
