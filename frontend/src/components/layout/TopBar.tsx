import { Camera, Expand, Grid2x2, MonitorPlay, Play, RotateCcw, Settings, Wifi, WifiOff } from 'lucide-react'
import { useWorkplace } from '../../stores/workplaceStore'
import { RUN_META } from '../../lib/format'
import { api, errorMessage } from '../../services/api'
import { Button, Chip, IconButton } from '../ui'

export function TopBar() {
  const project = useWorkplace((s) => s.project)
  const agents = useWorkplace((s) => s.agents)
  const run = useWorkplace((s) => s.run)
  const active = useWorkplace((s) => s.active)
  const connection = useWorkplace((s) => s.connection)
  const setStartDialog = useWorkplace((s) => s.setStartDialog)
  const setCameraMode = useWorkplace((s) => s.setCameraMode)
  const setPanel = useWorkplace((s) => s.setPanel)
  const confirm = useWorkplace((s) => s.confirm)
  const toast = useWorkplace((s) => s.toast)
  const presentRun = useWorkplace((s) => s.presentRun)
  const selectAgent = useWorkplace((s) => s.selectAgent)
  const closePresentation = useWorkplace((s) => s.closePresentation)

  const list = Object.values(agents)
  const participants = list.filter((a) => a.participant).length
  const meta = RUN_META[run?.status ?? 'none']
  const pct = run && run.total_tasks ? Math.round((run.completed_tasks / run.total_tasks) * 100) : 0

  const reset = async () => {
    const ok = await confirm({
      title: 'Reset the workspace?',
      message: 'Agents return to idle and the current run is cleared from view. Saved runs and results are kept.',
      confirmLabel: 'Reset',
      danger: true,
    })
    if (!ok) return
    try {
      await api.resetWorkspace()
      selectAgent(null, false)
      closePresentation()
    } catch (e) {
      toast({ level: 'error', title: 'Reset failed', message: errorMessage(e) })
    }
  }

  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen?.()
  }

  return (
    <header className="z-30 flex h-16 shrink-0 items-center gap-4 border-b border-white/10 bg-slate-900/95 px-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-400 shadow-[0_4px_0_#b45309]">
          <div className="flex gap-1"><span className="h-2 w-2 bg-slate-900" /><span className="h-2 w-2 bg-slate-900" /></div>
        </div>
        <div className="min-w-0">
          <div className="truncate text-base font-black leading-tight text-white">{project?.name ?? 'CrewAI Workplace'}</div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Chip className={meta.chip}>{meta.label}</Chip>
            <span>{list.length} agents · {participants} in workflow</span>
          </div>
        </div>
      </div>

      <div className="hidden min-w-[180px] max-w-sm flex-1 items-center gap-3 md:flex" aria-label="Overall task progress">
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="whitespace-nowrap text-xs font-bold text-slate-300">
          {run ? `${run.completed_tasks}/${run.total_tasks} tasks` : 'No run yet'}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span
          className={`hidden items-center gap-1 text-xs font-bold lg:inline-flex ${connection === 'open' ? 'text-emerald-300' : 'text-amber-300'}`}
          title="Live connection to the backend"
        >
          {connection === 'open' ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
          {connection === 'open' ? 'Live' : connection === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
        </span>
        <Button variant="success" onClick={() => setStartDialog(true)} disabled={active || connection !== 'open'} title={active ? 'A workflow is already running' : 'Start the CrewAI workflow'}>
          <Play className="h-4 w-4" /> {active ? 'Running…' : 'Start'}
        </Button>
        <Button variant="secondary" onClick={reset} disabled={active || !run} title={active ? 'Cannot reset during a run' : 'Reset workspace view'}>
          <RotateCcw className="h-4 w-4" /> <span className="hidden xl:inline">Reset</span>
        </Button>
        {run?.has_result && (
          <IconButton label="Show findings on the big screen" onClick={() => void presentRun(run.id)}>
            <MonitorPlay className="h-5 w-5" />
          </IconButton>
        )}
        <IconButton label="Overview camera" onClick={() => { selectAgent(null, false); setCameraMode('overview') }}>
          <Camera className="h-5 w-5" />
        </IconButton>
        <IconButton label="Top-down camera" onClick={() => setCameraMode('top')}>
          <Grid2x2 className="h-5 w-5" />
        </IconButton>
        <IconButton label="Settings" onClick={() => setPanel('settings')}>
          <Settings className="h-5 w-5" />
        </IconButton>
        <IconButton label="Toggle fullscreen" onClick={fullscreen}>
          <Expand className="h-5 w-5" />
        </IconButton>
      </div>
    </header>
  )
}
