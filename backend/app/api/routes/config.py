import os

import crewai
from fastapi import APIRouter, Depends

import learn_crewai
from app import __version__
from app.api.deps import get_container
from app.container import Container
from app.schemas.agents import ModelsOut, ToolOut
from app.schemas.runs import AppSettings, AppSettingsUpdate, HealthOut
from app.services.tool_registry import list_tools

router = APIRouter(tags=["config"])


@router.get("/api/health", response_model=HealthOut)
def health(c: Container = Depends(get_container)):
    return HealthOut(
        status="ok", version=__version__, crewai_version=crewai.__version__,
        openai_key_configured=bool(os.getenv("OPENAI_API_KEY")),
        schema_version=c.schema_version, active_run_id=c.manager.active_run_id,
    )


@router.get("/api/tools", response_model=list[ToolOut])
def tools():
    return list_tools()


@router.get("/api/models", response_model=ModelsOut)
def models(c: Container = Depends(get_container)):
    return ModelsOut(
        default=os.getenv("OPENAI_MODEL", learn_crewai.DEFAULT_MODEL),
        allowed=c.settings.allowed_models,
    )


@router.get("/api/settings", response_model=AppSettings)
def get_settings(c: Container = Depends(get_container)):
    return c.store.app_settings()


@router.patch("/api/settings", response_model=AppSettings)
def update_settings(body: AppSettingsUpdate, c: Container = Depends(get_container)):
    return c.store.update_app_settings(body)
