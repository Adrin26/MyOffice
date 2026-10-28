from __future__ import annotations

from dataclasses import dataclass

from app.core.config import Settings
from app.database.migrations import run_migrations
from app.database.session import Database
from app.projects import DEFAULT_PROJECT_ID, PROJECTS, ProjectDefinition
from app.services.agent_registry import AgentRegistry
from app.services.crewai_service import CrewAIService
from app.services.event_publisher import EventPublisher
from app.services.model_catalog import ModelCatalog
from app.services.result_service import ResultService
from app.services.settings_store import SettingsStore
from app.services.workflow_manager import WorkflowManager


@dataclass
class Container:
    settings: Settings
    db: Database
    project: ProjectDefinition
    registry: AgentRegistry
    publisher: EventPublisher
    results: ResultService
    store: SettingsStore
    crew_service: CrewAIService
    manager: WorkflowManager
    schema_version: int
    catalog: ModelCatalog


def build_container(settings: Settings, crew_service: CrewAIService | None = None) -> Container:
    settings.ensure_dirs()
    db = Database(settings.resolved_database_url)
    schema_version = run_migrations(db)
    project = PROJECTS[DEFAULT_PROJECT_ID]
    catalog = ModelCatalog(settings)
    registry = AgentRegistry(db, settings, project, catalog)
    registry.seed_builtins()
    publisher = EventPublisher(db)
    results = ResultService(db, settings)
    store = SettingsStore(db)
    crew_service = crew_service or CrewAIService()
    crew_service.catalog = catalog
    manager = WorkflowManager(db, settings, project, registry, crew_service, results, publisher, store)
    manager.recover()
    return Container(settings, db, project, registry, publisher, results, store, crew_service,
                     manager, schema_version, catalog)
