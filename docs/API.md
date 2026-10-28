# API reference

Base URL: `http://127.0.0.1:8000`. The Vite dev server proxies `/api` and `/ws` to it, so the frontend uses relative URLs. Interactive OpenAPI docs are at `/docs` while the backend runs.

All timestamps are UTC ISO-8601 strings ending in `Z`.

## Errors

Every error has the same shape:

```json
{ "error": { "code": "conflict", "message": "A workflow is already running", "details": { "run_id": "run_3f0c2a9b1d4e" } } }
```

| Status | `code` | When |
| --- | --- | --- |
| 400 | `bad_request` | Generic invalid request |
| 404 | `not_found` | Unknown agent, run or artifact |
| 404, 405, … | `http_error` | Unknown route or method |
| 409 | `conflict` | A run is already active; the agent is part of the running workflow; reset during a run; participant limit; desk taken |
| 422 | `validation_failed` | Validation failed. For schema errors `details` is `[{loc, msg}]`; for business rules it is a list of strings. |
| 503 | `not_ready` | `OPENAI_API_KEY` is not configured |
| 500 | `internal_error` | Unexpected error. No trace is returned; see the backend console. |

## Health and configuration

| Method and path | Description |
| --- | --- |
| `GET /api/health` | `{status, version, crewai_version, openai_key_configured, schema_version, active_run_id}`. Shows whether the key is set, never the key itself. |
| `GET /api/tools` | Allowlisted tools: `[{key, label, description, available, unavailable_reason}]` |
| `GET /api/models` | `{default, allowed}` approved model names |
| `GET /api/settings` | `{default_topic, auto_present}` |
| `PATCH /api/settings` | Partial update of the same fields. Unknown fields are rejected. |

## Projects and runs

| Method and path | Description |
| --- | --- |
| `GET /api/projects` | Available crews. Currently one: `ai-research-team`. |
| `GET /api/projects/{project_id}` | `{id, name, description, process, inputs: [{name, label, description, required, max_length}], builtin_agent_count, default_inputs}` |
| `POST /api/projects/{project_id}/runs` | Starts a run. Body: `{"inputs": {"topic": "..."}}`. Returns **202** with a `Run`. Fails with 409 if a run is active, 422 for invalid inputs or a misconfigured custom agent, and 503 without a key. |
| `GET /api/runs?limit=50` | Recent runs, newest first |
| `GET /api/runs/{run_id}` | One `Run` |
| `GET /api/runs/{run_id}/tasks` | The run's tasks in execution order |
| `GET /api/runs/{run_id}/events?after_id=0&limit=500` | Events of one run |
| `GET /api/events` | Event search. Filters: `run_id`, `type`, `agent_id`, `level` (`info`, `success`, `warning`, `error`), `q` (text), `after_id`, `limit` (≤ 2000). |
| `GET /api/state` | Full snapshot, the same payload the WebSocket sends on connect |
| `POST /api/workspace/reset` | Returns agents to idle and clears the current run from the screen. Stored data is kept. 204, or 409 while a run is active. |

**Run**: `{id, project_id, status: queued|running|completed|failed, inputs, participants: [{agent_id, name, role, kind}], total_tasks, completed_tasks, created_at, started_at, completed_at, error_message, has_result}`

**Task**: `{id, run_id, position, key, name, description, expected_output, agent_id, agent_name, agent_role, depends_on: [task ids], status: pending|running|completed|failed, started_at, completed_at, output_preview, error_message}`

## Results and files

| Method and path | Description |
| --- | --- |
| `GET /api/runs/{run_id}/results` | Presentation result (below). 404 until the run has one. |
| `GET /api/runs/{run_id}/artifacts` | `[{id, run_id, kind, filename, size, media_type, created_at, url}]`. Kinds: `report`, `task_output`, `result`. |
| `GET /api/runs/{run_id}/artifacts/{artifact_id}` | Downloads one file. Files are looked up by id only; no path parameter exists. |

**PresentationResult**:

```json
{
  "run_id": "run_e47f2511c2ad",
  "status": "completed",              // or "partial" (some tasks finished) or "failed"
  "warning": null,                    // set for partial results
  "title": "Report on …",             // first H1 of the report
  "summary": "…",                     // only from an explicit summary section, else null
  "sections": [{ "id": "s1", "title": "Executive Summary", "kind": "summary", "markdown": "…" }],
  "task_outputs": [{ "task_id": "…", "key": "research", "name": "Research brief", "agent_id": "agt_researcher", "agent_name": "Researcher", "status": "completed", "markdown": "…" }],
  "sources": [{ "label": "…", "url": "https://…" }],   // only links present in the text
  "report_markdown": "…",
  "artifacts": [ … ],
  "generated_at": "…"
}
```

