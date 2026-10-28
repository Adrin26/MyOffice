# Project Analysis (Phase Zero)

Inspection date: 2026-10-28. No files were modified during the inspection. This is the record of the repository **before** the workplace was built; for the current design see [ARCHITECTURE.md](ARCHITECTURE.md).

## 1. What is in the repository

| Path | Purpose |
| --- | --- |
| `learn_crewai.py` | **The real entry point.** A self-contained, code-first CrewAI workflow. |
| `report.md` | Output of the last run of `learn_crewai.py` (topic: "Roadmap to Becoming an AI Engineer in 3 Months"). |
| `.env` | `OPENAI_API_KEY`, `OPENAI_MODEL` (values not reproduced here). |
| `venv/` | Python 3.12.8 virtual environment used for `learn_crewai.py`. |
| `ai_research_team/` | A separate, unfinished JSON-first CrewAI scaffold (`crewai create`). Has its own `.git` (no commits), `.venv`, and `.env` with the same keys. |

The root folder is **not** a git repository.

## 2. Existing architecture (`learn_crewai.py`)

- Loads `.env` from the root, then `ai_research_team/.env` as a fallback.
- Raises `RuntimeError` **at import time** if `OPENAI_API_KEY` is missing.
- Model: `OPENAI_MODEL` env var, default `gpt-4o-mini` (OpenAI provider).
- Agents, tasks, and the `Crew` are all created **at module import time** as module-level globals.
- Only the `__main__` block is interactive: it asks for a topic with `input()` and calls `research_crew.kickoff(inputs={"topic": topic})`.
- Process: `Process.sequential`. No memory, no planning, no tools, delegation disabled, verbose on.

### Agents

| Variable | Role | Goal (summary) | Tools |
| --- | --- | --- | --- |
| `researcher` | Researcher | Identify ideas, opportunities, and risks about `{topic}` | none |
| `analyst` | Business Analyst | Evaluate research findings and produce practical insights | none |
| `writer` | Report Writer | Produce a clear, structured final report | none |

### Tasks (execution order)

1. `research_task` (Researcher): structured research brief on `{topic}`.
2. `analysis_task` (Business Analyst): analytical brief. Receives task 1 output implicitly as sequential context.
3. `writing_task` (Report Writer): polished Markdown report. Receives prior outputs as context. `output_file="report.md"`.

The only runtime input is `topic`.

### Where results go

- `report.md`, written **relative to the current working directory** (not the script directory), overwritten on each run.
- The `CrewOutput` returned by `kickoff()` (final raw text plus `tasks_output` for each task) is printed to the console and otherwise discarded.

## 3. `ai_research_team/` scaffold

- `crew.jsonc`: one agent (`researcher`), one placeholder task (`n_task`, description "n"), sequential, `memory: true`.
- `agents/researcher.jsonc`: duplicates the Researcher role/goal/backstory, `openai/gpt-4o-mini`, `allow_delegation: true`, `planning: true`.
- `tools/`, `skills/`, `knowledge/` are empty placeholders.
- It is not wired to `learn_crewai.py` except that its `.env` is used as a fallback.

**Assessment:** it is an incomplete experiment, not the working workflow. I will leave it untouched and not use it as the source of truth.

## 4. Dependencies

- Root `venv`: Python 3.12.8, `crewai` 1.15.30, `crewai-cli`, `openai` 2.54, `pydantic` 2.12, `python-dotenv`, `uvicorn` 0.54, `starlette` 1.10, `websockets` 17.3, `aiosqlite`, `httpx`.
- Missing for the planned backend: `fastapi`, `sqlalchemy`, `pytest` (and `pytest-asyncio`).
- Node.js 24.22 and npm 11.19 are installed. No frontend exists yet.
- No tests, no documentation beyond the scaffold README, no persistence layer.

## 5. Instrumentation available in CrewAI 1.15.30

Verified against the installed package:

- Global event bus `crewai.events.crewai_event_bus` with `@crewai_event_bus.on(EventType)`.
- Events: `CrewKickoffStarted/Completed/Failed`, `TaskStarted/Completed/Failed`, `AgentExecutionStarted/Completed/Error`, `ToolUsageStarted/Finished/Error`, `LLMCallStarted/Completed/Failed`.
- Task and agent events carry `task_id`, `task_name`, `agent_id`, `agent_role`, `timestamp`.
- Also available: `Crew.task_callback`, `Crew.step_callback`, `Task.callback`.

Limits: there is no measurable per-agent percentage. Progress will be reported honestly as task counts (for example "1 of 3 tasks completed"), not invented percentages. `kickoff()` has no cooperative cancellation API.

