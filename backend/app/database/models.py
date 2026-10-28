from __future__ import annotations

from typing import Any

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class SchemaVersion(Base):
    __tablename__ = "schema_version"
    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    applied_at: Mapped[str] = mapped_column(String(40))


class AgentRecord(Base):
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(80), index=True)
    kind: Mapped[str] = mapped_column(String(16))  # builtin | custom
    builtin_key: Mapped[str | None] = mapped_column(String(80), nullable=True)
    name: Mapped[str] = mapped_column(String(80))
    role: Mapped[str] = mapped_column(String(200))
    goal: Mapped[str] = mapped_column(Text)
    backstory: Mapped[str] = mapped_column(Text)
    tools: Mapped[list[str]] = mapped_column(JSON, default=list)
    llm_model: Mapped[str | None] = mapped_column(String(80), nullable=True)
    task_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    task_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    task_expected_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    workflow_order: Mapped[int] = mapped_column(Integer, default=100)
    appearance: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    workstation: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[str] = mapped_column(String(40))
    updated_at: Mapped[str] = mapped_column(String(40))


class RunRecord(Base):
    __tablename__ = "runs"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(80), index=True)
    status: Mapped[str] = mapped_column(String(16))  # queued|running|completed|failed
    inputs: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    participants: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    total_tasks: Mapped[int] = mapped_column(Integer, default=0)
    completed_tasks: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[str] = mapped_column(String(40), index=True)
    started_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    completed_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)


class TaskRecord(Base):
    __tablename__ = "run_tasks"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    key: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text)
    expected_output: Mapped[str] = mapped_column(Text)
    agent_id: Mapped[str] = mapped_column(String(40))
    agent_name: Mapped[str] = mapped_column(String(80))
    agent_role: Mapped[str] = mapped_column(String(200))
    depends_on: Mapped[list[str]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(16))  # pending|running|completed|failed
    started_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    completed_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    output_preview: Mapped[str | None] = mapped_column(Text, nullable=True)
    output_path: Mapped[str | None] = mapped_column(String(400), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)


class EventRecord(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str | None] = mapped_column(String(40), index=True, nullable=True)
    type: Mapped[str] = mapped_column(String(40), index=True)
    timestamp: Mapped[str] = mapped_column(String(40))
    level: Mapped[str] = mapped_column(String(10))  # info|success|warning|error
    agent_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    agent_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    task_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    task_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    message: Mapped[str] = mapped_column(Text)
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class ArtifactRecord(Base):
    __tablename__ = "artifacts"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))  # report|task_output|result
    filename: Mapped[str] = mapped_column(String(200))
    rel_path: Mapped[str] = mapped_column(String(400))
    size: Mapped[int] = mapped_column(Integer)
    media_type: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[str] = mapped_column(String(40))


class SettingRecord(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[Any] = mapped_column(JSON)
