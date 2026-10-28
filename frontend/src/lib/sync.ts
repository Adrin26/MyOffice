import type { Agent, AgentRuntime, Project, Run, StateSnapshot, Task, WorkplaceEvent } from '../types/api'

export const MAX_EVENTS = 500

/** The part of the client state that is derived purely from the backend. */
export interface SyncState {
  project: Project | null
  agents: Record<string, Agent>
  run: Run | null
  tasks: Record<string, Task>
  events: WorkplaceEvent[]
  lastEventId: number
  active: boolean
  synced: boolean
}

export const emptySync: SyncState = {
  project: null,
  agents: {},
  run: null,
  tasks: {},
  events: [],
  lastEventId: 0,
  active: false,
  synced: false,
}

const IDLE_RUNTIME: AgentRuntime = {
  status: 'idle', current_task: null, current_task_id: null, activity: null, last_activity: null,
  last_activity_at: null, progress: null, started_at: null, completed_at: null, error_message: null,
  run_id: null,
}

const RUNTIME_KEYS = Object.keys(IDLE_RUNTIME) as (keyof AgentRuntime)[]

const byId = <T extends { id: string }>(items: T[]): Record<string, T> =>
  Object.fromEntries(items.map((i) => [i.id, i]))

/** Replace all backend-derived state; the snapshot is authoritative. */
export function applySnapshot(_prev: SyncState, snap: StateSnapshot): SyncState {
  return {
    project: snap.project,
    agents: byId(snap.agents),
    run: snap.current_run,
    tasks: byId(snap.tasks),
    events: snap.recent_events.slice(-MAX_EVENTS),
    lastEventId: snap.last_event_id,
    active: snap.active,
    synced: true,
  }
}

function pickRuntime(data: Partial<AgentRuntime>): Partial<AgentRuntime> {
  const out: Partial<AgentRuntime> = {}
  for (const k of RUNTIME_KEYS) if (k in data) (out as Record<string, unknown>)[k] = data[k]
  return out
}

/**
 * Apply one live event. Events at or below lastEventId are duplicates (already
 * reflected in a snapshot or received twice) and are ignored.
 */
export function applyEvent(prev: SyncState, e: WorkplaceEvent): SyncState {
  if (e.id <= prev.lastEventId) return prev
  const next: SyncState = {
    ...prev,
    lastEventId: e.id,
    events: [...prev.events, e].slice(-MAX_EVENTS),
  }
  const data = e.data ?? {}

  const run = data.run as Run | undefined
  if (run) {
    const isNewRun = run.id !== prev.run?.id
    next.run = run
    next.active = run.status === 'queued' || run.status === 'running'
    if (isNewRun) {
      next.tasks = {}
      // Agents outside the new run return to idle, as on the backend.
      const inRun = new Set(run.participants.map((p) => p.agent_id))
      next.agents = Object.fromEntries(
        Object.entries(prev.agents).map(([id, a]) => [id, inRun.has(id) ? a : { ...a, ...IDLE_RUNTIME }]),
      )
    }
  }

  const tasks = data.tasks as Task[] | undefined
  if (tasks) next.tasks = byId(tasks)

  const task = data.task as Task | undefined
  if (task && (!next.run || task.run_id === next.run.id)) {
    next.tasks = { ...next.tasks, [task.id]: task }
  }

  const progress = data.progress as { completed: number; total: number } | undefined
  if (progress && next.run && e.run_id === next.run.id) {
    next.run = { ...next.run, completed_tasks: progress.completed, total_tasks: progress.total }
  }

  const agentData = data.agent as (Partial<Agent> & { id: string }) | undefined
  switch (e.type) {
    case 'agent.registered':
    case 'agent.updated':
      if (agentData) next.agents = { ...next.agents, [agentData.id]: agentData as Agent }
      break
    case 'agent.removed': {
      const id = (data.agent_id as string) ?? e.agent_id
      if (id) {
        const rest = { ...next.agents }
        delete rest[id]
        next.agents = rest
      }
      break
    }
    case 'workspace.reset':
      next.run = null
      next.tasks = {}
      next.active = false
      next.agents = Object.fromEntries(
        Object.entries(next.agents).map(([id, a]) => [id, { ...a, ...IDLE_RUNTIME }]),
      )
      break
    default:
      if (agentData && e.type.startsWith('agent.') && next.agents[agentData.id]) {
        next.agents = {
          ...next.agents,
          [agentData.id]: { ...next.agents[agentData.id], ...pickRuntime(agentData) },
        }
      }
  }
  return next
}

export function sortedAgents(agents: Record<string, Agent>): Agent[] {
  return Object.values(agents).sort(
    (a, b) =>
      (a.kind === 'builtin' ? 0 : 1) - (b.kind === 'builtin' ? 0 : 1) ||
      a.workflow_order - b.workflow_order ||
      a.created_at.localeCompare(b.created_at),
  )
}

export function sortedTasks(tasks: Record<string, Task>): Task[] {
  return Object.values(tasks).sort((a, b) => a.position - b.position)
}
