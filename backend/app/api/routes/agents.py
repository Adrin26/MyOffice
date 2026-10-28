from fastapi import APIRouter, Depends, Response

from app.api.deps import get_container
from app.container import Container
from app.schemas.agents import AgentCreate, AgentOut, AgentUpdate

router = APIRouter(prefix="/api/agents", tags=["agents"])


@router.get("", response_model=list[AgentOut])
def list_agents(c: Container = Depends(get_container)):
    return c.manager.list_agents()


@router.post("", response_model=AgentOut, status_code=201)
def create_agent(body: AgentCreate, c: Container = Depends(get_container)):
    return c.manager.create_agent(body)


@router.get("/{agent_id}", response_model=AgentOut)
def get_agent(agent_id: str, c: Container = Depends(get_container)):
    return c.manager.get_agent(agent_id)


@router.patch("/{agent_id}", response_model=AgentOut)
def update_agent(agent_id: str, body: AgentUpdate, c: Container = Depends(get_container)):
    return c.manager.update_agent(agent_id, body)


@router.delete("/{agent_id}", status_code=204)
def delete_agent(agent_id: str, c: Container = Depends(get_container)):
    c.manager.delete_agent(agent_id)
    return Response(status_code=204)
