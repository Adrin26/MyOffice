import { Html } from '@react-three/drei'
import type { Agent } from '../types/api'
import { STATUS_META } from '../lib/format'
import { htmlPortal } from './shared'

const ACTIVITY_TEXT: Record<string, string> = {
  thinking: 'Thinking…',
  tool: 'Using a tool…',
  working: 'Working…',
}

/** Name tag above an avatar. Kept at a constant screen size so it never covers the avatar up close. */
export function FloatingAgentLabel({ agent, y, highlighted }: { agent: Agent; y: number; highlighted: boolean }) {
  const meta = STATUS_META[agent.status]
  const detail =
    agent.status === 'working'
      ? ACTIVITY_TEXT[agent.activity ?? 'working'] ?? 'Working…'
      : agent.status === 'error'
        ? 'Needs attention'
        : agent.status === 'queued'
          ? 'Waiting for turn'
          : null
  return (
    <Html position={[0, y, 0]} center zIndexRange={[20, 0]} portal={htmlPortal} style={{ pointerEvents: 'none' }}>
      <div
        className={`select-none whitespace-nowrap rounded-lg border-2 px-2 py-0.5 text-center shadow-lg transition-transform ${
          highlighted ? 'scale-110 border-amber-300 bg-slate-900/95' : 'border-white/20 bg-slate-900/80'
        }`}
      >
        <div className="text-[11px] font-extrabold leading-tight text-white">{agent.name}</div>
        <div className="flex items-center justify-center gap-1 text-[10px] font-bold leading-tight" style={{ color: meta.color }}>
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
          {meta.label}
          {!agent.participant && <span className="text-slate-400">· benched</span>}
        </div>
        {detail && <div className="text-[10px] font-semibold leading-tight text-slate-300">{detail}</div>}
      </div>
    </Html>
  )
}
