import { describe, expect, it } from 'vitest'
import { applyEvent, applySnapshot, emptySync, sortedAgents } from './sync'
import { makeAgent, makeEvent, makeRun, makeSnapshot, makeTask } from '../test/fixtures'

const synced = () => applySnapshot(emptySync, makeSnapshot())

describe('applySnapshot', () => {
  it('replaces all backend state', () => {
    const s = synced()
    expect(Object.keys(s.agents)).toEqual(['agt_researcher', 'agt_writer'])
    expect(s.lastEventId).toBe(10)
    expect(s.synced).toBe(true)
  })

  it('discards stale client state after a reconnect', () => {
    let s = synced()
    s = applyEvent(s, makeEvent(11, 'agent.started', { agent: { id: 'agt_researcher', status: 'working' } }))
    expect(s.agents.agt_researcher.status).toBe('working')
    s = applySnapshot(s, makeSnapshot({ last_event_id: 20 }))
    expect(s.agents.agt_researcher.status).toBe('idle')
    expect(s.lastEventId).toBe(20)
  })
})

describe('applyEvent', () => {
  it('ignores duplicate and already-snapshotted events', () => {
    const s = synced()
    const dup = applyEvent(s, makeEvent(10, 'agent.started', { agent: { id: 'agt_researcher', status: 'working' } }))
    expect(dup).toBe(s)
    const once = applyEvent(s, makeEvent(11, 'agent.started', { agent: { id: 'agt_researcher', status: 'working' } }))
    expect(applyEvent(once, makeEvent(11, 'agent.started', {}))).toBe(once)
    expect(once.events).toHaveLength(1)
  })

  it('ignores an older event that arrives after a newer one', () => {
    let s = synced()
    s = applyEvent(s, makeEvent(13, 'agent.completed', { agent: { id: 'agt_researcher', status: 'completed' } }))
    s = applyEvent(s, makeEvent(12, 'agent.started', { agent: { id: 'agt_researcher', status: 'working' } }))
    expect(s.agents.agt_researcher.status).toBe('completed')
  })

  it('merges runtime fields only for agent status events', () => {
    let s = synced()
    s = applyEvent(s, makeEvent(11, 'agent.progress', {
      agent: { id: 'agt_researcher', status: 'working', activity: 'thinking', last_activity: 'Thinking', name: 'HACK' },
    }))
    expect(s.agents.agt_researcher.activity).toBe('thinking')
    expect(s.agents.agt_researcher.name).toBe('Researcher')
  })

  it('tracks a new run, its tasks and progress, and idles agents outside it', () => {
    let s = applySnapshot(emptySync, makeSnapshot({ agents: [makeAgent(), makeAgent({ id: 'agt_writer', status: 'completed' })] }))
    const run = makeRun()
    s = applyEvent(s, makeEvent(11, 'workflow.queued', { run, tasks: [makeTask()] }))
    expect(s.run?.id).toBe(run.id)
    expect(s.active).toBe(true)
    expect(s.agents.agt_writer.status).toBe('idle')
    s = applyEvent(s, makeEvent(12, 'task.completed', { task: makeTask({ status: 'completed' }), progress: { completed: 1, total: 3 } }))
    expect(s.tasks.tsk_1.status).toBe('completed')
    expect(s.run?.completed_tasks).toBe(1)
    s = applyEvent(s, makeEvent(13, 'workflow.completed', { run: makeRun({ status: 'completed', completed_tasks: 3 }) }))
    expect(s.active).toBe(false)
  })

  it('handles registry events', () => {
    let s = synced()
    const added = makeAgent({ id: 'agt_new', name: 'Quinn', kind: 'custom', workflow_order: 100 })
    s = applyEvent(s, makeEvent(11, 'agent.registered', { agent: added }))
    expect(sortedAgents(s.agents).map((a) => a.name)).toEqual(['Researcher', 'Report Writer', 'Quinn'])
    s = applyEvent(s, makeEvent(12, 'agent.removed', { agent_id: 'agt_new' }))
    expect(s.agents.agt_new).toBeUndefined()
  })

  it('resets the workspace', () => {
    let s = applySnapshot(emptySync, makeSnapshot({ current_run: makeRun({ status: 'completed' }), agents: [makeAgent({ status: 'completed' })] }))
    s = applyEvent(s, makeEvent(11, 'workspace.reset'))
    expect(s.run).toBeNull()
    expect(s.agents.agt_researcher.status).toBe('idle')
  })
})
