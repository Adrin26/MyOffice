import { Activity, Building2, ClipboardList, Presentation, Settings, UserPlus, Users } from 'lucide-react'
import { useWorkplace, type PanelId } from '../../stores/workplaceStore'

const ITEMS: { id: PanelId; label: string; icon: typeof Users }[] = [
  { id: 'workspace', label: 'Workspace', icon: Building2 },
  { id: 'agents', label: 'Agents', icon: Users },
  { id: 'add-agent', label: 'Add Agent', icon: UserPlus },
  { id: 'tasks', label: 'Tasks', icon: ClipboardList },
  { id: 'results', label: 'Results', icon: Presentation },
  { id: 'logs', label: 'Activity Logs', icon: Activity },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const panel = useWorkplace((s) => s.panel)
  const setPanel = useWorkplace((s) => s.setPanel)
  return (
    <nav aria-label="Main" className="z-20 flex w-16 shrink-0 flex-col gap-1 border-r border-white/10 bg-slate-900/95 p-2 lg:w-52">
      {ITEMS.map(({ id, label, icon: Icon }) => {
        const activeItem = panel === id
        return (
          <button
            key={id}
            onClick={() => setPanel(id)}
            aria-current={activeItem ? 'page' : undefined}
            title={label}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-extrabold transition ${
              activeItem
                ? 'bg-amber-400 text-slate-900 shadow-[0_3px_0_#b45309]'
                : 'text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="hidden lg:inline">{label}</span>
          </button>
        )
      })}
      <div className="mt-auto hidden rounded-xl bg-white/5 p-3 text-[11px] leading-snug text-slate-400 lg:block">
        Avatars show statuses reported by the CrewAI backend. Animations are visual only.
      </div>
    </nav>
  )
}
