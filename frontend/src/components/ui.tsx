import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-amber-400 text-slate-900 shadow-[0_4px_0_#b45309] hover:bg-amber-300 active:translate-y-[2px] active:shadow-[0_2px_0_#b45309]',
  success: 'bg-emerald-400 text-slate-900 shadow-[0_4px_0_#047857] hover:bg-emerald-300 active:translate-y-[2px] active:shadow-[0_2px_0_#047857]',
  secondary: 'bg-slate-700 text-white shadow-[0_4px_0_#1e293b] hover:bg-slate-600 active:translate-y-[2px] active:shadow-[0_2px_0_#1e293b]',
  danger: 'bg-rose-500 text-white shadow-[0_4px_0_#9f1239] hover:bg-rose-400 active:translate-y-[2px] active:shadow-[0_2px_0_#9f1239]',
  ghost: 'bg-transparent text-slate-200 hover:bg-white/10',
}

export function Button({
  variant = 'secondary', className = '', children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-extrabold transition disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function IconButton({ label, children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-slate-200 transition hover:bg-white/15 disabled:opacity-40 ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Chip({ className = '', children }: { className?: string; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-extrabold ring-1 ${className}`}>{children}</span>
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-2xl border border-white/10 bg-slate-900/80 shadow-xl backdrop-blur ${className}`}>{children}</div>
}

export function Field({ label, hint, error, children, htmlFor }: {
  label: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-xs font-black uppercase tracking-wider text-slate-300">{label}</label>
      {children}
      {error ? (
        <p className="text-xs font-semibold text-rose-300" role="alert">{error}</p>
      ) : hint ? (
        <p className="text-xs text-slate-400">{hint}</p>
      ) : null}
    </div>
  )
}

export const inputClass =
  'w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30 disabled:opacity-50'

export function PanelHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
      <div>
        <h2 className="text-lg font-black text-white">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
      </div>
      {actions}
    </div>
  )
}
