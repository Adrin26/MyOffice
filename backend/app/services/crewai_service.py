"""The only place the backend constructs or runs CrewAI objects."""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from crewai import LLM, Agent, Task

from app.core.errors import NotReadyError
from app.database.models import AgentRecord
from app.projects import BuiltCrew, ProjectDefinition
from app.services.model_catalog import ModelCatalog, is_ollama
from app.services.tool_registry import instantiate_tools

LLMFactory = Callable[[str | None], Any]


@dataclass
class PlannedTask:
    key: str
    name: str
    description: str
    expected_output: str
    agent: AgentRecord


class CrewAIService:
    """Builds fresh crews per run.

    `llm_factory` lets tests substitute a fake LLM; when it is None real
    OpenAI or local Ollama models are used, depending on each agent's model.
    """

    def __init__(self, llm_factory: LLMFactory | None = None, catalog: ModelCatalog | None = None):
        self.llm_factory = llm_factory
        self.catalog = catalog

    @property
    def uses_real_llm(self) -> bool:
        return self.llm_factory is None

    def effective_model(self, model: str | None) -> str:
        return model or self.catalog.default_model

    def check_ready(self, plan: list[PlannedTask]) -> None:
        if not self.uses_real_llm:
            return
        problems = self.catalog.readiness_problems(self.effective_model(p.agent.llm_model) for p in plan)
        if problems:
            raise NotReadyError("; ".join(problems), problems)

    def resolve_llm(self, model: str | None) -> Any:
        if self.llm_factory is not None:
            return self.llm_factory(model)
        model = self.effective_model(model)
        if is_ollama(model):
            return LLM(model=model, base_url=self.catalog.ollama_base_url)
        return model

    def plan(self, project: ProjectDefinition, participants: list[AgentRecord]) -> list[PlannedTask]:
        by_builtin = {a.builtin_key: a for a in participants if a.kind == "builtin"}
        plan: list[PlannedTask] = []
        for spec in project.builtin_agents():
            agent = by_builtin.get(spec.key)
            if agent is None:
                raise NotReadyError(f"Built-in agent '{spec.key}' is missing from the registry")
            plan.append(PlannedTask(spec.task_key, spec.task_name, spec.task_description,
                                    spec.task_expected_output, agent))
        for agent in participants:
            if agent.kind != "custom":
                continue
            plan.append(PlannedTask(
                key=f"custom_{agent.id}",
                name=agent.task_name or f"{agent.name}'s task",
                description=agent.task_description or "",
                expected_output=agent.task_expected_output or "",
                agent=agent,
            ))
        return plan

    def build(self, project: ProjectDefinition, plan: list[PlannedTask], run_dir: Path) -> BuiltCrew:
        extra_agents: list[Agent] = []
        extra_tasks: list[Task] = []
        builtin_llms: dict[str, Any] = {}
        for item in plan:
            if item.agent.kind != "custom":
                if item.agent.llm_model:
                    builtin_llms[item.agent.builtin_key] = self.resolve_llm(item.agent.llm_model)
                continue
            rec = item.agent
            agent = Agent(
                role=rec.role,
                goal=rec.goal,
                backstory=rec.backstory,
                llm=self.resolve_llm(rec.llm_model),
                tools=instantiate_tools(list(rec.tools or [])),
                verbose=True,
                allow_delegation=False,
            )
            extra_agents.append(agent)
            extra_tasks.append(Task(
                name=item.name,
                description=item.description,
                expected_output=item.expected_output,
                agent=agent,
            ))
        built = project.build_crew(self.resolve_llm(None), run_dir, extra_agents, extra_tasks,
                                   agent_llms=builtin_llms)
        expected = [p.key for p in plan]
        actual = built.task_keys + [p.key for p in plan if p.agent.kind == "custom"]
        if actual != expected or len(built.crew.tasks) != len(plan):
            raise RuntimeError("Crew task layout does not match the planned workflow")
        return built
