import { lazy, Suspense, useMemo, useState } from 'react'
import { Save, UserPlus } from 'lucide-react'
import type { Accessory, Agent, AgentAppearance, AgentInput, HairStyle } from '../../types/api'
import { useWorkplace } from '../../stores/workplaceStore'
import { api, ApiError, errorMessage } from '../../services/api'
import { validateAgent, type FormErrors } from '../../lib/validation'
import { Button, Field, inputClass } from '../ui'

const AvatarPreview = lazy(() => import('./AvatarPreview').then((m) => ({ default: m.AvatarPreview })))

const HAIR: HairStyle[] = ['short', 'spiky', 'long', 'bun', 'cap', 'bald']
const ACCESSORIES: Accessory[] = ['none', 'glasses', 'headset', 'tie', 'badge']

export const DEFAULT_APPEARANCE: AgentAppearance = {
  skin_color: '#f5c99b', shirt_color: '#8b5cf6', pants_color: '#1f2937', hair_color: '#3f2a1d',
  hair_style: 'short', accessory: 'none', scale: 1,
}

export function emptyAgentInput(): AgentInput {
  return {
    name: '', role: '', goal: '', backstory: '', tools: [], llm_model: null, task_name: '',
    task_description: '', task_expected_output: '', enabled: false, workflow_order: 100,
    appearance: { ...DEFAULT_APPEARANCE }, workstation: null,
  }
}

function fromAgent(a: Agent): AgentInput {
  return {
    name: a.name, role: a.role, goal: a.goal, backstory: a.backstory, tools: [...a.tools],
    llm_model: a.llm_model, task_name: a.task_name ?? '', task_description: a.task_description ?? '',
    task_expected_output: a.task_expected_output ?? '', enabled: a.enabled, workflow_order: a.workflow_order,
    appearance: { ...a.appearance }, workstation: a.workstation,
  }
}

const nullIfBlank = (v: string | null) => (v && v.trim() ? v.trim() : null)

