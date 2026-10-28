"""Turn real CrewAI outputs into a presentation-friendly structure.

Nothing is invented: sections come from the report's own headings, the summary
is only set when the report has a summary-like section, and sources are only
links that literally appear in the outputs.
"""
from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select

from app.core.config import Settings
from app.core.errors import NotFoundError
from app.core.time import utcnow_iso
from app.database.models import ArtifactRecord, RunRecord, TaskRecord
from app.database.session import Database
from app.schemas.runs import (
    ArtifactOut, PresentationResult, ResultSection, ResultSource, ResultTaskOutput,
)

PREVIEW_CHARS = 600

_SECTION_KINDS = [
    ("summary", re.compile(r"\b(executive summary|summary|overview|tl;?dr|introduction)\b", re.I)),
    ("findings", re.compile(r"\b(key (findings|insights|areas|ideas|points)|findings|insights)\b", re.I)),
    ("recommendations", re.compile(r"\b(recommendations?|next steps|action items?)\b", re.I)),
    ("risks", re.compile(r"\b(risks?|challenges|threats|concerns)\b", re.I)),
    ("opportunities", re.compile(r"\b(opportunit(y|ies)|benefits)\b", re.I)),
    ("verification", re.compile(r"\b(verification|open questions|uncertaint)", re.I)),
    ("sources", re.compile(r"\b(sources|references|citations|bibliography)\b", re.I)),
    ("conclusion", re.compile(r"\b(conclusion|closing)\b", re.I)),
]
_MD_LINK = re.compile(r"\[([^\]]{1,200})\]\((https?://[^\s)]+)\)")
_BARE_URL = re.compile(r"(?<![(\[])(https?://[^\s)>\]]+)")
_HR_EDGES = re.compile(r"^(\s*([-*_])\2{2,}\s*\n)+|(\n\s*([-*_])\4{2,}\s*)+$")
_FENCE = re.compile(r"^```(?:markdown|md)?\s*\n(.*)\n```\s*$", re.S)


def clean_markdown(text: str) -> str:
    """Strip a single wrapping ```markdown fence that LLMs sometimes add."""
    text = (text or "").strip()
    m = _FENCE.match(text)
    return m.group(1).strip() if m else text


def classify(title: str) -> str:
    for kind, rx in _SECTION_KINDS:
        if rx.search(title):
            return kind
    return "other"


def split_sections(markdown: str) -> tuple[str | None, list[ResultSection]]:
    """Return (H1 title, sections split on H2 headings)."""
    lines = markdown.splitlines()
    title = None
    sections: list[ResultSection] = []
    current_title, buf = None, []
    in_code = False

    def flush():
        body = _HR_EDGES.sub("", "\n".join(buf).strip()).strip()
        if body:
            sections.append(ResultSection(
                id=f"s{len(sections) + 1}", title=current_title or "Overview",
                kind=classify(current_title) if current_title else "intro", markdown=body,
            ))

    for line in lines:
        if line.strip().startswith("```"):
            in_code = not in_code
        if not in_code and title is None and re.match(r"^#\s+\S", line) and not sections and not "".join(buf).strip():
            title = line.lstrip("#").strip()
            continue
        if not in_code and re.match(r"^##\s+\S", line):
            flush()
            current_title, buf = line.lstrip("#").strip(), []
            continue
        buf.append(line)
    flush()
    if len(sections) == 1 and sections[0].kind == "intro":
        sections[0] = ResultSection(id="s1", title="Report", kind="other", markdown=sections[0].markdown)
    return title, sections


def extract_sources(texts: list[str]) -> list[ResultSource]:
    seen: dict[str, str] = {}
    for text in texts:
        for label, url in _MD_LINK.findall(text):
            seen.setdefault(url.rstrip(".,;"), label)
        for url in _BARE_URL.findall(text):
            url = url.rstrip(".,;")
            seen.setdefault(url, url)
    return [ResultSource(label=label, url=url) for url, label in list(seen.items())[:50]]


@dataclass
class TaskOutputFile:
    task: TaskRecord
    text: str


