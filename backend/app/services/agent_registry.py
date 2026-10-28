"""Registered agent configurations (built-in and user-created)."""
from __future__ import annotations

import hashlib
import string
import uuid
from typing import Any

from sqlalchemy import select

from app.core.config import Settings
from app.core.errors import ConflictError, NotFoundError, ValidationFailed
from app.core.time import utcnow_iso
from app.database.models import AgentRecord
from app.database.session import Database
from app.projects import ProjectDefinition
from app.schemas.agents import AgentAppearance, AgentCreate, AgentUpdate
from app.services.model_catalog import ModelCatalog
from app.services.tool_registry import validate_tool_keys

BUILTIN_EDITABLE = {"name", "appearance", "workstation", "llm_model"}
TEXT_FIELDS = ("role", "goal", "backstory", "task_description", "task_expected_output")

_PALETTE = [
    ("#e11d48", "#1f2937", "#111827", "short"), ("#8b5cf6", "#0f172a", "#7c2d12", "long"),
    ("#0ea5e9", "#334155", "#facc15", "spiky"), ("#14b8a6", "#1e3a8a", "#44403c", "cap"),
    ("#eab308", "#3f3f46", "#78350f", "bun"), ("#ec4899", "#164e63", "#0c0a09", "short"),
]
_SKINS = ["#f5c99b", "#e0ac69", "#c68642", "#8d5524", "#ffdbac", "#f1c27d"]


