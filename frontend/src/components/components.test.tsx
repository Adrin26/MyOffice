import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useWorkplace } from '../stores/workplaceStore'
import { emptySync } from '../lib/sync'
import { makeAgent, makeEvent, makeResult, makeSnapshot } from '../test/fixtures'
import { RightPanel } from './layout/RightPanel'
import { AgentsPanel } from './agents/AgentsPanel'
import { AgentForm } from './agents/AgentForm'
import { ReportView } from './presentation/ReportView'
import { Toasts } from './layout/Overlays'
import { ScreenContent } from './presentation/ScreenContent'
import { filterEvents } from './activity/ActivityLog'

vi.mock('./agents/AvatarPreview', () => ({ AvatarPreview: () => <div data-testid="avatar-preview" /> }))

const initial = useWorkplace.getState()

function resetStore() {
  useWorkplace.setState({ ...initial, ...emptySync, toasts: [], selectedAgentId: null, presentation: initial.presentation }, true)
  useWorkplace.getState().receiveSnapshot(makeSnapshot())
  useWorkplace.setState({
    tools: [{ key: 'calculator', label: 'Calculator', description: 'Math', available: true, unavailable_reason: null }],
    models: {
      default: 'gpt-4o-mini',
      allowed: ['gpt-4o-mini', 'ollama/qwen2.5:7b'],
      options: [
        { id: 'gpt-4o-mini', label: 'gpt-4o-mini', provider: 'openai', available: true, unavailable_reason: null },
        { id: 'ollama/qwen2.5:7b', label: 'qwen2.5:7b', provider: 'ollama', available: true, unavailable_reason: null },
      ],
      ollama_available: true,
    },
  })
}

beforeEach(() => {
  resetStore()
  vi.restoreAllMocks()
})

describe('agent list and monitor', () => {
  it('renders registered agents', () => {
    render(<AgentsPanel />)
    const list = screen.getByTestId('agent-list')
    expect(within(list).getAllByText('Researcher')).not.toHaveLength(0)
    expect(within(list).getAllByText('Report Writer')).not.toHaveLength(0)
    expect(within(list).getAllByText('Idle')).toHaveLength(2)
  })

  it('selecting an agent shows its details', async () => {
    render(<RightPanel />)
    await userEvent.click(screen.getByRole('button', { name: /Report Writer/ }))
    expect(useWorkplace.getState().selectedAgentId).toBe('agt_writer')
    expect(screen.getByTestId('agent-details')).toHaveTextContent('Report Writer')
  })

  it('updates status from live backend events', () => {
    useWorkplace.getState().selectAgent('agt_researcher')
    render(<RightPanel />)
    act(() => {
      useWorkplace.getState().receiveEvent(makeEvent(11, 'agent.started', {
        agent: { id: 'agt_researcher', status: 'working', current_task: 'Research brief', activity: 'thinking', last_activity: 'Thinking (calling gpt-4o-mini)' },
      }))
    })
    const details = screen.getByTestId('agent-details')
    expect(details).toHaveTextContent('Working')
    expect(details).toHaveTextContent('Research brief')
    expect(details).toHaveTextContent('Waiting on a model call')
    act(() => {
      useWorkplace.getState().receiveEvent(makeEvent(12, 'agent.failed', {
        agent: { id: 'agt_researcher', status: 'error', error_message: 'RateLimitError: slow down' },
      }))
    })
    expect(screen.getByRole('alert')).toHaveTextContent('RateLimitError')
  })
})

