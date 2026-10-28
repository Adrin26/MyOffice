"""Adapter for the original `learn_crewai.py` research crew."""
from __future__ import annotations

from collections.abc import Sequence
from functools import cached_property
from pathlib import Path
from typing import Any

from crewai import Agent, Task

import learn_crewai
from app.projects.base import BuiltCrew, BuiltinAgentSpec, ProjectDefinition
from app.schemas.runs import InputField

# learn_crewai.build_agents() key -> (task key, display task name, default look)
_BUILTIN_LAYOUT: dict[str, tuple[str, str, dict[str, Any]]] = {
    "researcher": ("research", "Research brief", {
        "shirt_color": "#2563eb", "pants_color": "#1e293b", "hair_color": "#2b1b10",
        "hair_style": "short", "accessory": "glasses", "skin_color": "#f2c49b",
    }),
    "analyst": ("analysis", "Analytical brief", {
        "shirt_color": "#16a34a", "pants_color": "#374151", "hair_color": "#111827",
        "hair_style": "bun", "accessory": "tie", "skin_color": "#c98e62",
    }),
    "writer": ("writing", "Final report", {
        "shirt_color": "#f97316", "pants_color": "#312e81", "hair_color": "#a16207",
        "hair_style": "spiky", "accessory": "headset", "skin_color": "#ffd8b1",
    }),
}


class ResearchTeamProject(ProjectDefinition):
    id = "ai-research-team"
    name = "AI Research Team"
    description = (
        "The original learn_crewai.py crew: Researcher, Business Analyst and "
        "Report Writer working sequentially on a topic."
    )
    process = "sequential"
    inputs = [
        InputField(
            name="topic",
            label="Research topic",
            description="What should the AI team research?",
            required=True,
            max_length=500,
        )
    ]
    primary_task_key = "writing"

    @cached_property
    def _specs(self) -> list[BuiltinAgentSpec]:
        # Read definitions from the real Python objects so learn_crewai.py stays
        # the single source of truth. No LLM call is made here.
        agents = learn_crewai.build_agents(llm=learn_crewai.DEFAULT_MODEL)
        tasks = learn_crewai.build_tasks(agents)
        task_by_agent = {id(t.agent): (key, t) for key, t in tasks.items()}
        specs = []
        for key, agent in agents.items():
            task_key, task_name, look = _BUILTIN_LAYOUT[key]
            found_key, task = task_by_agent[id(agent)]
            assert found_key == task_key, f"unexpected task mapping for {key}"
            specs.append(
                BuiltinAgentSpec(
                    key=key,
                    name=agent.role,
                    role=agent.role,
                    goal=agent.goal,
                    backstory=agent.backstory,
                    task_key=task_key,
                    task_name=task_name,
                    task_description=task.description,
                    task_expected_output=task.expected_output,
                    appearance=look,
                )
            )
        return specs

    def builtin_agents(self) -> list[BuiltinAgentSpec]:
        return list(self._specs)

    def build_crew(
        self,
        llm: Any,
        run_dir: Path,
        extra_agents: Sequence[Agent],
        extra_tasks: Sequence[Task],
    ) -> BuiltCrew:
        report_path = run_dir / learn_crewai.REPORT_FILE
        crew = learn_crewai.build_crew(
            llm=llm,
            output_file=str(report_path),
            extra_agents=extra_agents,
            extra_tasks=extra_tasks,
        )
        base_keys = ["research", "analysis", "writing"]
        return BuiltCrew(crew=crew, task_keys=base_keys, report_path=report_path)