def default_appearance(seed: str) -> dict[str, Any]:
    h = int(hashlib.sha1(seed.encode()).hexdigest(), 16)
    shirt, pants, hair, style = _PALETTE[h % len(_PALETTE)]
    return AgentAppearance(
        shirt_color=shirt, pants_color=pants, hair_color=hair, hair_style=style,
        skin_color=_SKINS[(h // 7) % len(_SKINS)],
    ).model_dump()


def template_fields(text: str) -> set[str]:
    """Placeholder names used in a CrewAI prompt string, e.g. {topic}."""
    try:
        return {f for _, f, _, _ in string.Formatter().parse(text) if f is not None}
    except ValueError as exc:
        raise ValidationFailed(f"Invalid braces in text: {exc}") from exc


class AgentRegistry:
    def __init__(self, db: Database, settings: Settings, project: ProjectDefinition,
                 catalog: ModelCatalog | None = None):
        self.db = db
        self.settings = settings
        self.project = project
        self.catalog = catalog or ModelCatalog(settings)

    # ---- startup -------------------------------------------------------
    def seed_builtins(self) -> None:
        """Insert or refresh built-in agents from the Python project definition."""
        now = utcnow_iso()
        with self.db.session() as s:
            existing = {
                r.builtin_key: r
                for r in s.execute(
                    select(AgentRecord).where(
                        AgentRecord.project_id == self.project.id, AgentRecord.kind == "builtin"
                    )
                ).scalars()
            }
            used = self._used_workstations(s)
            for order, spec in enumerate(self.project.builtin_agents()):
                rec = existing.get(spec.key)
                if rec is None:
                    ws = self._first_free(used)
                    used.add(ws)
                    rec = AgentRecord(
                        id=f"agt_{spec.key}", project_id=self.project.id, kind="builtin",
                        builtin_key=spec.key, name=spec.name, enabled=True,
                        appearance=AgentAppearance(**spec.appearance).model_dump(),
                        workstation=ws, created_at=now, tools=[],
                    )
                    s.add(rec)
                # Python is the source of truth for prompts; refresh on every start.
                rec.role, rec.goal, rec.backstory = spec.role, spec.goal, spec.backstory
                rec.task_name = spec.task_name
                rec.task_description = spec.task_description
                rec.task_expected_output = spec.task_expected_output
                rec.workflow_order = order
                rec.enabled = True
                rec.updated_at = now

    # ---- queries -------------------------------------------------------
    def list(self) -> list[AgentRecord]:
        with self.db.session() as s:
            rows = s.execute(
                select(AgentRecord).where(AgentRecord.project_id == self.project.id)
            ).scalars()
            return sorted(rows, key=_sort_key)

    def get(self, agent_id: str) -> AgentRecord:
        with self.db.session() as s:
            rec = s.get(AgentRecord, agent_id)
            if rec is None or rec.project_id != self.project.id:
                raise NotFoundError(f"Agent '{agent_id}' not found")
            return rec

    def participants(self) -> list[AgentRecord]:
        """Agents taking part in the next run, in execution order."""
        agents = self.list()
        builtins = [a for a in agents if a.kind == "builtin"]
        customs = [a for a in agents if a.kind == "custom" and a.enabled]
        return builtins + customs

    # ---- mutations -----------------------------------------------------
    def create(self, data: AgentCreate) -> AgentRecord:
        self._validate(data.model_dump())
        now = utcnow_iso()
        agent_id = f"agt_{uuid.uuid4().hex[:12]}"
        with self.db.session() as s:
            self._check_participant_limit(s, data.enabled, exclude_id=None)
            used = self._used_workstations(s)
            ws = data.workstation
            if ws is not None and ws in used:
                raise ConflictError(f"Workstation {ws} is already taken")
            if ws is None:
                ws = self._first_free(used)
            appearance = (data.appearance.model_dump() if data.appearance
                          else default_appearance(agent_id))
            rec = AgentRecord(
                id=agent_id, project_id=self.project.id, kind="custom", builtin_key=None,
                name=data.name, role=data.role, goal=data.goal, backstory=data.backstory,
                tools=list(data.tools), llm_model=data.llm_model, task_name=data.task_name,
                task_description=data.task_description,
                task_expected_output=data.task_expected_output, enabled=data.enabled,
                workflow_order=data.workflow_order, appearance=appearance, workstation=ws,
                created_at=now, updated_at=now,
            )
            s.add(rec)
        return rec

    def update(self, agent_id: str, data: AgentUpdate, locked_ids: set[str]) -> AgentRecord:
        changes = data.model_dump(exclude_unset=True)
        with self.db.session() as s:
            rec = s.get(AgentRecord, agent_id)
            if rec is None or rec.project_id != self.project.id:
                raise NotFoundError(f"Agent '{agent_id}' not found")
            if rec.kind == "builtin":
                forbidden = set(changes) - BUILTIN_EDITABLE
                if forbidden:
                    raise ValidationFailed(
                        "Built-in agents are defined in learn_crewai.py; only name, "
                        "model, appearance and workstation can be changed here.",
                        sorted(forbidden),
                    )
                if problem := self.catalog.validate(changes.get("llm_model")):
                    raise ValidationFailed("Invalid agent configuration", [problem])
            if agent_id in locked_ids and changes.get("enabled") is False:
                raise ConflictError("This agent is part of the running workflow")

            merged = {c: getattr(rec, c) for c in (
                "name", "role", "goal", "backstory", "tools", "llm_model", "task_name",
                "task_description", "task_expected_output", "enabled",
            )}
            merged.update({k: v for k, v in changes.items() if k not in ("appearance", "workstation")})
            if rec.kind == "custom":
                self._validate(merged)
                if changes.get("enabled") and not rec.enabled:
                    self._check_participant_limit(s, True, exclude_id=rec.id)

            if "workstation" in changes and changes["workstation"] is not None:
                self._assign_workstation(s, rec, changes["workstation"])
            if "appearance" in changes and changes["appearance"] is not None:
                rec.appearance = AgentAppearance(**changes["appearance"]).model_dump()
            for key in ("name", "role", "goal", "backstory", "tools", "llm_model", "task_name",
                        "task_description", "task_expected_output", "enabled", "workflow_order"):
                if key in changes and (changes[key] is not None or key in (
                        "llm_model", "task_name", "task_description", "task_expected_output")):
                    setattr(rec, key, changes[key])
            rec.updated_at = utcnow_iso()
        return rec

    def delete(self, agent_id: str, locked_ids: set[str]) -> None:
        with self.db.session() as s:
            rec = s.get(AgentRecord, agent_id)
            if rec is None or rec.project_id != self.project.id:
                raise NotFoundError(f"Agent '{agent_id}' not found")
            if rec.kind == "builtin":
                raise ValidationFailed("Built-in agents from learn_crewai.py cannot be removed")
            if agent_id in locked_ids:
                raise ConflictError("This agent is part of the running workflow")
            s.delete(rec)

    # ---- helpers -------------------------------------------------------
    def _validate(self, d: dict[str, Any]) -> None:
        problems: list[str] = []
        problems += validate_tool_keys(d.get("tools") or [])
        if problem := self.catalog.validate(d.get("llm_model")):
            problems.append(problem)
        allowed_vars = {f.name for f in self.project.inputs}
        for name in TEXT_FIELDS:
            text = d.get(name)
            if text:
                bad = template_fields(text) - allowed_vars
                if bad:
                    problems.append(
                        f"{name}: unknown placeholder(s) {sorted(bad)}; allowed: "
                        f"{sorted('{' + v + '}' for v in allowed_vars)}"
                    )
        if d.get("enabled") and not (d.get("task_description") and d.get("task_expected_output")):
            problems.append("A task description and expected output are required to join the workflow")
        if problems:
            raise ValidationFailed("Invalid agent configuration", problems)

    def _check_participant_limit(self, s, enabling: bool, exclude_id: str | None) -> None:
        if not enabling:
            return
        q = select(AgentRecord).where(
            AgentRecord.project_id == self.project.id,
            AgentRecord.kind == "custom", AgentRecord.enabled.is_(True),
        )
        count = sum(1 for r in s.execute(q).scalars() if r.id != exclude_id)
        if count >= self.settings.max_custom_participants:
            raise ConflictError(
                f"At most {self.settings.max_custom_participants} custom agents can join the workflow"
            )

    def _used_workstations(self, s) -> set[int]:
        q = select(AgentRecord.workstation).where(AgentRecord.project_id == self.project.id)
        return {w for w in s.execute(q).scalars() if w is not None}

    @staticmethod
    def _first_free(used: set[int]) -> int:
        i = 0
        while i in used:
            i += 1
        return i

    def _assign_workstation(self, s, rec: AgentRecord, ws: int) -> None:
        if rec.workstation == ws:
            return
        other = s.execute(
            select(AgentRecord).where(
                AgentRecord.project_id == self.project.id, AgentRecord.workstation == ws
            )
        ).scalar_one_or_none()
        if other is not None:
            other.workstation = rec.workstation  # swap desks
        rec.workstation = ws


def _sort_key(a: AgentRecord):
    return (0 if a.kind == "builtin" else 1, a.workflow_order, a.created_at)
