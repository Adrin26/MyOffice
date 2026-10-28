import { describe, expect, it } from 'vitest'
import { validateAgent } from './validation'
import { numericSeries, parseNumber, parseTables } from './tables'
import { allocateDesks, rowCount, workstationPosition } from './layout'
import { makeAgent } from '../test/fixtures'
import type { AgentInput } from '../types/api'

const base: AgentInput = {
  name: 'Quinn', role: 'Fact Checker', goal: 'Check the report on {topic}', backstory: 'A careful editor',
  tools: [], llm_model: null, task_name: 'Check', task_description: 'Review the report about {topic}',
  task_expected_output: 'A list', enabled: true, workflow_order: 100,
  appearance: makeAgent().appearance, workstation: null,
}
const opts = { allowedPlaceholders: ['topic'], allowedTools: ['calculator'], allowedModels: ['gpt-4o-mini'] }

describe('validateAgent', () => {
  it('accepts a valid agent', () => {
    expect(validateAgent(base, opts)).toEqual({})
  })
  it('requires core fields', () => {
    const e = validateAgent({ ...base, name: ' ', role: '', goal: '', backstory: '' }, opts)
    expect(Object.keys(e).sort()).toEqual(['backstory', 'goal', 'name', 'role'])
  })
  it('rejects unknown placeholders and unbalanced braces', () => {
    expect(validateAgent({ ...base, goal: 'Use {secret}' }, opts).goal).toMatch(/Unknown placeholder/)
    expect(validateAgent({ ...base, goal: 'Broken {topic' }, opts).goal).toMatch(/Unbalanced/)
  })
  it('only allows approved tools and models', () => {
    expect(validateAgent({ ...base, tools: ['shell'] }, opts).tools).toMatch(/Not allowed/)
    expect(validateAgent({ ...base, llm_model: 'evil' }, opts).llm_model).toBeDefined()
  })
  it('requires a task to join the workflow', () => {
    expect(validateAgent({ ...base, task_description: '', task_expected_output: '' }, opts).enabled).toBeDefined()
    expect(validateAgent({ ...base, enabled: false, task_description: '', task_expected_output: '' }, opts)).toEqual({})
  })
  it('only checks the name for built-in agents', () => {
    expect(validateAgent({ ...base, goal: '' }, { ...opts, builtin: true })).toEqual({})
  })
})

describe('tables', () => {
  const md = 'Intro\n\n| City | Median | Note |\n| --- | ---: | --- |\n| KL | RM 1,200,000 | a |\n| Penang | RM 800k | b |\n\nAfter'
  it('parses GFM tables and numeric columns', () => {
    const tables = parseTables(md)
    expect(tables).toHaveLength(1)
    expect(tables[0].headers).toEqual(['City', 'Median', 'Note'])
    const series = numericSeries(tables[0])
    expect(series).toHaveLength(1)
    expect(series[0].points).toEqual([{ label: 'KL', value: 1200000 }, { label: 'Penang', value: 800000 }])
  })
  it('does not chart non-numeric or partial columns', () => {
    expect(numericSeries(parseTables('| a | b |\n|---|---|\n| x | 1 |\n| y | n/a |')[0])).toEqual([])
  })
  it('parses number formats', () => {
    expect(parseNumber('12.5%')).toBe(12.5)
    expect(parseNumber('$3k')).toBe(3000)
    expect(parseNumber('**42**')).toBe(42)
    expect(parseNumber('about 5')).toBeNull()
  })
})

describe('layout', () => {
  it('places desks in rows of six and grows the office', () => {
    expect(workstationPosition(0).position[2]).toBe(workstationPosition(5).position[2])
    expect(workstationPosition(6).position[2]).toBeGreaterThan(workstationPosition(0).position[2])
    expect(rowCount([0, 1, 2])).toBe(2)
    expect(rowCount(Array.from({ length: 12 }, (_, i) => i))).toBe(3)
  })
  it('allocates free desks for agents without one and resolves collisions', () => {
    const desks = allocateDesks([
      makeAgent({ id: 'a', workstation: 0 }), makeAgent({ id: 'b', workstation: 0 }), makeAgent({ id: 'c', workstation: null }),
    ])
    expect([...desks.entries()].map(([i, a]) => `${i}:${a.id}`).sort()).toEqual(['0:a', '1:b', '2:c'])
  })
})
