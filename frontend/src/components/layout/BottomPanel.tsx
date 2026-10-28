import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Info, XCircle } from 'lucide-react'
import { useWorkplace } from '../../stores/workplaceStore'
import { LEVEL_COLOR, clockTime } from '../../lib/format'
import type { EventLevel } from '../../types/api'

export const LEVEL_ICON: Record<EventLevel, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
}

export function BottomPanel() {
  const events = useWorkplace((s) => s.events)
  const setPanel = useWorkplace((s) => s.setPanel)
  const presenting = useWorkplace((s) => s.presentation.open && s.cameraMode === 'presentation')
  const [open, setOpen] = useState(!presenting)
  // Collapse while the wall display is framed (it would cover the report), reopen afterwards.
  const [wasPresenting, setWasPresenting] = useState(presenting)
  if (presenting !== wasPresenting) {
    setWasPresenting(presenting)
    setOpen(!presenting)
  }
  const recent = events.slice(-40).reverse()

  return (
    <section aria-label="Recent activity" className="pointer-events-auto absolute inset-x-3 bottom-3 z-10 rounded-2xl border border-white/10 bg-slate-900/85 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between px-4 py-2">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-300">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          Activity feed
          {events.length > 0 && <span className="rounded-full bg-white/10 px-2 text-[10px]">{events.length}</span>}
        </button>
        <button className="text-xs font-bold text-amber-300 hover:underline" onClick={() => setPanel('logs')}>Open full log</button>
      </div>
      {open && (
        <ol className="max-h-36 overflow-y-auto px-4 pb-3 font-mono text-xs" data-testid="activity-feed">
          {recent.length === 0 && <li className="text-slate-500">No activity yet. Start the workflow to see live events.</li>}
          {recent.map((e) => {
            const Icon = LEVEL_ICON[e.level]
            return (
              <li key={e.id} className="flex items-start gap-2 py-0.5">
                <span className="shrink-0 text-slate-500">{clockTime(e.timestamp)}</span>
                <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${LEVEL_COLOR[e.level]}`} />
                <span className="shrink-0 text-slate-400">{e.type}</span>
                <span className="min-w-0 text-slate-200">{e.message}</span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
