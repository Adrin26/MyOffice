import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Download, ExternalLink, FileText, Users } from 'lucide-react'
import type { PresentationResult } from '../../types/api'
import { api } from '../../services/api'
import { formatBytes } from '../../lib/format'
import { MarkdownView } from './MarkdownView'

interface Page {
  id: string
  title: string
  render: () => React.ReactNode
}

const KIND_ACCENT: Record<string, string> = {
  summary: 'from-sky-500 to-indigo-500',
  findings: 'from-amber-400 to-orange-500',
  recommendations: 'from-emerald-400 to-teal-500',
  risks: 'from-rose-500 to-red-500',
  opportunities: 'from-lime-400 to-green-500',
  verification: 'from-violet-400 to-purple-500',
  sources: 'from-slate-400 to-slate-500',
}

export function buildPages(result: PresentationResult): Page[] {
  const pages: Page[] = [
    {
      id: 'overview',
      title: 'Overview',
      render: () => <OverviewPage result={result} />,
    },
    ...result.sections.map((s) => ({
      id: s.id,
      title: s.title,
      render: () => (
        <div>
          <SectionHeading title={s.title} kind={s.kind} />
          <MarkdownView markdown={s.markdown} charts />
        </div>
      ),
    })),
  ]
  if (result.task_outputs.length) {
    pages.push({
      id: 'agents',
      title: 'Agent outputs',
      render: () => (
        <div className="space-y-3">
          <SectionHeading title="Agent outputs" kind="other" />
          {result.task_outputs.map((t) => (
            <details key={t.task_id} className="rounded-2xl border border-white/10 bg-white/5 p-4" open={result.task_outputs.length === 1}>
              <summary className="cursor-pointer text-lg font-extrabold text-white">
                {t.agent_name} · <span className="text-slate-300">{t.name}</span>
                <span className="ml-2 text-sm font-semibold text-slate-400">({t.status})</span>
              </summary>
              <div className="mt-3">
                <MarkdownView markdown={t.markdown} />
              </div>
            </details>
          ))}
        </div>
      ),
    })
  }
  pages.push({
    id: 'files',
    title: 'Sources & files',
    render: () => <FilesPage result={result} />,
  })
  return pages
}

function SectionHeading({ title, kind }: { title: string; kind: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className={`h-8 w-2 rounded-full bg-gradient-to-b ${KIND_ACCENT[kind] ?? 'from-slate-400 to-slate-600'}`} />
      <h2 className="text-[1.6em] font-black tracking-tight text-white">{title}</h2>
    </div>
  )
}

