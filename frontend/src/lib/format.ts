import type { AgentStatus, EventLevel, RunStatus, TaskStatus } from '../types/api'

export const STATUS_META: Record<AgentStatus, { label: string; color: string; chip: string }> = {
  idle: { label: 'Idle', color: '#94a3b8', chip: 'bg-slate-500/20 text-slate-200 ring-slate-400/40' },
  queued: { label: 'Queued', color: '#a78bfa', chip: 'bg-violet-500/20 text-violet-200 ring-violet-400/40' },
  working: { label: 'Working', color: '#38bdf8', chip: 'bg-sky-500/20 text-sky-200 ring-sky-400/40' },
  completed: { label: 'Completed', color: '#4ade80', chip: 'bg-emerald-500/20 text-emerald-200 ring-emerald-400/40' },
  error: { label: 'Error', color: '#f87171', chip: 'bg-rose-500/20 text-rose-200 ring-rose-400/40' },
}

export const RUN_META: Record<RunStatus | 'none', { label: string; chip: string }> = {
  none: { label: 'Ready', chip: 'bg-slate-500/20 text-slate-200 ring-slate-400/40' },
  queued: { label: 'Queued', chip: 'bg-violet-500/20 text-violet-200 ring-violet-400/40' },
  running: { label: 'Running', chip: 'bg-sky-500/20 text-sky-200 ring-sky-400/40' },
  completed: { label: 'Completed', chip: 'bg-emerald-500/20 text-emerald-200 ring-emerald-400/40' },
  failed: { label: 'Failed', chip: 'bg-rose-500/20 text-rose-200 ring-rose-400/40' },
}

export const TASK_META: Record<TaskStatus, { label: string; chip: string }> = {
  pending: { label: 'Pending', chip: 'bg-slate-500/20 text-slate-200 ring-slate-400/40' },
  running: { label: 'Running', chip: 'bg-sky-500/20 text-sky-200 ring-sky-400/40' },
  completed: { label: 'Completed', chip: 'bg-emerald-500/20 text-emerald-200 ring-emerald-400/40' },
  failed: { label: 'Failed', chip: 'bg-rose-500/20 text-rose-200 ring-rose-400/40' },
}

export const LEVEL_COLOR: Record<EventLevel, string> = {
  info: 'text-sky-300',
  success: 'text-emerald-300',
  warning: 'text-amber-300',
  error: 'text-rose-300',
}

export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—'
  const diff = Math.round((now - new Date(iso).getTime()) / 1000)
  if (diff < 5) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return new Date(iso).toLocaleDateString()
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function duration(start: string | null, end: string | null): string | null {
  if (!start) return null
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime()
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