describe('add agent form', () => {
  it('validates before sending', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(<AgentForm />)
    await userEvent.click(screen.getByRole('button', { name: /Create Agent/ }))
    expect(screen.getAllByText('Required').length).toBeGreaterThanOrEqual(4)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects unknown placeholders', async () => {
    render(<AgentForm />)
    fireEvent.change(screen.getByLabelText('Goal'), { target: { value: 'Steal {api_key}' } })
    await userEvent.click(screen.getByRole('button', { name: /Create Agent/ }))
    expect(screen.getByText(/Unknown placeholder \{api_key\}/)).toBeInTheDocument()
  })

  it('creates a valid agent through the API and shows a notification', async () => {
    const created = makeAgent({ id: 'agt_new', name: 'Quinn', kind: 'custom', workstation: 3 })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(created), { status: 201 }))
    const onDone = vi.fn()
    render(<AgentForm onDone={onDone} />)
    fireEvent.change(screen.getByLabelText('Agent name'), { target: { value: 'Quinn' } })
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'Fact Checker' } })
    fireEvent.change(screen.getByLabelText('Goal'), { target: { value: 'Check the report on {topic}' } })
    fireEvent.change(screen.getByLabelText('Backstory'), { target: { value: 'A meticulous editor.' } })
    await userEvent.click(screen.getByRole('button', { name: /Create Agent/ }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(created))
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/agents')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toMatchObject({ name: 'Quinn', role: 'Fact Checker', enabled: false, task_description: null })
    expect(useWorkplace.getState().toasts.at(-1)?.title).toBe('Created Quinn')
  })

  it('shows backend validation errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'validation_failed', message: 'Invalid agent configuration', details: ["Unknown tool 'x'"] },
    }), { status: 422 }))
    render(<AgentForm />)
    fireEvent.change(screen.getByLabelText('Agent name'), { target: { value: 'Q' } })
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'Role' } })
    fireEvent.change(screen.getByLabelText('Goal'), { target: { value: 'A goal' } })
    fireEvent.change(screen.getByLabelText('Backstory'), { target: { value: 'A story' } })
    await userEvent.click(screen.getByRole('button', { name: /Create Agent/ }))
    expect(await screen.findByText("Unknown tool 'x'")).toBeInTheDocument()
  })

  it('keeps built-in prompts read-only', () => {
    render(<AgentForm agent={makeAgent()} />)
    expect(screen.getByLabelText('Goal')).toBeDisabled()
    expect(screen.getByLabelText('Agent name')).toBeEnabled()
  })

  it('lets a built-in agent switch to a local Ollama model', async () => {
    const agent = makeAgent()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ...agent, llm_model: 'ollama/qwen2.5:7b' }), { status: 200 }))
    render(<AgentForm agent={agent} />)
    fireEvent.change(screen.getByLabelText('LLM model'), { target: { value: 'ollama/qwen2.5:7b' } })
    await userEvent.click(screen.getByRole('button', { name: /Save changes/ }))
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe(`/api/agents/${agent.id}`)
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ llm_model: 'ollama/qwen2.5:7b' })
  })
})

describe('results presentation', () => {
  it('renders sections, tables and charts from real data and escapes raw HTML', async () => {
    const onSection = vi.fn()
    const { rerender, container } = render(<ReportView result={makeResult()} section={0} onSection={onSection} />)
    expect(screen.getByText('Kuala Lumpur Property Outlook')).toBeInTheDocument()
    expect(screen.getByText('All tasks completed')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Price Trends' }))
    expect(onSection).toHaveBeenCalledWith(2)
    rerender(<ReportView result={makeResult()} section={2} onSection={onSection} />)
    expect(screen.getByRole('table')).toHaveTextContent('Mont Kiara')
    expect(screen.getByTestId('bar-chart')).toHaveTextContent('1,200,000')
    expect(container.querySelector('script')).toBeNull()
  })

  it('warns clearly about partial results', () => {
    render(<ReportView result={makeResult({ status: 'partial', warning: 'Only 1 of 3 tasks finished.' })} section={0} onSection={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Only 1 of 3 tasks finished.')
    expect(screen.getByText('Partial results')).toBeInTheDocument()
  })

  it('auto-presents results when the backend reports them', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(makeResult()), { status: 200 }))
    render(<ScreenContent />)
    act(() => useWorkplace.getState().receiveEvent(makeEvent(11, 'result.created', { run_id: 'run_aaaaaaaaaaaa' })))
    expect(await screen.findByText('Kuala Lumpur Property Outlook')).toBeInTheDocument()
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/runs/run_aaaaaaaaaaaa/results')
    expect(useWorkplace.getState().cameraMode).toBe('presentation')
  })
})

describe('notifications and logs', () => {
  it('shows an error notification when a workflow fails', () => {
    render(<Toasts />)
    act(() => useWorkplace.getState().receiveEvent(makeEvent(11, 'workflow.failed', {}, { level: 'error', message: 'Workflow failed: boom' })))
    expect(screen.getByRole('alert')).toHaveTextContent('Workflow failed: boom')
  })

  it('filters activity by agent, level, type and text', () => {
    const events = [
      makeEvent(1, 'task.started', {}, { agent_id: 'a', message: 'Started research' }),
      makeEvent(2, 'task.failed', {}, { agent_id: 'b', level: 'error', message: 'Writer failed' }),
    ]
    expect(filterEvents(events, { q: '', agentId: 'b', level: '', type: '' }).map((e) => e.id)).toEqual([2])
    expect(filterEvents(events, { q: 'research', agentId: '', level: '', type: '' }).map((e) => e.id)).toEqual([1])
    expect(filterEvents(events, { q: '', agentId: '', level: 'error', type: 'task.failed' }).map((e) => e.id)).toEqual([2])
  })
})
