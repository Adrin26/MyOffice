from __future__ import annotations

import os
from collections.abc import Callable
from dataclasses import dataclass

from crewai.tools import BaseTool

from app.schemas.agents import ToolOut
from app.tools.builtin_tools import CalculatorTool, FetchWebpageTool, WebSearchTool


@dataclass(frozen=True)
class ToolSpec:
    key: str
    label: str
    description: str
    factory: Callable[[], BaseTool]
    requires_env: tuple[str, ...] = ()

    def missing_env(self) -> list[str]:
        return [name for name in self.requires_env if not os.getenv(name)]


TOOL_REGISTRY: dict[str, ToolSpec] = {
    spec.key: spec
    for spec in [
        ToolSpec("calculator", "Calculator", "Safe arithmetic on numbers.", CalculatorTool),
        ToolSpec(
            "fetch_webpage", "Fetch web page",
            "Read the text of a public web page (no private or local addresses).",
            FetchWebpageTool,
        ),
        ToolSpec(
            "web_search", "Web search (Serper)",
            "Search the web via Serper.dev. Requires SERPER_API_KEY on the backend.",
            WebSearchTool, requires_env=("SERPER_API_KEY",),
        ),
    ]
}


def list_tools() -> list[ToolOut]:
    out = []
    for spec in TOOL_REGISTRY.values():
        missing = spec.missing_env()
        out.append(
            ToolOut(
                key=spec.key, label=spec.label, description=spec.description,
                available=not missing,
                unavailable_reason=f"Missing {', '.join(missing)}" if missing else None,
            )
        )
    return out


def validate_tool_keys(keys: list[str]) -> list[str]:
    """Return a list of problems; empty when all keys are allowed."""
    problems = []
    if len(set(keys)) != len(keys):
        problems.append("Duplicate tools selected")
    for key in keys:
        spec = TOOL_REGISTRY.get(key)
        if spec is None:
            problems.append(f"Unknown tool '{key}'")
    return problems


def instantiate_tools(keys: list[str]) -> list[BaseTool]:
    tools = []
    for key in keys:
        spec = TOOL_REGISTRY[key]
        if spec.missing_env():
            raise RuntimeError(f"Tool '{key}' is not available: missing {', '.join(spec.missing_env())}")
        tools.append(spec.factory())
    return tools
