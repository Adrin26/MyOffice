from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api import ws
from app.api.routes import agents, config, projects, results, runs
from app.container import Container, build_container
from app.core.config import Settings, get_settings
from app.core.errors import install_error_handlers
from app.services import crewai_listener
from app.services.crewai_service import CrewAIService

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def create_app(settings: Settings | None = None, crew_service: CrewAIService | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        container: Container = build_container(settings, crew_service)
        container.publisher.bind_loop(asyncio.get_running_loop())
        crewai_listener.install(container.manager)
        app.state.container = container
        try:
            yield
        finally:
            crewai_listener.install(None)
            container.publisher.bind_loop(None)
            container.db.dispose()

    app = FastAPI(
        title="CrewAI Workplace API",
        version=__version__,
        description="Backend for the Roblox-inspired 3D CrewAI workplace.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Content-Type"],
    )
    install_error_handlers(app)
    for module in (config, agents, projects, runs, results):
        app.include_router(module.router)
    app.include_router(ws.router)
    return app


app = create_app()
