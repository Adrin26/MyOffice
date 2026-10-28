import type { Agent, PresentationResult, Run, StateSnapshot, Task, WorkplaceEvent } from '../types/api'

export function makeAgent(over: Partial<Agent> = {}): Agent {
  return {
    id: 'agt_researcher', project_id: 'ai-research-team', kind: 'builtin', name: 'Researcher', role: 'Researcher',
    goal: 'Identify ideas about {topic}', backstory: 'Careful researcher', tools: [], llm_model: null,
    task_name: 'Research brief', task_description: 'Research the topic: {topic}', task_expected_output: 'A brief',
    enabled: true, participant: true, workflow_order: 0,
    appearance: { skin_color: '#f2c49b', shirt_color: '#2563eb', pants_color: '#1e293b', hair_color: '#2b1b10', hair_style: 'short', accessory: 'glasses', scale: 1 },
    workstation: 0, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    status: 'idle', current_task: null, current_task_id: null, activity: null, last_activity: null,
    last_activity_at: null, progress: null, started_at: null, completed_at: null, error_message: null, run_id: null,
    ...over,
  }
}

export function makeRun(over: Partial<Run> = {}): Run {
  return {
    id: 'run_aaaaaaaaaaaa', project_id: 'ai-research-team', status: 'running', inputs: { topic: 'KL property' },
    participants: [{ agent_id: 'agt_researcher', name: 'Researcher', role: 'Researcher', kind: 'builtin' }],
    total_tasks: 3, completed_tasks: 0, created_at: '2026-01-01T00:00:00.000Z', started_at: null,
    completed_at: null, error_message: null, has_result: false, ...over,
  }
}

export function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: 'tsk_1', run_id: 'run_aaaaaaaaaaaa', position: 0, key: 'research', name: 'Research brief',
    description: 'd', expected_output: 'e', agent_id: 'agt_researcher', agent_name: 'Researcher',
    agent_role: 'Researcher', depends_on: [], status: 'pending', started_at: null, completed_at: null,
    output_preview: null, error_message: null, ...over,
  }
}

export function makeEvent(id: number, type: string, data: Record<string, unknown> = {}, over: Partial<WorkplaceEvent> = {}): WorkplaceEvent {
  return {
    id, run_id: 'run_aaaaaaaaaaaa', type, timestamp: '2026-01-01T00:00:00.000Z', level: 'info',
    agent_id: null, agent_name: null, task_id: null, task_name: null, message: `${type} message`, data, ...over,
  }
}

export function makeSnapshot(over: Partial<StateSnapshot> = {}): StateSnapshot {
  return {
    server_time: '2026-01-01T00:00:00.000Z',
    project: { id: 'ai-research-team', name: 'AI Research Team', description: 'desc', process: 'sequential',
      inputs: [{ name: 'topic', label: 'Research topic', description: '', required: true, max_length: 500 }],
      builtin_agent_count: 3, default_inputs: {} },
    agents: [makeAgent(), makeAgent({ id: 'agt_writer', name: 'Report Writer', role: 'Report Writer', workstation: 2 })],
    active: false, current_run: null, tasks: [], recent_events: [], last_event_id: 10, ...over,
  }
}

export function makeResult(over: Partial<PresentationResult> = {}): PresentationResult {
  return {
    run_id: 'run_aaaaaaaaaaaa', status: 'completed', warning: null, title: 'Kuala Lumpur Property Outlook',
    summary: 'Prices are stabilising.',
    sections: [
      { id: 's1', title: 'Executive Summary', kind: 'summary', markdown: 'Prices are stabilising.' },
      { id: 's2', title: 'Price Trends', kind: 'other', markdown: '| Area | Median |\n| --- | --- |\n| Mont Kiara | RM 1,200,000 |\n| Cheras | RM 550,000 |\n\n<script>alert(1)</script>' },
      { id: 's3', title: 'Recommendations', kind: 'recommendations', markdown: '1. Buy carefully' },
    ],
    task_outputs: [{ task_id: 'tsk_1', key: 'research', name: 'Research brief', agent_id: 'agt_researcher', agent_name: 'Researcher', status: 'completed', markdown: 'brief' }],
    sources: [], report_markdown: '# Kuala Lumpur Property Outlook',
    artifacts: [{ id: 'art_1', run_id: 'run_aaaaaaaaaaaa', kind: 'report', filename: 'report.md', size: 2048, media_type: 'text/markdown', created_at: '2026-01-01T00:00:00.000Z', url: '/api/runs/run_aaaaaaaaaaaa/artifacts/art_1' }],
    generated_at: '2026-01-01T00:00:00.000Z', ...over,
  }
}
