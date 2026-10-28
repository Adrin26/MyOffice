import { AlertOctagon, Crosshair, Search, X } from 'lucide-react'
import type { Agent } from '../../types/api'
import { STATUS_META, duration, relativeTime } from '../../lib/format'
import { useWorkplace } from '../../stores/workplaceStore'
import { Button, Chip } from '../ui'
import { useNow } from '../../hooks/useNow'

const ACTIVITY_LABEL: Record<string, string> = {
  thinking: 'Waiting on a model call',
  tool: 'Running a tool',
  working: 'Executing its task',
}

export function AgentDetails({ agent }: { agent: Agent }) {
  const now = useNow(5000)
  const selectAgent = useWorkplace((s) => s.selectAgent)
  const editAgent = useWorkplace((s) => s.editAgent)
  const setCameraMode = useWorkplace((s) => s.setCameraMode)
  const meta = STATUS_META[agent.status]
  return (
    <div className="space-y-4" data-testid="agent-details">
      <div className="flex items-start gap-3">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border-2 border-white/20" style={{ background: agent.appearance.shirt_color }}>
          <div className="h-7 w-7 rounded-md" style={{ background: agent.appearance.skin_color }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-black text-white">{agent.name}</div>
          <div className="truncate text-sm text-slate-300">{agent.role}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Chip className={meta.chip}>{meta.label}</Chip>
            <Chip className="bg-white/5 text-slate-300 ring-white/10">{agent.kind === 'builtin' ? 'learn_crewai.py' : 'Custom'}</Chip>
            {!agent.participant && <Chip className="bg-white/5 text-slate-400 ring-white/10">Not in workflow</Chip>}
          </div>
        </div>
        <button aria-label="Clear selection" className="rounded-lg p-1 text-slate-400 hover:bg-white/10" onClick={() => selectAgent(null)}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm">
        <dt className="text-slate-400">Current task</dt>
        <dd className="text-white">{agent.current_task ?? agent.task_name ?? '—'}</dd>
        <dt className="text-slate-400">Activity</dt>
        <dd className="text-white">
          {agent.status === 'working' ? ACTIVITY_LABEL[agent.activity ?? 'working'] ?? 'Working' : meta.label}
        </dd>
        <dt className="text-slate-400">Last activity</dt>
        <dd className="text-white">
          {agent.last_activity ?? '—'}
          {agent.last_activity_at && <span className="block text-xs text-slate-400">{relativeTime(agent.last_activity_at, now)}</span>}
        </dd>
        <dt className="text-slate-400">Progress</dt>
        <dd className="text-slate-300">
          {agent.progress !== null
            ? `${Math.round(agent.progress * 100)}%`
            : agent.status === 'completed' ? 'Done' : 'Not measurable (CrewAI reports start and finish only)'}
        </dd>
        {agent.started_at && (
          <>
            <dt className="text-slate-400">Duration</dt>
            <dd className="text-white">{duration(agent.started_at, agent.completed_at)}</dd>
          </>
        )}
      </dl>

      {agent.error_message && (
        <div role="alert" className="flex gap-2 rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-100">
          <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="break-words">{agent.error_message}</span>
        </div>
      )}

      <div className="rounded-xl bg-white/5 p-3 text-xs text-slate-300">
        <div className="mb-1 font-black uppercase tracking-wider text-slate-400">Goal</div>
        <p className="line-clamp-4">{agent.goal}</p>
      </div>

      <div className="flex gap-2">
        <Button variant="primary" className="flex-1" onClick={() => editAgent(agent.id)}>
          <Search className="h-4 w-4" /> Inspect
        </Button>
        <Button variant="secondary" onClick={() => setCameraMode('focus')} title="Focus camera">
          <Crosshair className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
