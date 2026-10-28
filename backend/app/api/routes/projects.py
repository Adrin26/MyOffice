from fastapi import APIRouter, Depends

from app.api.deps import get_container
from app.container import Container
from app.core.errors import NotFoundError
from app.schemas.runs import ProjectOut, RunCreate, RunOut

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _check_project(project_id: str, c: Container) -> None:
    if project_id != c.project.id:
        raise NotFoundError(f"Project '{project_id}' not found")


@router.get("", response_model=list[ProjectOut])
def list_projects(c: Container = Depends(get_container)):
    return [c.manager.project_out()]


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: str, c: Container = Depends(get_container)):
    _check_project(project_id, c)
    return c.manager.project_out()


@router.post("/{project_id}/runs", response_model=RunOut, status_code=202)
def start_run(project_id: str, body: RunCreate, c: Container = Depends(get_container)):
    """Start the real CrewAI workflow in the background. 409 if one is already running."""
    _check_project(project_id, c)
    return c.manager.start_run(body.inputs)
