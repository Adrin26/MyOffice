"""The only place the backend constructs or runs CrewAI objects."""
from __future__ import annotations

import os
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from crewai import Agent, Task

import learn_crewai
from app.core.errors import NotReadyError
from app.database.models import AgentRecord
from app.projects import BuiltCrew, ProjectDefinition
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

    `llm_factory` lets tests substitute a fake LLM; when it is None the real
    OpenAI-backed model names are used and an API key is required.
    """

    def __init__(self, llm_factory: LLMFactory | None = None):
        self.llm_factory = llm_factory

    @property
    def uses_real_llm(self) -> bool:
        return self.llm_factory is None

    def check_ready(self) -> None:
        if self.uses_real_llm and not os.getenv("OPENAI_API_KEY"):
            raise NotReadyError("OPENAI_API_KEY is not configured on the backend")

    def resolve_llm(self, model: str | None) -> Any:
        if self.llm_factory is not None:
            return self.llm_factory(model)
        return model or os.getenv("OPENAI_MODEL", learn_crewai.DEFAULT_MODEL)

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
        for item in plan:
            if item.agent.kind != "custom":
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
        built = project.build_crew(self.resolve_llm(None), run_dir, extra_agents, extra_tasks)
        expected = [p.key for p in plan]
        actual = built.task_keys + [p.key for p in plan if p.agent.kind == "custom"]
        if actual != expected or len(built.crew.tasks) != len(plan):
            raise RuntimeError("Crew task layout does not match the planned workflow")
        return built
