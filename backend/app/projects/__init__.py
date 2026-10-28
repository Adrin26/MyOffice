from app.projects.base import BuiltCrew, BuiltinAgentSpec, ProjectDefinition
from app.projects.research_team import ResearchTeamProject

PROJECTS: dict[str, ProjectDefinition] = {p.id: p for p in [ResearchTeamProject()]}
DEFAULT_PROJECT_ID = ResearchTeamProject.id

__all__ = ["PROJECTS", "DEFAULT_PROJECT_ID", "BuiltCrew", "BuiltinAgentSpec", "ProjectDefinition"]
