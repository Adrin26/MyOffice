import { MousePointerClick } from 'lucide-react'
import { useWorkplace } from '../../stores/workplaceStore'
import { sortedAgents } from '../../lib/sync'
import { STATUS_META } from '../../lib/format'
import { AgentDetails } from '../agents/AgentDetails'

export function RightPanel() {
  const agents = useWorkplace((s) => s.agents)
  const selectedId = useWorkplace((s) => s.selectedAgentId)
  const selectAgent = useWorkplace((s) => s.selectAgent)
  const hoverAgent = useWorkplace((s) => s.hoverAgent)
  const selected = selectedId ? agents[selectedId] : null
  const list = sortedAgents(agents)

  return (
    <aside aria-label="Agent monitor" className="z-20 hidden w-80 shrink-0 flex-col border-l border-white/10 bg-slate-900/95 lg:flex">
      <div className="border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-black uppercase tracking-wider text-slate-300">Agent monitor</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {selected ? (
          <AgentDetails agent={selected} />
        ) : (
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-white/5 p-3 text-xs text-slate-300">
            <MousePointerClick className="h-4 w-4 shrink-0 text-amber-300" />
            Click an avatar in the office, or pick an agent below, to inspect it.
          </div>
        )}
        <div className="mt-5 space-y-1.5">
          <div className="text-xs font-black uppercase tracking-wider text-slate-400">Crew</div>
          {list.map((a) => (
            <button
              key={a.id}
              onClick={() => selectAgent(a.id)}
              onMouseEnter={() => hoverAgent(a.id)}
              onMouseLeave={() => hoverAgent(null)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                a.id === selectedId ? 'bg-amber-400/15 ring-1 ring-amber-300/50' : 'hover:bg-white/5'
              }`}
            >
              <span className="h-7 w-7 shrink-0 rounded-md border-2 border-white/20" style={{ background: a.appearance.shirt_color }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-white">{a.name}</span>
                <span className="block truncate text-xs text-slate-400">{a.current_task ?? a.role}</span>
              </span>
              <span className="flex items-center gap-1 text-xs font-bold" style={{ color: STATUS_META[a.status].color }}>
                <span className={`h-2 w-2 rounded-full ${a.status === 'working' ? 'animate-pulse' : ''}`} style={{ background: STATUS_META[a.status].color }} />
                {STATUS_META[a.status].label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
