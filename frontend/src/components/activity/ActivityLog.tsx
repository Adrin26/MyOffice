import { useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { EventLevel, WorkplaceEvent } from '../../types/api'
import { useWorkplace } from '../../stores/workplaceStore'
import { api, errorMessage } from '../../services/api'
import { LEVEL_COLOR } from '../../lib/format'
import { Button, PanelHeader, inputClass } from '../ui'
import { LEVEL_ICON } from '../layout/BottomPanel'

export function filterEvents(
  events: WorkplaceEvent[],
  f: { q: string; agentId: string; level: string; type: string },
): WorkplaceEvent[] {
  const q = f.q.trim().toLowerCase()
  return events.filter(
    (e) =>
      (!f.agentId || e.agent_id === f.agentId) &&
      (!f.level || e.level === f.level) &&
      (!f.type || e.type === f.type) &&
      (!q || `${e.message} ${e.agent_name ?? ''} ${e.task_name ?? ''} ${e.type}`.toLowerCase().includes(q)),
  )
}

export function ActivityLog() {
  const live = useWorkplace((s) => s.events)
  const agents = useWorkplace((s) => s.agents)
  const [history, setHistory] = useState<WorkplaceEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [f, setF] = useState({ q: '', agentId: '', level: '', type: '' })

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setHistory(await api.searchEvents({ limit: 1000 }))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
  }, [])

  const merged = useMemo(() => {
    const map = new Map<number, WorkplaceEvent>()
    for (const e of history) map.set(e.id, e)
    for (const e of live) map.set(e.id, e)
    return [...map.values()].sort((a, b) => b.id - a.id)
  }, [history, live])

  const types = useMemo(() => [...new Set(merged.map((e) => e.type))].sort(), [merged])
  const agentOptions = useMemo(() => {
    const names = new Map<string, string>()
    for (const e of merged) if (e.agent_id) names.set(e.agent_id, e.agent_name ?? agents[e.agent_id]?.name ?? e.agent_id)
    return [...names.entries()]
  }, [merged, agents])
  const rows = filterEvents(merged, f)

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="Activity logs" subtitle="Persisted backend events across all runs."
        actions={<Button variant="ghost" onClick={load} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</Button>} />
      <div className="grid gap-2 border-b border-white/10 p-4 md:grid-cols-4">
        <input aria-label="Search events" className={inputClass} placeholder="Search messages…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select aria-label="Filter by agent" className={inputClass} value={f.agentId} onChange={(e) => setF({ ...f, agentId: e.target.value })}>
          <option value="">All agents</option>
          {agentOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select aria-label="Filter by status" className={inputClass} value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}>
          <option value="">All levels</option>
          {(['info', 'success', 'warning', 'error'] as EventLevel[]).map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select aria-label="Filter by event type" className={inputClass} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          <option value="">All event types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      {error && <p role="alert" className="px-5 pt-3 text-sm text-rose-300">{error}</p>}
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <table className="w-full text-left text-xs" data-testid="activity-table">
          <thead className="sticky top-0 bg-slate-900 text-slate-400">
            <tr><th className="p-2">Time</th><th className="p-2">Event</th><th className="p-2">Agent</th><th className="p-2">Task</th><th className="p-2">Message</th></tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const Icon = LEVEL_ICON[e.level]
              const err = typeof e.data?.error === 'string' ? (e.data.error as string) : null
              return (
                <tr key={e.id} className="border-t border-white/5 align-top">
                  <td className="whitespace-nowrap p-2 text-slate-400">{new Date(e.timestamp).toLocaleString()}</td>
                  <td className="whitespace-nowrap p-2"><span className={`inline-flex items-center gap-1 font-bold ${LEVEL_COLOR[e.level]}`}><Icon className="h-3.5 w-3.5" />{e.type}</span></td>
                  <td className="p-2 text-slate-200">{e.agent_name ?? '—'}</td>
                  <td className="p-2 text-slate-300">{e.task_name ?? '—'}</td>
                  <td className="p-2 text-slate-100">{e.message}{err && err !== e.message && <div className="mt-1 text-rose-300">{err}</div>}</td>
                </tr>
              )
            })}
            {rows.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-slate-500">No matching events.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