export function AgentForm({ agent, onDone }: { agent?: Agent; onDone?: (a: Agent) => void }) {
  const tools = useWorkplace((s) => s.tools)
  const models = useWorkplace((s) => s.models)
  const project = useWorkplace((s) => s.project)
  const agents = useWorkplace((s) => s.agents)
  const active = useWorkplace((s) => s.active)
  const toast = useWorkplace((s) => s.toast)
  const selectAgent = useWorkplace((s) => s.selectAgent)
  const [values, setValues] = useState<AgentInput>(() => (agent ? fromAgent(agent) : emptyAgentInput()))
  const [errors, setErrors] = useState<FormErrors>({})
  const [busy, setBusy] = useState(false)
  const builtin = agent?.kind === 'builtin'
  const refreshModels = useWorkplace((s) => s.refreshModels)

  const allowedPlaceholders = project?.inputs.map((i) => i.name) ?? ['topic']
  const occupied = useMemo(() => {
    const m = new Map<number, string>()
    for (const a of Object.values(agents)) if (a.workstation !== null && a.id !== agent?.id) m.set(a.workstation, a.name)
    return m
  }, [agents, agent?.id])
  const deskOptions = Array.from({ length: Math.max(12, Math.max(0, ...occupied.keys()) + 7) }, (_, i) => i)

  const set = <K extends keyof AgentInput>(key: K, value: AgentInput[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined, form: undefined }))
  }
  const setLook = <K extends keyof AgentAppearance>(key: K, value: AgentAppearance[K]) =>
    setValues((v) => ({ ...v, appearance: { ...v.appearance, [key]: value } }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const found = validateAgent(values, {
      allowedPlaceholders,
      allowedTools: tools.map((t) => t.key),
      allowedModels: models?.allowed ?? [],
      builtin,
    })
    if (Object.keys(found).length) {
      setErrors(found)
      return
    }
    const payload: AgentInput = {
      ...values,
      name: values.name.trim(), role: values.role.trim(), goal: values.goal.trim(), backstory: values.backstory.trim(),
      task_name: nullIfBlank(values.task_name), task_description: nullIfBlank(values.task_description),
      task_expected_output: nullIfBlank(values.task_expected_output),
    }
    setBusy(true)
    try {
      let saved: Agent
      if (agent) {
        const patch: Partial<AgentInput> = builtin
          ? { name: payload.name, llm_model: payload.llm_model, appearance: payload.appearance, workstation: payload.workstation ?? undefined }
          : { ...payload, workstation: payload.workstation ?? undefined }
        saved = await api.updateAgent(agent.id, patch)
        toast({ level: 'success', title: `Saved ${saved.name}` })
      } else {
        saved = await api.createAgent(payload)
        toast({ level: 'success', title: `Created ${saved.name}`, message: `Assigned to desk ${(saved.workstation ?? 0) + 1}` })
        selectAgent(saved.id)
      }
      onDone?.(saved)
    } catch (err) {
      const msg = errorMessage(err)
      setErrors({ form: err instanceof ApiError && err.detailText ? err.detailText : msg })
      toast({ level: 'error', title: 'Could not save agent', message: msg })
    } finally {
      setBusy(false)
    }
  }

  const err = (k: keyof AgentInput) => errors[k]
  const disabledPrompt = builtin
  const openaiOptions = models?.options.filter((o) => o.provider === 'openai') ?? []
  const localOptions = models?.options.filter((o) => o.provider === 'ollama') ?? []
  const missingSelected = !!values.llm_model && !models?.options.some((o) => o.id === values.llm_model)
  const modelHint = models?.ollama_available
    ? 'Pick a cloud OpenAI model or a local model from Ollama.'
    : 'Start Ollama (ollama serve) to also choose local models.'

  return (
    <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1fr_280px]" noValidate aria-label={agent ? 'Edit agent' : 'Create agent'}>
      <div className="space-y-4">
        {builtin && (
          <div className="rounded-xl border border-sky-400/30 bg-sky-500/10 p-3 text-sm text-sky-100">
            This agent is defined in <code>learn_crewai.py</code>, which stays the source of truth for its role, goal, backstory and task.
            You can change its display name, model, desk and appearance here.
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Agent name" error={err('name')} htmlFor="f-name" hint="Shown on the name tag.">
            <input id="f-name" className={inputClass} value={values.name} maxLength={60} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Quinn" />
          </Field>
          <Field label="Role" error={err('role')} htmlFor="f-role" hint="The CrewAI role title.">
            <input id="f-role" className={inputClass} value={values.role} maxLength={120} disabled={disabledPrompt} onChange={(e) => set('role', e.target.value)} placeholder="e.g. Fact Checker" />
          </Field>
        </div>
        <Field label="Goal" error={err('goal')} htmlFor="f-goal" hint={`What the agent tries to achieve. You may use ${allowedPlaceholders.map((p) => `{${p}}`).join(', ')}.`}>
          <textarea id="f-goal" rows={2} className={inputClass} value={values.goal} disabled={disabledPrompt} onChange={(e) => set('goal', e.target.value)} />
        </Field>
        <Field label="Backstory" error={err('backstory')} htmlFor="f-backstory" hint="Personality and expertise that shape its answers.">
          <textarea id="f-backstory" rows={3} className={inputClass} value={values.backstory} disabled={disabledPrompt} onChange={(e) => set('backstory', e.target.value)} />
        </Field>

        <Field label="LLM model" error={err('llm_model')} htmlFor="f-model" hint={modelHint}>
          <select id="f-model" className={inputClass} value={values.llm_model ?? ''} onFocus={() => void refreshModels()}
            onChange={(e) => set('llm_model', e.target.value || null)}>
            <option value="">Default ({models?.default ?? 'backend default'})</option>
            <optgroup label="OpenAI (cloud, uses credits)">
              {openaiOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}{o.available ? '' : ` (${o.unavailable_reason})`}</option>
              ))}
            </optgroup>
            <optgroup label={models?.ollama_available ? 'Local (Ollama, free)' : 'Local (Ollama not running)'}>
              {localOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              {missingSelected && <option value={values.llm_model ?? ''}>{values.llm_model?.replace(/^ollama\//, '')} (not installed)</option>}
            </optgroup>
          </select>
        </Field>

        {!builtin && (
          <>
            <fieldset className="space-y-2">
              <legend className="text-xs font-black uppercase tracking-wider text-slate-300">Tools (approved list only)</legend>
              <div className="grid gap-2 md:grid-cols-3">
                {tools.map((t) => (
                  <label key={t.key} className={`flex cursor-pointer gap-2 rounded-xl border p-2.5 text-sm ${values.tools.includes(t.key) ? 'border-amber-300/60 bg-amber-400/10' : 'border-white/10 bg-white/5'} ${!t.available ? 'opacity-50' : ''}`}>
                    <input type="checkbox" className="mt-1 accent-amber-400" checked={values.tools.includes(t.key)}
                      disabled={!t.available && !values.tools.includes(t.key)}
                      onChange={(e) => set('tools', e.target.checked ? [...values.tools, t.key] : values.tools.filter((k) => k !== t.key))} />
                    <span>
                      <span className="block font-bold text-white">{t.label}</span>
                      <span className="block text-xs text-slate-400">{t.available ? t.description : t.unavailable_reason}</span>
                    </span>
                  </label>
                ))}
              </div>
              {err('tools') && <p className="text-xs font-semibold text-rose-300">{err('tools')}</p>}
            </fieldset>

            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm font-black text-white">Workflow task</div>
              <p className="text-xs text-slate-400">
                Custom agents run <strong>after</strong> the original Researcher → Analyst → Report Writer pipeline and receive all earlier outputs as context.
              </p>
              <Field label="Task name" error={err('task_name')} htmlFor="f-task-name">
                <input id="f-task-name" className={inputClass} value={values.task_name ?? ''} maxLength={80} onChange={(e) => set('task_name', e.target.value)} placeholder="e.g. Fact check" />
              </Field>
              <Field label="Task description" error={err('task_description')} htmlFor="f-task-desc">
                <textarea id="f-task-desc" rows={3} className={inputClass} value={values.task_description ?? ''} onChange={(e) => set('task_description', e.target.value)}
                  placeholder="Review the final report on {topic} and list claims that need verification." />
              </Field>
              <Field label="Expected output" error={err('task_expected_output')} htmlFor="f-task-out">
                <textarea id="f-task-out" rows={2} className={inputClass} value={values.task_expected_output ?? ''} onChange={(e) => set('task_expected_output', e.target.value)}
                  placeholder="A Markdown bullet list of claims with a short reason for each." />
              </Field>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm font-bold text-white">
                  <input type="checkbox" className="h-4 w-4 accent-emerald-400" checked={values.enabled}
                    disabled={active && agent?.enabled} onChange={(e) => set('enabled', e.target.checked)} />
                  Include in future workflow runs
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  Order
                  <input type="number" min={0} max={1000} className={`${inputClass} w-24`} value={values.workflow_order}
                    onChange={(e) => set('workflow_order', Number(e.target.value) || 0)} />
                </label>
              </div>
              {err('enabled') && <p className="text-xs font-semibold text-rose-300">{err('enabled')}</p>}
            </div>
          </>
        )}

        {errors.form && <p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-sm font-semibold text-rose-200">{errors.form}</p>}
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={busy}>
            {agent ? <Save className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            {busy ? 'Saving…' : agent ? 'Save changes' : 'Create Agent'}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <Suspense fallback={<div className="h-56 rounded-2xl bg-white/5" />}>
          <AvatarPreview appearance={values.appearance} />
        </Suspense>
        <div className="grid grid-cols-2 gap-2">
          {(['shirt_color', 'pants_color', 'skin_color', 'hair_color'] as const).map((k) => (
            <label key={k} className="flex items-center gap-2 rounded-xl bg-white/5 px-2 py-1.5 text-xs font-bold capitalize text-slate-300">
              <input type="color" value={values.appearance[k]} onChange={(e) => setLook(k, e.target.value)} className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent" aria-label={k.replace('_', ' ')} />
              {k.replace('_color', '')}
            </label>
          ))}
        </div>
        <Field label="Hair" htmlFor="f-hair">
          <select id="f-hair" className={inputClass} value={values.appearance.hair_style} onChange={(e) => setLook('hair_style', e.target.value as HairStyle)}>
            {HAIR.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </Field>
        <Field label="Accessory" htmlFor="f-acc">
          <select id="f-acc" className={inputClass} value={values.appearance.accessory} onChange={(e) => setLook('accessory', e.target.value as Accessory)}>
            {ACCESSORIES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Field>
        <Field label={`Size ${values.appearance.scale.toFixed(2)}×`} htmlFor="f-scale">
          <input id="f-scale" type="range" min={0.8} max={1.25} step={0.05} value={values.appearance.scale}
            onChange={(e) => setLook('scale', Number(e.target.value))} className="w-full accent-amber-400" />
        </Field>
        <Field label="Workstation" htmlFor="f-desk" hint="Taken desks swap with their current owner.">
          <select id="f-desk" className={inputClass} value={values.workstation ?? ''} onChange={(e) => set('workstation', e.target.value === '' ? null : Number(e.target.value))}>
            {!agent && <option value="">Assign automatically</option>}
            {deskOptions.map((i) => (
              <option key={i} value={i}>Desk {i + 1}{occupied.has(i) ? ` (${occupied.get(i)})` : ''}</option>
            ))}
          </select>
        </Field>
      </div>
    </form>
  )
}
