"""Workflow execution, live state and recovery.

Invariants
- At most one run is active at a time (start is rejected with 409 otherwise).
- Every run builds a fresh crew from the registry snapshot taken at start, so
  editing agents never affects a run that is already executing.
- Task and agent states only move forward (pending -> running -> done), which
  makes CrewAI's thread-pooled, possibly out-of-order events safe to apply.
- All state changes are persisted before they are broadcast.
"""
from __future__ import annotations

import logging
import re
import shutil
import threading
import uuid
from typing import Any

from sqlalchemy import select

from app.core.config import Settings
from app.core.errors import ConflictError, NotFoundError, ValidationFailed
from app.core.time import utcnow_iso
from app.database.models import EventRecord, RunRecord, TaskRecord
from app.database.session import Database
from app.projects import ProjectDefinition
from app.schemas.agents import AgentCreate, AgentOut, AgentRuntime, AgentUpdate
from app.schemas.runs import (
    EventOut, ProjectOut, RunOut, StateSnapshot, TaskOut,
)
from app.services import crewai_listener
from app.services.agent_registry import AgentRegistry
from app.services.crewai_service import CrewAIService, PlannedTask
from app.services.event_publisher import EventPublisher, event_to_out
from app.services.result_service import PREVIEW_CHARS, ResultService, TaskOutputFile
from app.services.settings_store import SettingsStore
from app.services.tool_registry import TOOL_REGISTRY

log = logging.getLogger(__name__)

TASK_RANK = {"pending": 0, "running": 1, "completed": 2, "failed": 2}
AGENT_RANK = {"idle": 0, "queued": 1, "working": 2, "completed": 3, "error": 3}
_SECRET = re.compile(r"(sk-[A-Za-z0-9_\-*]{6,}|Bearer\s+\S+)")
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def safe_error(exc: BaseException) -> str:
    text = f"{type(exc).__name__}: {exc}".strip()
    text = _SECRET.sub("[redacted]", text)
    return text[:400]


def run_to_out(r: RunRecord) -> RunOut:
    return RunOut(
        id=r.id, project_id=r.project_id, status=r.status, inputs=r.inputs or {},
        participants=r.participants or [], total_tasks=r.total_tasks,
        completed_tasks=r.completed_tasks, created_at=r.created_at, started_at=r.started_at,
        completed_at=r.completed_at, error_message=r.error_message, has_result=bool(r.result),
    )


def task_to_out(t: TaskRecord) -> TaskOut:
    return TaskOut(
        id=t.id, run_id=t.run_id, position=t.position, key=t.key, name=t.name,
        description=t.description, expected_output=t.expected_output, agent_id=t.agent_id,
        agent_name=t.agent_name, agent_role=t.agent_role, depends_on=t.depends_on or [],
        status=t.status, started_at=t.started_at, completed_at=t.completed_at,
        output_preview=t.output_preview, error_message=t.error_message,
    )


