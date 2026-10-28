import { X } from 'lucide-react'
import { useWorkplace } from '../../stores/workplaceStore'
import { AgentsPanel } from '../agents/AgentsPanel'
import { AgentForm } from '../agents/AgentForm'
import { TaskBoard } from '../tasks/TaskBoard'
import { ActivityLog } from '../activity/ActivityLog'
import { ResultsPanel } from '../results/ResultsPanel'
import { SettingsPanel } from '../settings/SettingsPanel'
import { PanelHeader } from '../ui'

/** Slide-over drawer above the 3D office for every sidebar section except Workspace. */
export function PanelHost() {
  const panel = useWorkplace((s) => s.panel)
  const setPanel = useWorkplace((s) => s.setPanel)
  const editAgent = useWorkplace((s) => s.editAgent)
  if (panel === 'workspace') return null

  return (
    <div className="absolute inset-y-3 left-3 z-20 flex w-[min(980px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur">
      <button aria-label="Close panel" onClick={() => setPanel('workspace')}
        className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
        <X className="h-5 w-5" />
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto pr-8">
        {panel === 'agents' && <AgentsPanel />}
        {panel === 'add-agent' && (
          <div>
            <PanelHeader title="Add Agent" subtitle="Registers a new agent. It joins future runs only when you include it and give it a task." />
            <div className="p-5">
              <AgentForm onDone={(a) => editAgent(a.id)} />
            </div>
          </div>
        )}
        {panel === 'tasks' && <TaskBoard />}
        {panel === 'results' && <ResultsPanel />}
        {panel === 'logs' && <ActivityLog />}
        {panel === 'settings' && <SettingsPanel />}
      </div>
    </div>
  )
}
