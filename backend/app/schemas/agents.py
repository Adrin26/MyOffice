from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

AgentStatus = Literal["idle", "queued", "working", "completed", "error"]
HairStyle = Literal["short", "spiky", "long", "bun", "cap", "bald"]
Accessory = Literal["none", "glasses", "headset", "tie", "badge"]

HEX = r"^#[0-9a-fA-F]{6}$"


class AgentAppearance(BaseModel):
    model_config = ConfigDict(extra="forbid")

    skin_color: str = Field("#f5c99b", pattern=HEX)
    shirt_color: str = Field("#3b82f6", pattern=HEX)
    pants_color: str = Field("#1f2937", pattern=HEX)
    hair_color: str = Field("#3f2a1d", pattern=HEX)
    hair_style: HairStyle = "short"
    accessory: Accessory = "none"
    scale: float = Field(1.0, ge=0.8, le=1.25)


def _strip(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    return v or None


class _AgentFields(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @field_validator(
        "name", "role", "goal", "backstory", "task_name", "task_description",
        "task_expected_output", "llm_model",
        mode="before", check_fields=False,
    )
    @classmethod
    def _strip_strings(cls, v):
        return _strip(v) if isinstance(v, str) else v


class AgentCreate(_AgentFields):
    name: str = Field(min_length=1, max_length=60)
    role: str = Field(min_length=2, max_length=120)
    goal: str = Field(min_length=5, max_length=1000)
    backstory: str = Field(min_length=5, max_length=2000)
    tools: list[str] = Field(default_factory=list, max_length=5)
    llm_model: str | None = Field(None, max_length=80)
    task_name: str | None = Field(None, max_length=80)
    task_description: str | None = Field(None, min_length=10, max_length=4000)
    task_expected_output: str | None = Field(None, min_length=5, max_length=2000)
    enabled: bool = False
    workflow_order: int = Field(100, ge=0, le=1000)
    appearance: AgentAppearance | None = None
    workstation: int | None = Field(None, ge=0, le=99)


class AgentUpdate(_AgentFields):
    name: str | None = Field(None, min_length=1, max_length=60)
    role: str | None = Field(None, min_length=2, max_length=120)
    goal: str | None = Field(None, min_length=5, max_length=1000)
    backstory: str | None = Field(None, min_length=5, max_length=2000)
    tools: list[str] | None = Field(None, max_length=5)
    llm_model: str | None = Field(None, max_length=80)
    task_name: str | None = Field(None, max_length=80)
    task_description: str | None = Field(None, min_length=10, max_length=4000)
    task_expected_output: str | None = Field(None, min_length=5, max_length=2000)
    enabled: bool | None = None
    workflow_order: int | None = Field(None, ge=0, le=1000)
    appearance: AgentAppearance | None = None
    workstation: int | None = Field(None, ge=0, le=99)


class AgentRuntime(BaseModel):
    status: AgentStatus = "idle"
    current_task: str | None = None
    current_task_id: str | None = None
    activity: str | None = None
    last_activity: str | None = None
    last_activity_at: str | None = None
    progress: float | None = None
    started_at: str | None = None
    completed_at: str | None = None
    error_message: str | None = None
    run_id: str | None = None


class AgentOut(AgentRuntime):
    id: str
    project_id: str
    kind: Literal["builtin", "custom"]
    name: str
    role: str
    goal: str
    backstory: str
    tools: list[str]
    llm_model: str | None
    task_name: str | None
    task_description: str | None
    task_expected_output: str | None
    enabled: bool
    participant: bool
    workflow_order: int
    appearance: AgentAppearance
    workstation: int | None
    created_at: str
    updated_at: str


class ToolOut(BaseModel):
    key: str
    label: str
    description: str
    available: bool
    unavailable_reason: str | None = None


class ModelsOut(BaseModel):
    default: str
    allowed: list[str]
