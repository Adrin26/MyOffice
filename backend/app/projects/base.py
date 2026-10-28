"""Adapter contract between the workplace backend and an existing CrewAI project.

A project definition exposes its built-in agents/tasks as read-only metadata and
knows how to build a fresh crew. The CrewAI code itself stays in the project.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from crewai import Agent, Crew, Task

from app.schemas.runs import InputField


@dataclass(frozen=True)
class BuiltinAgentSpec:
    key: str
    name: str
    role: str
    goal: str
    backstory: str
    task_key: str
    task_name: str
    task_description: str
    task_expected_output: str
    appearance: dict[str, Any] = field(default_factory=dict)


@dataclass
class BuiltCrew:
    crew: Crew
    # Keys of the project's own tasks, in crew order. Extra tasks follow them.
    task_keys: list[str]
    report_path: Path | None


class ProjectDefinition(ABC):
    id: str
    name: str
    description: str
    process: str = "sequential"
    inputs: list[InputField] = []
    # Task whose output is the main report shown on the presentation screen.
    primary_task_key: str | None = None

    @abstractmethod
    def builtin_agents(self) -> list[BuiltinAgentSpec]: ...

    @abstractmethod
    def build_crew(
        self,
        llm: Any,
        run_dir: Path,
        extra_agents: Sequence[Agent],
        extra_tasks: Sequence[Task],
    ) -> BuiltCrew: ...
