from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse

from app.api.deps import get_container
from app.container import Container
from app.schemas.runs import ArtifactOut, PresentationResult

router = APIRouter(tags=["results"])


@router.get("/api/runs/{run_id}/results", response_model=PresentationResult)
def get_results(run_id: str, c: Container = Depends(get_container)):
    return c.results.get_result(run_id)


@router.get("/api/runs/{run_id}/artifacts", response_model=list[ArtifactOut])
def list_artifacts(run_id: str, c: Container = Depends(get_container)):
    c.manager.get_run(run_id)
    return c.results.artifacts(run_id)


@router.get("/api/runs/{run_id}/artifacts/{artifact_id}")
def download_artifact(run_id: str, artifact_id: str, c: Container = Depends(get_container)):
    """Artifacts are addressed by id only; arbitrary paths are never accepted."""
    rec, path = c.results.artifact_path(run_id, artifact_id)
    return FileResponse(path, media_type=rec.media_type, filename=rec.filename)
