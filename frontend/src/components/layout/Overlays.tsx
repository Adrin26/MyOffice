import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Maximize2, Minimize2, Play, X } from 'lucide-react'
import { useWorkplace } from '../../stores/workplaceStore'
import { api, errorMessage } from '../../services/api'
import { Button, Field, inputClass } from '../ui'
import { ScreenContent } from '../presentation/ScreenContent'

export function Toasts() {
  const toasts = useWorkplace((s) => s.toasts)
  const dismiss = useWorkplace((s) => s.dismissToast)
  const colors = {
    info: 'border-sky-400/40 bg-sky-950/90',
    success: 'border-emerald-400/40 bg-emerald-950/90',
    warning: 'border-amber-400/40 bg-amber-950/90',
    error: 'border-rose-400/40 bg-rose-950/90',
  }
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-40 flex w-80 flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} role={t.level === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-3 py-2 text-sm text-white shadow-xl ${colors[t.level]}`}>
          <div className="min-w-0 flex-1">
            <div className="font-bold">{t.title}</div>
            {t.message && <div className="break-words text-xs text-slate-300">{t.message}</div>}
          </div>
          <button aria-label="Dismiss" onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  )
}

function Modal({ children, onClose, label }: { children: React.ReactNode; onClose: () => void; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={label} onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl">
        {children}
      </div>
    </div>
  )
}

export function ConfirmDialog() {
  const req = useWorkplace((s) => s.confirmRequest)
  const resolve = useWorkplace((s) => s.resolveConfirm)
  if (!req) return null
  return (
    <Modal onClose={() => resolve(false)} label={req.title}>
      <h2 className="text-lg font-black text-white">{req.title}</h2>
      <p className="mt-2 text-sm text-slate-300">{req.message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => resolve(false)}>Cancel</Button>
        <Button variant={req.danger ? 'danger' : 'primary'} onClick={() => resolve(true)} autoFocus>{req.confirmLabel}</Button>
      </div>
    </Modal>
  )
}

export function StartRunDialog() {
  const open = useWorkplace((s) => s.startDialogOpen)
  const setOpen = useWorkplace((s) => s.setStartDialog)
  const project = useWorkplace((s) => s.project)
  const appSettings = useWorkplace((s) => s.appSettings)
  const agents = useWorkplace((s) => s.agents)
  const health = useWorkplace((s) => s.health)
  const models = useWorkplace((s) => s.models)
  const toast = useWorkplace((s) => s.toast)
  const closePresentation = useWorkplace((s) => s.closePresentation)
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wasOpen = useRef(false)

  useEffect(() => {
    if (open && !wasOpen.current && project) {
      const initial: Record<string, string> = {}
      for (const f of project.inputs) initial[f.name] = project.default_inputs[f.name] ?? (f.name === 'topic' ? appSettings.default_topic : '')
      setValues(initial)
      setError(null)
    }
    wasOpen.current = open
  }, [open, project, appSettings.default_topic])

  if (!open || !project) return null
  const participants = Object.values(agents).filter((a) => a.participant)
  const runModels = participants.map((a) => a.llm_model ?? models?.default ?? '')
  const usesOpenAI = runModels.some((m) => !m.startsWith('ollama/'))
  const usesLocal = runModels.some((m) => m.startsWith('ollama/'))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const missing = project.inputs.filter((f) => f.required && !values[f.name]?.trim())
    if (missing.length) {
      setError(`${missing.map((m) => m.label).join(', ')} is required`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.startRun(project.id, Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim()])))
      closePresentation()
      setOpen(false)
    } catch (err) {
      setError(errorMessage(err))
      toast({ level: 'error', title: 'Could not start the workflow', message: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={() => !busy && setOpen(false)} label="Start workflow">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <h2 className="text-lg font-black text-white">Start the workflow</h2>
          <p className="text-sm text-slate-400">
            Runs the real CrewAI crew from <code>learn_crewai.py</code> with {participants.length} agents.
            {usesOpenAI ? ' Agents on OpenAI models use your OpenAI credits.' : ' All agents use local Ollama models.'}
          </p>
        </div>
        {health && usesOpenAI && !health.openai_key_configured && (
          <div role="alert" className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100">
            OPENAI_API_KEY is not configured on the backend, and some agents use OpenAI models. The run will be rejected.
          </div>
        )}
        {health && usesLocal && !health.ollama_available && (
          <div role="alert" className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100">
            Ollama is not reachable, and some agents use local models. Start it with <code>ollama serve</code>.
          </div>
        )}
        {project.inputs.map((f) => (
          <Field key={f.name} label={f.label} hint={f.description} htmlFor={`input-${f.name}`}>
            <textarea id={`input-${f.name}`} rows={3} maxLength={f.max_length} className={inputClass}
              value={values[f.name] ?? ''} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
              placeholder="e.g. Property market trends in Kuala Lumpur for first-time buyers" autoFocus />
          </Field>
        ))}
        {error && <p role="alert" className="text-sm font-semibold text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="success" disabled={busy}><Play className="h-4 w-4" /> {busy ? 'Starting…' : 'Start project'}</Button>
        </div>
      </form>
    </Modal>
  )
}

/** Controls shown while the big screen is in presentation mode, plus a full-screen reading view. */
export function PresentationControls() {
  const presentation = useWorkplace((s) => s.presentation)
  const close = useWorkplace((s) => s.closePresentation)
  const setExpanded = useWorkplace((s) => s.setExpanded)
  if (!presentation.open) return null
  return (
    <>
      <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 gap-2">
        <Button variant="primary" onClick={close}><ArrowLeft className="h-4 w-4" /> Return to office</Button>
        <Button variant="secondary" onClick={() => setExpanded(true)} disabled={!presentation.result}>
          <Maximize2 className="h-4 w-4" /> Read full screen
        </Button>
      </div>
      {presentation.expanded && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 p-6 backdrop-blur" role="dialog" aria-label="Findings">
          <div className="mx-auto flex h-full max-w-6xl flex-col rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 to-indigo-950 p-8">
            <div className="mb-2 flex justify-end">
              <Button variant="ghost" onClick={() => setExpanded(false)}><Minimize2 className="h-4 w-4" /> Back to 3D screen</Button>
            </div>
            <div className="min-h-0 flex-1"><ScreenContent dense /></div>
          </div>
        </div>
      )}
    </>
  )
}