The section `kind` is one of `intro`, `summary`, `findings`, `recommendations`, `risks`, `opportunities`, `verification`, `sources`, `conclusion` or `other`.

## Agents

| Method and path | Description |
| --- | --- |
| `GET /api/agents` | All agents with live runtime fields |
| `POST /api/agents` | Creates a custom agent (201) |
| `GET /api/agents/{agent_id}` | One agent |
| `PATCH /api/agents/{agent_id}` | Partial update. Built-in agents accept only `name`, `appearance` and `workstation`. |
| `DELETE /api/agents/{agent_id}` | Removes a custom agent (204). Built-ins return 422; agents in the running workflow return 409. |

**Create or update body** (unknown fields are rejected):

| Field | Rules |
| --- | --- |
| `name` | 1–60 characters |
| `role` | 2–120 characters |
| `goal` | 5–1000 characters; may use `{topic}` |
| `backstory` | 5–2000 characters; may use `{topic}` |
| `tools` | Up to 5 keys from `GET /api/tools` |
| `llm_model` | `null` (backend default) or a name from `GET /api/models` |
| `task_name` | Up to 80 characters |
| `task_description` | 10–4000 characters; may use `{topic}` |
| `task_expected_output` | 5–2000 characters |
| `enabled` | `true` adds the agent to future runs; it then requires `task_description` and `task_expected_output` |
| `workflow_order` | 0–1000; order among custom agents, which always run after the three built-ins |
| `appearance` | `{skin_color, shirt_color, pants_color, hair_color}` as `#rrggbb`, `hair_style` (`short`, `spiky`, `long`, `bun`, `cap`, `bald`), `accessory` (`none`, `glasses`, `headset`, `tie`, `badge`), `scale` 0.8–1.25 |
| `workstation` | Desk index 0–99, or `null` for the first free desk. Choosing a taken desk swaps with its owner (on update). |

At most 5 custom agents can be enabled at once.

**Agent** responses include all of the above plus `id`, `project_id`, `kind` (`builtin`, `custom`), `participant`, `created_at`, `updated_at` and the runtime fields:

- `status`: `idle`, `queued`, `working`, `completed` or `error`
- `current_task`, `current_task_id`
- `activity`: `thinking`, `tool`, `working` or `null`
- `last_activity`, `last_activity_at`
- `progress`: always `null`, because CrewAI reports no percentage
- `started_at`, `completed_at`, `error_message`, `run_id`

## WebSocket

`ws://127.0.0.1:8000/ws` carries all events. `/ws/runs/{run_id}` carries only that run's events; registry and reset events are not included.

Server to client:

```json
{ "kind": "snapshot", "snapshot": { /* same as GET /api/state */ } }
{ "kind": "event", "event": { "id": 123, "run_id": "run_…", "type": "task.completed", "timestamp": "…", "level": "success",
                              "agent_id": "…", "agent_name": "…", "task_id": "…", "task_name": "…", "message": "…", "data": { } } }
{ "kind": "resync" }   // the client fell behind; a fresh snapshot follows
{ "kind": "pong" }
```

Client to server: `{"type": "ping"}` or `{"type": "sync"}` (requests a new snapshot).

A snapshot is sent on every connect. Event ids increase monotonically, so a client should ignore any event whose `id` is at or below the last id it has applied, including `snapshot.last_event_id`.

### Event types

| Type | `data` |
| --- | --- |
| `workflow.queued` | `run`, `tasks` |
| `workflow.started` | `run` |
| `workflow.completed` | `run` |
| `workflow.failed` | `run`, `error` (redacted) |
| `task.started`, `task.completed`, `task.failed` | `task`; `task.completed` also includes `progress: {completed, total}` |
| `agent.queued`, `agent.started`, `agent.completed`, `agent.failed` | `agent` (runtime fields) |
| `agent.progress` | `agent`, `activity_kind` (`thinking`, `tool` or `working`). The message names the underlying CrewAI signal, such as a model call, a tool call or reading the task. |
| `agent.registered`, `agent.updated` | `agent` (full record) |
| `agent.removed` | `agent_id` |
| `result.created` | `run_id`, `title`, `status` |
| `workspace.reset` | none |
