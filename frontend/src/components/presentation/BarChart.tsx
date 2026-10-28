import type { ChartSeries } from '../../lib/tables'

const COLORS = ['#38bdf8', '#a78bfa', '#4ade80', '#fbbf24', '#f472b6', '#fb923c']

/** Simple SVG bar chart of values taken verbatim from a report table. */
export function BarChart({ series }: { series: ChartSeries }) {
  const max = Math.max(...series.points.map((p) => Math.abs(p.value)), 1)
  const points = series.points.slice(0, 12)
  return (
    <figure className="rounded-2xl border border-white/10 bg-slate-950/50 p-4" data-testid="bar-chart">
      <figcaption className="mb-3 text-sm font-bold text-slate-300">
        {series.label} <span className="font-normal text-slate-500">(from report table)</span>
      </figcaption>
      <div className="space-y-2">
        {points.map((p, i) => (
          <div key={`${p.label}-${i}`} className="flex items-center gap-3 text-sm">
            <span className="w-32 shrink-0 truncate text-slate-300" title={p.label}>{p.label}</span>
            <div className="h-5 flex-1 overflow-hidden rounded-md bg-white/5">
              <div
                className="h-full rounded-md"
                style={{ width: `${(Math.abs(p.value) / max) * 100}%`, background: COLORS[i % COLORS.length] }}
              />
            </div>
            <span className="w-24 shrink-0 text-right font-mono text-slate-200">{p.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </figure>
  )
}
