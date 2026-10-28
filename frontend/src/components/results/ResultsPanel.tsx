import { useEffect, useState } from 'react'
import { Download, MonitorPlay, RefreshCw } from 'lucide-react'
import type { Artifact, Run } from '../../types/api'
import { useWorkplace } from '../../stores/workplaceStore'
import { api, errorMessage } from '../../services/api'
import { RUN_META, duration } from '../../lib/format'
import { Button, Chip, PanelHeader } from '../ui'

export function ResultsPanel() {
  const presentRun = useWorkplace((s) => s.presentRun)
  const currentRun = useWorkplace((s) => s.run)
  const [runs, setRuns] = useState<Run[]>([])
  const [reports, setReports] = useState<Record<string, Artifact | null>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await api.listRuns()
      setRuns(list)
      const entries = await Promise.all(
        list.filter((r) => r.has_result).slice(0, 30).map(async (r) => {
          const arts = await api.artifacts(r.id).catch(() => [])
          return [r.id, arts.find((a) => a.kind === 'report') ?? null] as const
        }),
      )
      setReports(Object.fromEntries(entries))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
  }, [currentRun?.status])

  return (
    <div>
      <PanelHeader title="Results" subtitle="Every run is saved. Present any past result on the big screen."
        actions={<Button variant="ghost" onClick={load} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</Button>} />
      {error && <p role="alert" className="px-5 pt-3 text-sm text-rose-300">{error}</p>}
      <div className="space-y-2 p-5" data-testid="run-list">
        {runs.length === 0 && !loading && <p className="text-sm text-slate-400">No runs yet.</p>}
        {runs.map((r) => {
          const report = reports[r.id]
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="min-w-0 flex-1">
                <div className="truncate font-extrabold text-white">{r.inputs.topic ?? r.id}</div>
                <div className="text-xs text-slate-400">
                  {new Date(r.created_at).toLocaleString()} · {r.completed_tasks}/{r.total_tasks} tasks
                  {r.started_at && ` · ${duration(r.started_at, r.completed_at)}`} · {r.participants.length} agents
                </div>
                {r.error_message && <div className="mt-1 truncate text-xs text-rose-300" title={r.error_message}>{r.error_message}</div>}
              </div>
              <Chip className={RUN_META[r.status].chip}>{RUN_META[r.status].label}</Chip>
              {report && (
                <a href={api.artifactUrl(report)} download={report.filename}
                  className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20">
                  <Download className="h-4 w-4" /> report.md
                </a>
              )}
              <Button variant="primary" disabled={!r.has_result} onClick={() => void presentRun(r.id)}>
                <MonitorPlay className="h-4 w-4" /> Present
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
