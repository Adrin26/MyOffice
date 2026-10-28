import type { AgentInput } from '../types/api'

export type FormErrors = Partial<Record<keyof AgentInput | 'form', string>>

const LIMITS: Partial<Record<keyof AgentInput, [number, number]>> = {
  name: [1, 60],
  role: [2, 120],
  goal: [5, 1000],
  backstory: [5, 2000],
  task_name: [0, 80],
  task_description: [10, 4000],
  task_expected_output: [5, 2000],
}

const PLACEHOLDER = /\{([^{}]*)\}/g

export function placeholders(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[1])
}

/** Client-side mirror of the backend rules; the backend validates again. */
export function validateAgent(
  v: AgentInput,
  opts: { allowedPlaceholders: string[]; allowedTools: string[]; allowedModels: string[]; builtin?: boolean },
): FormErrors {
  const errors: FormErrors = {}
  for (const [key, [min, max]] of Object.entries(LIMITS) as [keyof AgentInput, [number, number]][]) {
    if (opts.builtin && key !== 'name') continue
    const raw = v[key]
    const value = typeof raw === 'string' ? raw.trim() : ''
    const optional = key === 'task_name' || key === 'task_description' || key === 'task_expected_output'
    if (!value) {
      if (!optional) errors[key] = 'Required'
      continue
    }
    if (value.length < min) errors[key] = `At least ${min} characters`
    else if (value.length > max) errors[key] = `At most ${max} characters`
  }
  if (opts.builtin) return errors

  for (const key of ['role', 'goal', 'backstory', 'task_description', 'task_expected_output'] as const) {
    const text = v[key] ?? ''
    if ((text.match(/\{/g) ?? []).length !== (text.match(/\}/g) ?? []).length) {
      errors[key] = 'Unbalanced { } braces'
      continue
    }
    const bad = placeholders(text).filter((p) => !opts.allowedPlaceholders.includes(p))
    if (bad.length) {
      errors[key] = `Unknown placeholder ${bad.map((b) => `{${b}}`).join(', ')}. Allowed: ${opts.allowedPlaceholders
        .map((p) => `{${p}}`)
        .join(', ')}`
    }
  }
  if (v.tools.length > 5) errors.tools = 'Select at most 5 tools'
  const unknown = v.tools.filter((t) => !opts.allowedTools.includes(t))
  if (unknown.length) errors.tools = `Not allowed: ${unknown.join(', ')}`
  if (v.llm_model && !opts.allowedModels.includes(v.llm_model)) errors.llm_model = 'Model is not approved'
  if (v.enabled && (!v.task_description?.trim() || !v.task_expected_output?.trim())) {
    errors.enabled = 'Add a task description and expected output to join the workflow'
  }
  return errors
}
