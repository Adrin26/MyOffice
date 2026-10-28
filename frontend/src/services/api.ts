import type {
  Agent, AgentInput, AppSettings, Artifact, Health, ModelsInfo, PresentationResult, Project, Run,
  StateSnapshot, Task, ToolInfo, WorkplaceEvent,
} from '../types/api'

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

export class ApiError extends Error {
  status: number
  code: string
  details: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }

  /** Human-readable message including validation details. */
  get detailText(): string {
    if (Array.isArray(this.details) && this.details.length) {
      return this.details
        .map((d) => (typeof d === 'string' ? d : (d as { msg?: string; loc?: unknown[] }).msg
          ? `${((d as { loc?: unknown[] }).loc ?? []).slice(1).join('.')}: ${(d as { msg: string }).msg}`
          : JSON.stringify(d)))
        .join('; ')
    }
    return ''
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(BASE + path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch {
    throw new ApiError(0, 'network_error', 'Cannot reach the backend. Is it running on port 8000?')
  }
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const err = body?.error
    throw new ApiError(res.status, err?.code ?? 'http_error', err?.message ?? res.statusText, err?.details)
  }
  return body as T
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })

export const api = {
  health: () => request<Health>('/api/health'),
  state: () => request<StateSnapshot>('/api/state'),
  projects: () => request<Project[]>('/api/projects'),

  listAgents: () => request<Agent[]>('/api/agents'),
  createAgent: (input: AgentInput) => request<Agent>('/api/agents', json('POST', input)),
  updateAgent: (id: string, patch: Partial<AgentInput>) =>
    request<Agent>(`/api/agents/${encodeURIComponent(id)}`, json('PATCH', patch)),
  deleteAgent: (id: string) => request<void>(`/api/agents/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  tools: () => request<ToolInfo[]>('/api/tools'),
  models: () => request<ModelsInfo>('/api/models'),
  getSettings: () => request<AppSettings>('/api/settings'),
  updateSettings: (patch: Partial<AppSettings>) => request<AppSettings>('/api/settings', json('PATCH', patch)),

  startRun: (projectId: string, inputs: Record<string, string>) =>
    request<Run>(`/api/projects/${encodeURIComponent(projectId)}/runs`, json('POST', { inputs })),
  listRuns: () => request<Run[]>('/api/runs'),
  getRun: (id: string) => request<Run>(`/api/runs/${encodeURIComponent(id)}`),
  runTasks: (id: string) => request<Task[]>(`/api/runs/${encodeURIComponent(id)}/tasks`),
  runEvents: (id: string) => request<WorkplaceEvent[]>(`/api/runs/${encodeURIComponent(id)}/events`),
  results: (id: string) => request<PresentationResult>(`/api/runs/${encodeURIComponent(id)}/results`),
  artifacts: (id: string) => request<Artifact[]>(`/api/runs/${encodeURIComponent(id)}/artifacts`),
  searchEvents: (params: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v))
    return request<WorkplaceEvent[]>(`/api/events?${q}`)
  },
  resetWorkspace: () => request<void>('/api/workspace/reset', { method: 'POST' }),
  artifactUrl: (a: Artifact) => BASE + a.url,
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.detailText ? `${e.message}: ${e.detailText}` : e.message
  if (e instanceof Error) return e.message
  return String(e)
}
