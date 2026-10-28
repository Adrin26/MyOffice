from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.agents import AgentOut

RunStatus = Literal["queued", "running", "completed", "failed"]
TaskStatus = Literal["pending", "running", "completed", "failed"]
EventLevel = Literal["info", "success", "warning", "error"]


class InputField(BaseModel):
    name: str
    label: str
    description: str = ""
    required: bool = True
    max_length: int = 500


class ProjectOut(BaseModel):
    id: str
    name: str
    description: str
    process: str
    inputs: list[InputField]
    builtin_agent_count: int
    default_inputs: dict[str, str] = Field(default_factory=dict)


class RunCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    inputs: dict[str, str] = Field(default_factory=dict)


class Participant(BaseModel):
    agent_id: str
    name: str
    role: str
    kind: str


class RunOut(BaseModel):
    id: str
    project_id: str
    status: RunStatus
    inputs: dict[str, Any]
    participants: list[Participant]
    total_tasks: int
    completed_tasks: int
    created_at: str
    started_at: str | None
    completed_at: str | None
    error_message: str | None
    has_result: bool


class TaskOut(BaseModel):
    id: str
    run_id: str
    position: int
    key: str
    name: str
    description: str
    expected_output: str
    agent_id: str
    agent_name: str
    agent_role: str
    depends_on: list[str]
    status: TaskStatus
    started_at: str | None
    completed_at: str | None
    output_preview: str | None
    error_message: str | None


class EventOut(BaseModel):
    id: int
    run_id: str | None
    type: str
    timestamp: str
    level: EventLevel
    agent_id: str | None
    agent_name: str | None
    task_id: str | None
    task_name: str | None
    message: str
    data: dict[str, Any]


class ArtifactOut(BaseModel):
    id: str
    run_id: str
    kind: str
    filename: str
    size: int
    media_type: str
    created_at: str
    url: str


class ResultSection(BaseModel):
    id: str
    title: str
    kind: str
    markdown: str


class ResultTaskOutput(BaseModel):
    task_id: str
    key: str
    name: str
    agent_id: str
    agent_name: str
    status: str
    markdown: str


class ResultSource(BaseModel):
    label: str
    url: str


class PresentationResult(BaseModel):
    run_id: str
    status: Literal["completed", "partial", "failed"]
    warning: str | None
    title: str
    summary: str | None
    sections: list[ResultSection]
    task_outputs: list[ResultTaskOutput]
    sources: list[ResultSource]
    report_markdown: str | None
    artifacts: list[ArtifactOut]
    generated_at: str


class StateSnapshot(BaseModel):
    server_time: str
    project: ProjectOut
    agents: list[AgentOut]
    active: bool
    current_run: RunOut | None
    tasks: list[TaskOut]
    recent_events: list[EventOut]
    last_event_id: int


class AppSettings(BaseModel):
    default_topic: str = Field("", max_length=500)
    auto_present: bool = True


class AppSettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    default_topic: str | None = Field(None, max_length=500)
    auto_present: bool | None = None


class HealthOut(BaseModel):
    status: str
    version: str
    crewai_version: str
    openai_key_configured: bool
    ollama_available: bool
    schema_version: int
    active_run_id: str | None