class ResultService:
    def __init__(self, db: Database, settings: Settings):
        self.db = db
        self.settings = settings

    # ---- files ---------------------------------------------------------
    def run_dir(self, run_id: str) -> Path:
        if not re.fullmatch(r"run_[0-9a-f]{12}", run_id):
            raise NotFoundError("Unknown run")
        d = self.settings.runs_dir / run_id
        d.mkdir(parents=True, exist_ok=True)
        return d

    def write_task_output(self, run_id: str, task: TaskRecord, text: str) -> str:
        rel = f"{run_id}/tasks/{task.position + 1:02d}_{task.key}.md"
        path = self.settings.runs_dir / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return rel

    def read_rel(self, rel: str | None) -> str | None:
        if not rel:
            return None
        path = self._safe_path(rel)
        return path.read_text(encoding="utf-8") if path.is_file() else None

    def _safe_path(self, rel: str) -> Path:
        base = self.settings.runs_dir.resolve()
        path = (base / rel).resolve()
        if base not in path.parents:
            raise NotFoundError("Artifact not found")
        return path

    def add_artifact(self, run_id: str, kind: str, path: Path, media_type: str) -> ArtifactRecord:
        rel = path.resolve().relative_to(self.settings.runs_dir.resolve()).as_posix()
        rec = ArtifactRecord(
            id=f"art_{uuid.uuid4().hex[:12]}", run_id=run_id, kind=kind, filename=path.name,
            rel_path=rel, size=path.stat().st_size, media_type=media_type, created_at=utcnow_iso(),
        )
        with self.db.session() as s:
            s.add(rec)
        return rec

    def artifacts(self, run_id: str) -> list[ArtifactOut]:
        with self.db.session() as s:
            rows = s.execute(
                select(ArtifactRecord).where(ArtifactRecord.run_id == run_id)
                .order_by(ArtifactRecord.created_at)
            ).scalars()
            return [self._artifact_out(r) for r in rows]

    def artifact_path(self, run_id: str, artifact_id: str) -> tuple[ArtifactRecord, Path]:
        with self.db.session() as s:
            rec = s.get(ArtifactRecord, artifact_id)
        if rec is None or rec.run_id != run_id:
            raise NotFoundError("Artifact not found")
        path = self._safe_path(rec.rel_path)
        if not path.is_file():
            raise NotFoundError("Artifact file is missing")
        return rec, path

    @staticmethod
    def _artifact_out(r: ArtifactRecord) -> ArtifactOut:
        return ArtifactOut(
            id=r.id, run_id=r.run_id, kind=r.kind, filename=r.filename, size=r.size,
            media_type=r.media_type, created_at=r.created_at,
            url=f"/api/runs/{r.run_id}/artifacts/{r.id}",
        )

    # ---- presentation --------------------------------------------------
    def build_result(
        self,
        run: RunRecord,
        outputs: list[TaskOutputFile],
        primary_task_key: str | None,
        report_text: str | None,
    ) -> PresentationResult:
        completed = [o for o in outputs if o.task.status == "completed" and o.text.strip()]
        primary = report_text
        if primary is None:
            match = next((o for o in completed if o.task.key == primary_task_key), None)
            match = match or (completed[-1] if completed else None)
            primary = match.text if match else None
        primary = clean_markdown(primary) if primary else None

        all_done = run.status == "completed" and all(o.task.status == "completed" for o in outputs)
        if all_done:
            status, warning = "completed", None
        elif completed:
            status = "partial"
            warning = ("The workflow did not finish successfully. Only the outputs of "
                       f"{len(completed)} of {len(outputs)} tasks are available.")
        else:
            status, warning = "failed", "The workflow failed before any task produced output."

        topic = (run.inputs or {}).get("topic")
        h1, sections = split_sections(primary) if primary else (None, [])
        title = h1 or (f"Findings: {topic}" if topic else "Workflow results")
        summary_section = next((s for s in sections if s.kind == "summary"), None)
        summary = summary_section.markdown.split("\n\n")[0].strip() if summary_section else None

        task_outputs = [
            ResultTaskOutput(
                task_id=o.task.id, key=o.task.key, name=o.task.name, agent_id=o.task.agent_id,
                agent_name=o.task.agent_name, status=o.task.status, markdown=clean_markdown(o.text),
            )
            for o in outputs if o.text.strip()
        ]
        return PresentationResult(
            run_id=run.id, status=status, warning=warning, title=title, summary=summary,
            sections=sections, task_outputs=task_outputs,
            sources=extract_sources([o.text for o in outputs]),
            report_markdown=primary, artifacts=self.artifacts(run.id), generated_at=utcnow_iso(),
        )

    def save_result(self, run_id: str, result: PresentationResult) -> None:
        path = self.run_dir(run_id) / "result.json"
        path.write_text(json.dumps(result.model_dump(mode="json"), indent=2), encoding="utf-8")
        self.add_artifact(run_id, "result", path, "application/json")
        result.artifacts = self.artifacts(run_id)
        with self.db.session() as s:
            run = s.get(RunRecord, run_id)
            run.result = result.model_dump(mode="json")

    def get_result(self, run_id: str) -> PresentationResult:
        with self.db.session() as s:
            run = s.get(RunRecord, run_id)
            if run is None:
                raise NotFoundError("Run not found")
            if not run.result:
                raise NotFoundError("This run has no results yet")
            data = dict(run.result)
        data["artifacts"] = [a.model_dump() for a in self.artifacts(run_id)]
        return PresentationResult.model_validate(data)
