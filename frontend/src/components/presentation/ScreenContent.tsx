import { Loader2, MonitorPlay, Play } from 'lucide-react'
import { useWorkplace } from '../../stores/workplaceStore'
import { sortedAgents, sortedTasks } from '../../lib/sync'
import { STATUS_META, TASK_META } from '../../lib/format'
import { ReportView } from './ReportView'

/** What the giant office screen shows: the report, live progress, or a welcome board. */
export function ScreenContent({ dense = false }: { dense?: boolean }) {
  const presentation = useWorkplace((s) => s.presentation)
  const setSection = useWorkplace((s) => s.setSection)
  const run = useWorkplace((s) => s.run)
  const active = useWorkplace((s) => s.active)

  if (presentation.open) {
    if (presentation.loading) return <Centered><Loader2 className="h-16 w-16 animate-spin text-amber-300" /><p>Loading findings…</p></Centered>
    if (presentation.error) return <Centered><p className="text-rose-300">Could not load results: {presentation.error}</p></Centered>
    if (presentation.result)
      return (
        <ReportView
          result={presentation.result}
          section={presentation.section}
          onSection={setSection}
          topic={run?.id === presentation.result.run_id ? run.inputs.topic : undefined}
          dense={dense}
        />
      )
  }
  if (active && run) return <LiveBoard />
  return <WelcomeBoard />
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center gap-4 text-2xl font-bold text-slate-200">{children}</div>
}

function LiveBoard() {
  const run = useWorkplace((s) => s.run)!
  const tasks = useWorkplace((s) => s.tasks)
  const agents = useWorkplace((s) => s.agents)
  const list = sortedTasks(tasks)
  return (
    <div className="flex h-full flex-col text-[22px]">
      <div className="text-[0.7em] font-black uppercase tracking-[0.3em] text-sky-300">Live workflow</div>
      <h1 className="truncate text-[2em] font-black text-white">{run.inputs.topic}</h1>
      <div className="mt-2 flex items-center gap-4">
        <div className="h-4 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all"
            style={{ width: `${run.total_tasks ? (run.completed_tasks / run.total_tasks) * 100 : 0}%` }} />
        </div>
        <span className="font-extrabold text-slate-200">{run.completed_tasks} / {run.total_tasks} tasks</span>
      </div>
      <div className="mt-6 grid flex-1 auto-rows-min gap-3">
        {list.map((t) => {
          const agent = agents[t.agent_id]
          return (
            <div key={t.id} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-3">
              <span className="text-[0.8em] font-black text-slate-500">{t.position + 1}</span>
              <span className="h-10 w-10 shrink-0 rounded-lg border-2 border-white/30" style={{ background: agent?.appearance.shirt_color ?? '#64748b' }} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-extrabold text-white">{t.name}</div>
                <div className="truncate text-[0.7em] text-slate-400">
                  {t.agent_name}{agent?.status === 'working' && agent.last_activity ? ` · ${agent.last_activity}` : ''}
                </div>
              </div>
              <span className={`rounded-full px-3 py-1 text-[0.65em] font-extrabold ring-1 ${TASK_META[t.status].chip}`}>
                {TASK_META[t.status].label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WelcomeBoard() {
  const project = useWorkplace((s) => s.project)
  const agents = useWorkplace((s) => s.agents)
  const run = useWorkplace((s) => s.run)
  const presentRun = useWorkplace((s) => s.presentRun)
  const list = sortedAgents(agents).filter((a) => a.participant)
  return (
    <div className="flex h-full flex-col text-[22px]">
      <div className="flex items-center gap-3 text-[0.7em] font-black uppercase tracking-[0.3em] text-amber-300">
        <MonitorPlay className="h-6 w-6" /> Presentation wall
      </div>
      <h1 className="text-[2.4em] font-black leading-tight text-white">{project?.name ?? 'CrewAI Workplace'}</h1>
      <p className="mt-1 max-w-4xl text-slate-300">{project?.description}</p>
      <div className="mt-6 text-[0.7em] font-black uppercase tracking-widest text-slate-400">Workflow line-up</div>
      <div className="mt-2 flex flex-wrap gap-3">
        {list.map((a, i) => (
          <div key={a.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-2">
            <span className="text-[0.75em] font-black text-slate-500">{i + 1}</span>
            <span className="h-8 w-8 rounded-md border-2 border-white/30" style={{ background: a.appearance.shirt_color }} />
            <div>
              <div className="font-extrabold text-white">{a.name}</div>
              <div className="text-[0.65em] font-bold" style={{ color: STATUS_META[a.status].color }}>{a.role}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center gap-4 rounded-2xl border border-amber-300/30 bg-amber-400/10 px-5 py-4">
        <Play className="h-8 w-8 text-amber-300" />
        <div className="flex-1 font-bold text-amber-100">
          {run?.has_result
            ? `Last run ${run.status}: "${run.inputs.topic}".`
            : 'Press Start in the top bar to run the real CrewAI workflow. Findings will appear here automatically.'}
        </div>
        {run?.has_result && (
          <button onClick={() => void presentRun(run.id)}
            className="rounded-xl bg-amber-400 px-4 py-2 text-[0.75em] font-black text-slate-900 shadow-[0_4px_0_#b45309]">
            Show findings
          </button>
        )}
      </div>
    </div>
  )
}