class WorkflowManager:
    def __init__(
        self,
        db: Database,
        settings: Settings,
        project: ProjectDefinition,
        registry: AgentRegistry,
        crew_service: CrewAIService,
        results: ResultService,
        publisher: EventPublisher,
        settings_store: SettingsStore,
    ):
        self.db = db
        self.settings = settings
        self.project = project
        self.registry = registry
        self.crew_service = crew_service
        self.results = results
        self.publisher = publisher
        self.store = settings_store

        self._lock = threading.RLock()
        self.active_run_id: str | None = None
        self.current_run_id: str | None = None
        self.runtime: dict[str, AgentRuntime] = {}
        self._tasks: dict[str, TaskRecord] = {}
        self._crew_task_map: dict[str, str] = {}
        self._crew_agent_map: dict[str, str] = {}
        self._thread: threading.Thread | None = None

    # ================================================================ startup
    def recover(self) -> None:
        """Close out runs that were interrupted by a backend restart."""
        now = utcnow_iso()
        interrupted: list[str] = []
        with self.db.session() as s:
            for run in s.execute(
                select(RunRecord).where(RunRecord.status.in_(("queued", "running")))
            ).scalars():
                run.status = "failed"
                run.error_message = "Interrupted: the backend stopped before the run finished."
                run.completed_at = now
                interrupted.append(run.id)
                for t in s.execute(select(TaskRecord).where(TaskRecord.run_id == run.id)).scalars():
                    if t.status == "running":
                        t.status = "failed"
                        t.error_message = "Interrupted by backend restart"
                        t.completed_at = now
        for run_id in interrupted:
            self.publisher.publish(
                "workflow.failed", "Run was interrupted by a backend restart",
                run_id=run_id, level="error", data={"interrupted": True},
            )
        with self._lock:
            self.current_run_id = self.store.get_raw("current_run_id")
            if self.current_run_id:
                with self.db.session() as s:
                    if s.get(RunRecord, self.current_run_id) is None:
                        self.current_run_id = None
            self._rebuild_runtime()

    def _rebuild_runtime(self) -> None:
        self.runtime = {}
        if not self.current_run_id:
            return
        status_map = {"pending": "idle", "running": "working", "completed": "completed", "failed": "error"}
        for t in self._load_tasks(self.current_run_id):
            rt = self.runtime.setdefault(t.agent_id, AgentRuntime(run_id=t.run_id))
            new = status_map[t.status]
            if AGENT_RANK[new] >= AGENT_RANK[rt.status]:
                rt.status = new
                rt.current_task, rt.current_task_id = t.name, t.id
                rt.started_at, rt.completed_at = t.started_at, t.completed_at
                rt.error_message = t.error_message
                rt.last_activity = {
                    "idle": "Not run", "working": "Working", "completed": "Completed task",
                    "error": "Task failed",
                }[new] + f": {t.name}"
                rt.last_activity_at = t.completed_at or t.started_at

    # ================================================================ queries
    def project_out(self) -> ProjectOut:
        return ProjectOut(
            id=self.project.id, name=self.project.name, description=self.project.description,
            process=self.project.process, inputs=self.project.inputs,
            builtin_agent_count=len(self.project.builtin_agents()),
            default_inputs={"topic": self.store.app_settings().default_topic}
            if self.store.app_settings().default_topic else {},
        )

    def agent_out(self, rec) -> AgentOut:
        rt = self.runtime.get(rec.id) or AgentRuntime()
        return AgentOut(
            **rt.model_dump(),
            id=rec.id, project_id=rec.project_id, kind=rec.kind, name=rec.name, role=rec.role,
            goal=rec.goal, backstory=rec.backstory, tools=list(rec.tools or []),
            llm_model=rec.llm_model, task_name=rec.task_name,
            task_description=rec.task_description, task_expected_output=rec.task_expected_output,
            enabled=rec.enabled, participant=rec.kind == "builtin" or rec.enabled,
            workflow_order=rec.workflow_order, appearance=rec.appearance,
            workstation=rec.workstation, created_at=rec.created_at, updated_at=rec.updated_at,
        )

    def list_agents(self) -> list[AgentOut]:
        with self._lock:
            return [self.agent_out(r) for r in self.registry.list()]

    def get_agent(self, agent_id: str) -> AgentOut:
        with self._lock:
            return self.agent_out(self.registry.get(agent_id))

    def list_runs(self, limit: int = 50) -> list[RunOut]:
        with self.db.session() as s:
            rows = s.execute(
                select(RunRecord).where(RunRecord.project_id == self.project.id)
                .order_by(RunRecord.created_at.desc()).limit(limit)
            ).scalars()
            return [run_to_out(r) for r in rows]

    def get_run(self, run_id: str) -> RunOut:
        with self.db.session() as s:
            run = s.get(RunRecord, run_id)
            if run is None:
                raise NotFoundError("Run not found")
            return run_to_out(run)

    def _load_tasks(self, run_id: str) -> list[TaskRecord]:
        with self.db.session() as s:
            return list(s.execute(
                select(TaskRecord).where(TaskRecord.run_id == run_id).order_by(TaskRecord.position)
            ).scalars())

    def list_tasks(self, run_id: str) -> list[TaskOut]:
        self.get_run(run_id)
        return [task_to_out(t) for t in self._load_tasks(run_id)]

    def list_events(
        self, run_id: str | None = None, after_id: int = 0, limit: int = 200,
        type: str | None = None, agent_id: str | None = None, level: str | None = None,
        q: str | None = None,
    ) -> list[EventOut]:
        with self.db.session() as s:
            stmt = select(EventRecord).where(EventRecord.id > after_id)
            if run_id:
                stmt = stmt.where(EventRecord.run_id == run_id)
            if type:
                stmt = stmt.where(EventRecord.type == type)
            if agent_id:
                stmt = stmt.where(EventRecord.agent_id == agent_id)
            if level:
                stmt = stmt.where(EventRecord.level == level)
            if q:
                stmt = stmt.where(EventRecord.message.ilike(f"%{q[:100]}%"))
            rows = s.execute(stmt.order_by(EventRecord.id.desc()).limit(limit)).scalars()
            return [event_to_out(r) for r in reversed(list(rows))]

    def snapshot(self, run_id: str | None = None) -> StateSnapshot:
        with self._lock:
            target = run_id or self.current_run_id
            last_id = self.publisher.last_event_id()
            run = None
            tasks: list[TaskOut] = []
            if target:
                try:
                    run = self.get_run(target)
                    tasks = self.list_tasks(target)
                except NotFoundError:
                    run = None
            return StateSnapshot(
                server_time=utcnow_iso(), project=self.project_out(), agents=self.list_agents(),
                active=self.active_run_id is not None, current_run=run, tasks=tasks,
                recent_events=self.publisher.recent(run_id=run_id, limit=80),
                last_event_id=last_id,
            )

    def locked_agent_ids(self) -> set[str]:
        with self._lock:
            if not self.active_run_id:
                return set()
            return {t.agent_id for t in self._tasks.values()}

    # ================================================================ registry
    def create_agent(self, data: AgentCreate) -> AgentOut:
        with self._lock:
            rec = self.registry.create(data)
            out = self.agent_out(rec)
            self.publisher.publish(
                "agent.registered", f"Registered new agent {rec.name} ({rec.role})",
                agent_id=rec.id, agent_name=rec.name, level="success",
                data={"agent": out.model_dump(mode="json")},
            )
            return out

    def update_agent(self, agent_id: str, data: AgentUpdate) -> AgentOut:
        with self._lock:
            before = self.registry.get(agent_id)
            rec = self.registry.update(agent_id, data, self.locked_agent_ids())
            out = self.agent_out(rec)
            self.publisher.publish(
                "agent.updated", f"Updated agent {rec.name}", agent_id=rec.id, agent_name=rec.name,
                data={"agent": out.model_dump(mode="json")},
            )
            if before.workstation != rec.workstation:
                # A swap may have moved another agent; send it too.
                for other in self.registry.list():
                    if other.id != rec.id and other.workstation == before.workstation:
                        self.publisher.publish(
                            "agent.updated", f"{other.name} moved to desk {other.workstation}",
                            agent_id=other.id, agent_name=other.name,
                            data={"agent": self.agent_out(other).model_dump(mode="json")},
                        )
            return out

    def delete_agent(self, agent_id: str) -> None:
        with self._lock:
            rec = self.registry.get(agent_id)
            self.registry.delete(agent_id, self.locked_agent_ids())
            self.runtime.pop(agent_id, None)
            self.publisher.publish(
                "agent.removed", f"Removed agent {rec.name} from the registry",
                agent_id=agent_id, agent_name=rec.name, level="warning",
                data={"agent_id": agent_id},
            )

    # ================================================================ control
    def reset_workspace(self) -> None:
        with self._lock:
            if self.active_run_id:
                raise ConflictError("Cannot reset while a workflow is running")
            self.current_run_id = None
            self.store.set_raw("current_run_id", None)
            self.runtime = {}
            self.publisher.publish("workspace.reset", "Workspace reset; agents returned to idle")

    def _validate_inputs(self, inputs: dict[str, str]) -> dict[str, str]:
        allowed = {f.name: f for f in self.project.inputs}
        unknown = set(inputs) - set(allowed)
        problems = [f"Unknown input '{k}'" for k in sorted(unknown)]
        clean: dict[str, str] = {}
        for name, field in allowed.items():
            value = _CONTROL.sub("", (inputs.get(name) or "")).strip()
            if field.required and not value:
                problems.append(f"'{field.label}' is required")
            if len(value) > field.max_length:
                problems.append(f"'{field.label}' must be at most {field.max_length} characters")
            clean[name] = value
        if problems:
            raise ValidationFailed("Invalid workflow inputs", problems)
        return clean

    def start_run(self, inputs: dict[str, str]) -> RunOut:
        inputs = self._validate_inputs(inputs)
        with self._lock:
            if self.active_run_id:
                raise ConflictError(
                    "A workflow is already running", {"run_id": self.active_run_id}
                )
            self.crew_service.check_ready()
            plan = self.crew_service.plan(self.project, self.registry.participants())
            self._validate_plan(plan)

            now = utcnow_iso()
            run_id = f"run_{uuid.uuid4().hex[:12]}"
            participants: list[dict[str, Any]] = []
            for p in plan:
                if all(x["agent_id"] != p.agent.id for x in participants):
                    participants.append({"agent_id": p.agent.id, "name": p.agent.name,
                                         "role": p.agent.role, "kind": p.agent.kind})
            tasks: list[TaskRecord] = []
            with self.db.session() as s:
                s.add(RunRecord(
                    id=run_id, project_id=self.project.id, status="queued", inputs=inputs,
                    participants=participants, total_tasks=len(plan), completed_tasks=0,
                    created_at=now,
                ))
                s.flush()
                for i, p in enumerate(plan):
                    t = TaskRecord(
                        id=f"tsk_{uuid.uuid4().hex[:12]}", run_id=run_id, position=i, key=p.key,
                        name=p.name, description=p.description, expected_output=p.expected_output,
                        agent_id=p.agent.id, agent_name=p.agent.name, agent_role=p.agent.role,
                        # Sequential process: every task receives all earlier outputs as context.
                        depends_on=[x.id for x in tasks], status="pending",
                    )
                    s.add(t)
                    tasks.append(t)

            self.active_run_id = run_id
            self.current_run_id = run_id
            self.store.set_raw("current_run_id", run_id)
            self._tasks = {t.id: t for t in tasks}
            self._crew_task_map, self._crew_agent_map = {}, {}
            self.runtime = {}
            for t in tasks:
                rt = AgentRuntime(
                    status="queued", current_task=t.name, current_task_id=t.id, run_id=run_id,
                    last_activity=f"Queued: {t.name}", last_activity_at=now,
                )
                self.runtime[t.agent_id] = rt
                self.publisher.publish(
                    "agent.queued", f"{t.agent_name} is queued for '{t.name}'", run_id=run_id,
                    agent_id=t.agent_id, agent_name=t.agent_name, task_id=t.id, task_name=t.name,
                    data={"agent": self._agent_payload(t.agent_id), "task": task_to_out(t).model_dump()},
                )
            run_out = self.get_run(run_id)
            self.publisher.publish(
                "workflow.queued", f"Workflow queued with {len(tasks)} tasks", run_id=run_id,
                data={"run": run_out.model_dump(), "tasks": [task_to_out(t).model_dump() for t in tasks]},
            )
            self._thread = threading.Thread(
                target=self._execute, args=(run_id, plan, inputs), name=f"crew-{run_id}", daemon=True
            )
            self._thread.start()
            return run_out

    def _validate_plan(self, plan: list[PlannedTask]) -> None:
        problems = []
        for p in plan:
            if p.agent.kind != "custom":
                continue
            for key in p.agent.tools or []:
                spec = TOOL_REGISTRY.get(key)
                if spec is None:
                    problems.append(f"{p.agent.name}: unknown tool '{key}'")
                elif spec.missing_env():
                    problems.append(f"{p.agent.name}: tool '{key}' is unavailable ({', '.join(spec.missing_env())} not set)")
            if p.agent.llm_model and p.agent.llm_model not in self.settings.allowed_models:
                problems.append(f"{p.agent.name}: model '{p.agent.llm_model}' is not approved")
            if not p.description or not p.expected_output:
                problems.append(f"{p.agent.name}: task description and expected output are required")
        if problems:
            raise ValidationFailed("Workflow configuration is invalid", problems)

    def wait(self, timeout: float | None = None) -> bool:
        """Test helper: wait for the active run thread to finish."""
        thread = self._thread
        if thread is None:
            return True
        thread.join(timeout)
        return not thread.is_alive()

    # ================================================================ execution
    def _execute(self, run_id: str, plan: list[PlannedTask], inputs: dict[str, str]) -> None:
        try:
            with self._lock:
                with self.db.session() as s:
                    run = s.get(RunRecord, run_id)
                    run.status, run.started_at = "running", utcnow_iso()
                self.publisher.publish(
                    "workflow.started", f"Workflow started: {inputs.get('topic', '')}".strip(),
                    run_id=run_id, data={"run": self.get_run(run_id).model_dump()},
                )
            run_dir = self.results.run_dir(run_id)
            built = self.crew_service.build(self.project, plan, run_dir)
            ordered = sorted(self._tasks.values(), key=lambda t: t.position)
            with self._lock:
                for crew_task, task in zip(built.crew.tasks, ordered, strict=True):
                    self._crew_task_map[str(crew_task.id)] = task.id
                    if crew_task.agent is not None:
                        self._crew_agent_map[str(crew_task.agent.id)] = task.agent_id
            output = built.crew.kickoff(inputs=inputs)
            crewai_listener.flush()
            self._finish_success(run_id, built, output)
        except Exception as exc:
            log.exception("Workflow %s failed", run_id)
            crewai_listener.flush()
            try:
                self._finish_failure(run_id, exc)
            except Exception:
                log.exception("Failed to record failure of run %s", run_id)
        finally:
            with self._lock:
                self.active_run_id = None
                self._crew_task_map, self._crew_agent_map = {}, {}

    def _finish_success(self, run_id: str, built, output) -> None:
        with self._lock:
            ordered = sorted(self._tasks.values(), key=lambda t: t.position)
            task_outputs = list(getattr(output, "tasks_output", []) or [])
            for i, task in enumerate(ordered):
                text = task_outputs[i].raw if i < len(task_outputs) else ""
                self._complete_task(task.id, text or "")
            report_text = None
            if built.report_path and built.report_path.is_file():
                report_text = built.report_path.read_text(encoding="utf-8")
                self.results.add_artifact(run_id, "report", built.report_path, "text/markdown")
                legacy = self.settings.legacy_report_path
                if legacy is not None:
                    try:
                        shutil.copyfile(built.report_path, legacy)
                    except OSError:
                        log.warning("Could not update legacy report at %s", legacy, exc_info=True)
            self._register_task_artifacts(run_id, ordered)
            with self.db.session() as s:
                run = s.get(RunRecord, run_id)
                run.status, run.completed_at = "completed", utcnow_iso()
            self._publish_result(run_id, ordered, report_text)
            self.publisher.publish(
                "workflow.completed", "Workflow completed successfully", run_id=run_id,
                level="success", data={"run": self.get_run(run_id).model_dump()},
            )

    def _finish_failure(self, run_id: str, exc: BaseException) -> None:
        message = safe_error(exc)
        with self._lock:
            ordered = sorted(self._tasks.values(), key=lambda t: t.position)
            for task in ordered:
                if task.status == "running":
                    self._fail_task(task.id, message)
            for task in ordered:
                if task.status == "pending":
                    rt = self.runtime.get(task.agent_id)
                    if rt and rt.status == "queued":
                        rt.status = "idle"
                        rt.last_activity = "Not run: the workflow stopped early"
                        rt.last_activity_at = utcnow_iso()
                        self.publisher.publish(
                            "agent.progress", f"{task.agent_name} did not run", run_id=run_id,
                            agent_id=task.agent_id, agent_name=task.agent_name, level="warning",
                            data={"agent": self._agent_payload(task.agent_id)},
                        )
            self._register_task_artifacts(run_id, ordered)
            with self.db.session() as s:
                run = s.get(RunRecord, run_id)
                if run is None:
                    return
                run.status, run.completed_at, run.error_message = "failed", utcnow_iso(), message
            if any(t.status == "completed" for t in ordered):
                self._publish_result(run_id, ordered, None)
            self.publisher.publish(
                "workflow.failed", f"Workflow failed: {message}", run_id=run_id, level="error",
                data={"run": self.get_run(run_id).model_dump(), "error": message},
            )

    def _register_task_artifacts(self, run_id: str, ordered: list[TaskRecord]) -> None:
        for task in ordered:
            if task.output_path:
                path = self.settings.runs_dir / task.output_path
                if path.is_file():
                    self.results.add_artifact(run_id, "task_output", path, "text/markdown")

    def _publish_result(self, run_id: str, ordered: list[TaskRecord], report_text: str | None) -> None:
        with self.db.session() as s:
            run = s.get(RunRecord, run_id)
        outputs = [TaskOutputFile(t, self.results.read_rel(t.output_path) or "") for t in ordered]
        result = self.results.build_result(run, outputs, self.project.primary_task_key, report_text)
        self.results.save_result(run_id, result)
        self.publisher.publish(
            "result.created", f"Results ready: {result.title}", run_id=run_id,
            level="success" if result.status == "completed" else "warning",
            data={"run_id": run_id, "status": result.status, "title": result.title},
        )

    # ================================================================ CrewAI events
    def on_crewai_event(self, kind: str, event: Any) -> None:
        with self._lock:
            run_id = self.active_run_id
            if run_id is None:
                return
            task_id = self._resolve_task(event)
            agent_id = self._resolve_agent(event, task_id)
            if task_id is None and agent_id is None:
                return
            if kind == "task_started" and task_id:
                self._start_task(task_id)
            elif kind == "task_completed" and task_id:
                out = getattr(event, "output", None)
                self._complete_task(task_id, getattr(out, "raw", None) or "")
            elif kind == "task_failed" and task_id:
                self._fail_task(task_id, str(getattr(event, "error", "Task failed"))[:400])
            elif agent_id:
                self._agent_activity(kind, agent_id, task_id, event)

    def _resolve_task(self, event: Any) -> str | None:
        raw = getattr(event, "task_id", None)
        if not raw:
            task = getattr(event, "task", None) or getattr(event, "from_task", None)
            raw = str(task.id) if task is not None and hasattr(task, "id") else None
        return self._crew_task_map.get(str(raw)) if raw else None

    def _resolve_agent(self, event: Any, task_id: str | None) -> str | None:
        raw = getattr(event, "agent_id", None)
        if not raw:
            agent = getattr(event, "agent", None) or getattr(event, "from_agent", None)
            raw = str(agent.id) if agent is not None and hasattr(agent, "id") else None
        if raw and str(raw) in self._crew_agent_map:
            return self._crew_agent_map[str(raw)]
        if task_id and task_id in self._tasks:
            return self._tasks[task_id].agent_id
        return None

    def _agent_payload(self, agent_id: str) -> dict:
        rt = self.runtime.get(agent_id) or AgentRuntime()
        return {"id": agent_id, **rt.model_dump()}

    def _update_task(self, task_id: str, **fields) -> TaskRecord:
        with self.db.session() as s:
            rec = s.get(TaskRecord, task_id)
            for k, v in fields.items():
                setattr(rec, k, v)
        task = self._tasks[task_id]
        for k, v in fields.items():
            setattr(task, k, v)
        return task

    def _start_task(self, task_id: str) -> None:
        task = self._tasks[task_id]
        if TASK_RANK[task.status] >= TASK_RANK["running"]:
            return
        now = utcnow_iso()
        self._update_task(task_id, status="running", started_at=now)
        self.publisher.publish(
            "task.started", f"Task started: {task.name}", run_id=task.run_id,
            agent_id=task.agent_id, agent_name=task.agent_name, task_id=task.id, task_name=task.name,
            data={"task": task_to_out(task).model_dump()},
        )
        rt = self.runtime.setdefault(task.agent_id, AgentRuntime(run_id=task.run_id))
        if AGENT_RANK[rt.status] < AGENT_RANK["working"]:
            rt.status, rt.started_at = "working", now
            rt.current_task, rt.current_task_id = task.name, task.id
            rt.activity = "working"
            rt.last_activity, rt.last_activity_at = f"Started: {task.name}", now
            self.publisher.publish(
                "agent.started", f"{task.agent_name} started working on '{task.name}'",
                run_id=task.run_id, agent_id=task.agent_id, agent_name=task.agent_name,
                task_id=task.id, task_name=task.name, data={"agent": self._agent_payload(task.agent_id)},
            )

    def _complete_task(self, task_id: str, text: str) -> None:
        task = self._tasks[task_id]
        if task.status in ("completed", "failed"):
            return
        if task.status == "pending":
            self._start_task(task_id)
        now = utcnow_iso()
        rel = self.results.write_task_output(task.run_id, task, text)
        preview = text.strip()[:PREVIEW_CHARS]
        self._update_task(task_id, status="completed", completed_at=now,
                          output_preview=preview, output_path=rel)
        with self.db.session() as s:
            run = s.get(RunRecord, task.run_id)
            run.completed_tasks = sum(1 for t in self._tasks.values() if t.status == "completed")
            done, total = run.completed_tasks, run.total_tasks
        self.publisher.publish(
            "task.completed", f"Task completed: {task.name}", run_id=task.run_id, level="success",
            agent_id=task.agent_id, agent_name=task.agent_name, task_id=task.id, task_name=task.name,
            data={"task": task_to_out(task).model_dump(), "progress": {"completed": done, "total": total}},
        )
        remaining = [t for t in self._tasks.values()
                     if t.agent_id == task.agent_id and t.status not in ("completed", "failed")]
        rt = self.runtime.setdefault(task.agent_id, AgentRuntime(run_id=task.run_id))
        if not remaining and AGENT_RANK[rt.status] < AGENT_RANK["completed"]:
            rt.status, rt.completed_at, rt.activity = "completed", now, None
            rt.last_activity, rt.last_activity_at = f"Completed: {task.name}", now
            self.publisher.publish(
                "agent.completed", f"{task.agent_name} completed '{task.name}'", run_id=task.run_id,
                level="success", agent_id=task.agent_id, agent_name=task.agent_name,
                task_id=task.id, task_name=task.name, data={"agent": self._agent_payload(task.agent_id)},
            )

    def _fail_task(self, task_id: str, message: str) -> None:
        task = self._tasks[task_id]
        if task.status in ("completed", "failed"):
            return
        now = utcnow_iso()
        message = _SECRET.sub("[redacted]", message)
        self._update_task(task_id, status="failed", completed_at=now, error_message=message)
        self.publisher.publish(
            "task.failed", f"Task failed: {task.name}", run_id=task.run_id, level="error",
            agent_id=task.agent_id, agent_name=task.agent_name, task_id=task.id, task_name=task.name,
            data={"task": task_to_out(task).model_dump(), "error": message},
        )
        rt = self.runtime.setdefault(task.agent_id, AgentRuntime(run_id=task.run_id))
        if rt.status != "error":
            rt.status, rt.completed_at, rt.error_message, rt.activity = "error", now, message, None
            rt.last_activity, rt.last_activity_at = f"Failed: {task.name}", now
            self.publisher.publish(
                "agent.failed", f"{task.agent_name} failed: {message}", run_id=task.run_id,
                level="error", agent_id=task.agent_id, agent_name=task.agent_name,
                task_id=task.id, task_name=task.name, data={"agent": self._agent_payload(task.agent_id)},
            )

    def _agent_activity(self, kind: str, agent_id: str, task_id: str | None, event: Any) -> None:
        rt = self.runtime.get(agent_id)
        if rt is None or rt.status in ("completed", "error"):
            return
        tool = getattr(event, "tool_name", None)
        model = getattr(event, "model", None)
        texts = {
            "agent_started": ("Reading the task", "info"),
            "agent_completed": ("Finishing up", "info"),
            "agent_error": ("Agent reported an error", "warning"),
            "llm_started": (f"Thinking (calling {model or 'the model'})", "info"),
            "llm_completed": ("Received a model response", "info"),
            "llm_failed": ("A model call failed", "warning"),
            "tool_started": (f"Using tool: {tool}", "info"),
            "tool_finished": (f"Finished tool: {tool}", "info"),
            "tool_error": (f"Tool error: {tool}", "warning"),
        }
        if kind not in texts:
            return
        text, level = texts[kind]
        if task_id and rt.status == "queued":
            self._start_task(task_id)
        now = utcnow_iso()
        rt.activity = {"llm_started": "thinking", "tool_started": "tool"}.get(kind, "working")
        rt.last_activity, rt.last_activity_at = text, now
        task = self._tasks.get(task_id) if task_id else None
        self.publisher.publish(
            "agent.progress", text, run_id=self.active_run_id, level=level, agent_id=agent_id,
            agent_name=task.agent_name if task else None, task_id=task_id,
            task_name=task.name if task else None,
            data={"agent": self._agent_payload(agent_id), "activity_kind": rt.activity},
        )