## 6. Issues found (not yet changed)

1. **Import-time side effects:** importing the module builds the crew and raises if the key is missing. The API needs a factory function instead.
2. **Shared module-level crew:** reusing one `Crew` instance across API runs risks leaking state between runs. Each run should build a fresh crew.
3. **CWD-relative `report.md`:** a backend run would write it wherever the server was started.
4. **Prompt text defects:** several adjacent string literals are missing a space, so the LLM receives words joined together, e.g. `"key ideas, opportunities,risk"`, `"report about{topic}"`, `"strongestinsights"`, `"who need"` → `"whoneed"`. There are also typos (`oppotunities`, `seperates`, `imlpications`, `verifications`). These affect prompts, so I will **not** change them without your approval.

## 7. What must be preserved

- The three agents' roles, goals, backstories, LLM setting, `allow_delegation=False`, and empty tool lists.
- The three tasks, their order, and sequential process.
- `topic` as the input.
- `report.md` as the writer's output file.
- `python learn_crewai.py` continuing to work interactively.

## 8. Recommended integration approach

### Minimal refactor of `learn_crewai.py`

- Add `build_crew(model=None, output_file="report.md", extra_agents=(), extra_tasks=())` that creates **fresh** agent, task, and crew objects with the exact same definitions.
- Move the API key check into the factory or kickoff path so importing never raises.
- Keep module-level names (`researcher`, `analyst`, `writer`, the tasks, `research_crew`) for backward compatibility, built through the factory.
- Keep the `__main__` block's behaviour identical.
- Add a test that asserts the factory output matches the original definitions (roles, goals, backstories, task order, process, output file).

### Backend (`backend/app/`, FastAPI)

- `services/crewai_service.py` imports `learn_crewai.build_crew` and is the only place that touches CrewAI.
- The built-in agents are seeded into the registry as **built-in** records that point at the Python definitions. Python stays the source of truth; their prompts are read-only in the UI (only appearance is editable).
- Custom agents created in the UI are stored in SQLite as data (name, role, goal, backstory, allowlisted tool keys, allowlisted model, one task description and expected output). They are converted to CrewAI `Agent`/`Task` objects only from validated fields. Arbitrary code, import paths, and shell commands are never accepted.
- Custom participants are **appended after the original three tasks** by default, so the original workflow runs unchanged when no custom agents are enabled.
- Execution: one active run at a time (duplicate starts rejected with HTTP 409), run in a background worker thread, and a fresh crew per run.
- Each run writes into `runs/<run_id>/report.md`; on success the report is also copied to the root `report.md` to keep the existing behaviour.
- Events: an event-bus listener maps CrewAI events to app events (`workflow.*`, `task.*`, `agent.*`, `result.created`), persists them to SQLite with a per-run sequence number, then broadcasts them over WebSocket. Clients sync with a snapshot on connect and deduplicate or order by sequence number.
- On startup, runs left in `running` state from a crashed backend are marked `failed` ("interrupted by backend restart").
- Cancel: not offered in v1, because `kickoff()` cannot be stopped safely from a thread. If you want real cancellation, a later step can run the crew in a subprocess that can be terminated.

### Frontend (`frontend/`)

React, TypeScript, Vite, React Three Fiber, Drei, Zustand, Tailwind, and Lucide, as requested. The 3D scene is procedural, and the presentation screen uses Drei `<Html transform>` so Markdown stays crisp instead of being rasterised into a texture.

## 9. Proposed folder structure

```
MyOffice/
  learn_crewai.py            (kept in place; small factory refactor)
  report.md                  (still written on successful runs)
  ai_research_team/          (untouched)
  backend/
    app/
      main.py
      core/config.py
      api/routes/{agents,projects,runs,results,health}.py
      api/ws.py
      models/                (SQLAlchemy tables)
      schemas/               (Pydantic schemas)
      services/{crewai_service,agent_registry,workflow_manager,event_publisher,result_service,tool_registry}.py
      database/
    tests/
    requirements.txt
    .env.example
  frontend/                  (Vite app as described in the brief)
  runs/                      (per-run artifacts, gitignored)
  docs/{PROJECT_ANALYSIS,ARCHITECTURE,API}.md
  README.md
  .gitignore
```

## 10. Limitations and missing pieces

- FastAPI, SQLAlchemy, and pytest must be installed into `venv`.
- Real end-to-end runs use your OpenAI key and cost credits. Unit tests will mock the LLM.
- The original agents have no tools, so they cannot verify current facts. The tool allowlist for new agents will start small (for example, no tools, or `SerperDevTool` only if a `SERPER_API_KEY` is configured).
- The app is for local use only. It has no authentication.
