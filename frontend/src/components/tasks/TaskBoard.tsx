import type { Task, TaskStatus } from '../../types/api'
import { useWorkplace } from '../../stores/workplaceStore'
import { sortedTasks } from '../../lib/sync'
import { TASK_META, duration } from '../../lib/format'
import { PanelHeader } from '../ui'

const COLUMNS: { status: TaskStatus; title: string }[] = [
  { status: 'pending', title: 'Pending' },
  { status: 'running', title: 'Running' },
  { status: 'completed', title: 'Completed' },
  { status: 'failed', title: 'Failed' },
]

export function TaskBoard() {
  const tasksMap = useWorkplace((s) => s.tasks)
  const run = useWorkplace((s) => s.run)
  const tasks = sortedTasks(tasksMap)
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t]))

  return (
    <div>
      <PanelHeader
        title="Tasks"
        subtitle={run ? `Run ${run.id} · "${run.inputs.topic}" · ${run.status}` : 'No workflow has run yet. Start one from the top bar.'}
      />
      <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4" data-testid="task-board">
        {COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.status)
          return (
            <section key={col.status} aria-label={col.title} className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <h3 className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-300">
                {col.title}
                <span className="rounded-full bg-white/10 px-2">{items.length}</span>
              </h3>
              <div className="space-y-2">
                {items.length === 0 && <p className="text-xs text-slate-500">None</p>}
                {items.map((t) => <TaskCard key={t.id} task={t} byId={byId} />)}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function TaskCard({ task, byId }: { task: Task; byId: Record<string, Task> }) {
  const selectAgent = useWorkplace((s) => s.selectAgent)
  const agentExists = useWorkplace((s) => !!s.agents[task.agent_id])
  const previous = task.depends_on.length ? byId[task.depends_on[task.depends_on.length - 1]] : null
  return (
    <article className="rounded-xl border border-white/10 bg-slate-950/60 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="font-extrabold text-white">{task.position + 1}. {task.name}</div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold ring-1 ${TASK_META[task.status].chip}`}>{TASK_META[task.status].label}</span>
      </div>
      <button className="mt-1 text-xs font-bold text-amber-300 hover:underline disabled:text-slate-400 disabled:no-underline"
        disabled={!agentExists} onClick={() => selectAgent(task.agent_id)}>
        {task.agent_name} ({task.agent_role})
      </button>
      {previous && (
        <div className="mt-1 text-[11px] text-slate-400">
          Depends on: {task.depends_on.length === 1 ? previous.name : `${previous.name} and ${task.depends_on.length - 1} earlier task(s)`}
        </div>
      )}
      {task.started_at && <div className="text-[11px] text-slate-500">Duration: {duration(task.started_at, task.completed_at)}</div>}
      {task.output_preview && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-bold text-slate-300">Output preview</summary>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-2 text-[11px] text-slate-300">{task.output_preview}</pre>
        </details>
      )}
      {task.error_message && <p className="mt-2 rounded-lg bg-rose-500/10 p-2 text-xs text-rose-200">{task.error_message}</p>}
    </article>
  )
}