function OverviewPage({ result }: { result: PresentationResult }) {
  return (
    <div className="space-y-5">
      {result.summary ? (
        <div className="rounded-2xl border border-sky-400/30 bg-sky-500/10 p-5">
          <div className="mb-2 text-sm font-black uppercase tracking-widest text-sky-300">Executive summary</div>
          <MarkdownView markdown={result.summary} />
        </div>
      ) : (
        <p className="text-slate-300">
          The report has no explicit executive summary section. Use the section tabs to read the full findings.
        </p>
      )}
      <div>
        <div className="mb-2 text-sm font-black uppercase tracking-widest text-slate-400">In this report</div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {result.sections.map((s) => (
            <div key={s.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className={`mb-1 h-1.5 w-10 rounded-full bg-gradient-to-r ${KIND_ACCENT[s.kind] ?? 'from-slate-400 to-slate-600'}`} />
              <div className="font-bold text-white">{s.title}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-sm text-slate-300">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1">
          <Users className="h-4 w-4" /> {result.task_outputs.length} task outputs
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1">
          <FileText className="h-4 w-4" /> {result.artifacts.length} saved files
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1">
          <ExternalLink className="h-4 w-4" /> {result.sources.length} sources cited
        </span>
      </div>
    </div>
  )
}

function FilesPage({ result }: { result: PresentationResult }) {
  return (
    <div className="space-y-6">
      <SectionHeading title="Sources & files" kind="sources" />
      <div>
        <h3 className="mb-2 text-lg font-extrabold text-white">Sources cited in the outputs</h3>
        {result.sources.length ? (
          <ul className="space-y-1">
            {result.sources.map((s) => (
              <li key={s.url}>
                <a className="text-sky-300 underline" href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-400">No links appear in the outputs. The agents in this workflow have no web tools, so claims should be verified independently.</p>
        )}
      </div>
      <div>
        <h3 className="mb-2 text-lg font-extrabold text-white">Saved files</h3>
        <div className="grid gap-2">
          {result.artifacts.map((a) => (
            <a key={a.id} href={api.artifactUrl(a)} download={a.filename}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-2 hover:bg-white/10">
              <span className="flex items-center gap-2 font-semibold text-white">
                <Download className="h-4 w-4 text-sky-300" /> {a.filename}
                <span className="text-xs font-normal text-slate-400">{a.kind}</span>
              </span>
              <span className="text-sm text-slate-400">{formatBytes(a.size)}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

interface ReportViewProps {
  result: PresentationResult
  section: number
  onSection: (i: number) => void
  topic?: string
  dense?: boolean
}

export function ReportView({ result, section, onSection, topic, dense }: ReportViewProps) {
  const pages = useMemo(() => buildPages(result), [result])
  const index = Math.min(section, pages.length - 1)
  const page = pages[index]
  return (
    <div className={`flex h-full flex-col ${dense ? 'text-[15px]' : 'text-[21px]'}`}>
      <header className="flex items-start justify-between gap-6 border-b border-white/10 pb-4">
        <div className="min-w-0">
          <div className="text-[0.7em] font-black uppercase tracking-[0.3em] text-amber-300">Findings presentation</div>
          <h1 className="truncate text-[2.1em] font-black leading-tight text-white" title={result.title}>{result.title}</h1>
          {topic && <div className="truncate text-[0.8em] text-slate-400">Topic: {topic}</div>}
        </div>
        {result.status === 'completed' ? (
          <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-emerald-500/20 px-4 py-1.5 text-[0.75em] font-extrabold text-emerald-200 ring-1 ring-emerald-400/40">
            <CheckCircle2 className="h-5 w-5" /> All tasks completed
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-amber-500/20 px-4 py-1.5 text-[0.75em] font-extrabold text-amber-200 ring-1 ring-amber-400/40">
            <AlertTriangle className="h-5 w-5" /> {result.status === 'partial' ? 'Partial results' : 'Failed'}
          </span>
        )}
      </header>
      {result.warning && (
        <div role="alert" className="mt-3 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-2 text-[0.8em] font-semibold text-amber-100">
          {result.warning}
        </div>
      )}
      <nav className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Report sections">
        {pages.map((p, i) => (
          <button
            key={p.id}
            onClick={() => onSection(i)}
            className={`shrink-0 rounded-xl px-3 py-1.5 text-[0.7em] font-extrabold transition ${
              i === index ? 'bg-amber-400 text-slate-900 shadow-[0_3px_0_#b45309]' : 'bg-white/10 text-slate-200 hover:bg-white/20'
            }`}
          >
            {p.title}
          </button>
        ))}
      </nav>
      <div className="scroll-area mt-3 min-h-0 flex-1 overflow-y-auto pr-3" onWheel={(e) => e.stopPropagation()}>
        {page.render()}
      </div>
      <footer className="mt-3 flex items-center justify-between border-t border-white/10 pt-3 text-[0.7em] text-slate-400">
        <button disabled={index === 0} onClick={() => onSection(index - 1)}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-1 font-bold text-slate-200 hover:bg-white/10 disabled:opacity-30">
          <ChevronLeft className="h-5 w-5" /> Previous
        </button>
        <span>{index + 1} / {pages.length}</span>
        <button disabled={index === pages.length - 1} onClick={() => onSection(index + 1)}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-1 font-bold text-slate-200 hover:bg-white/10 disabled:opacity-30">
          Next <ChevronRight className="h-5 w-5" />
        </button>
      </footer>
    </div>
  )
}
