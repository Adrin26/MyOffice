import { ArrowLeft, Crosshair, Pencil, Trash2, UserPlus } from 'lucide-react'
import type { Agent } from '../../types/api'
import { useWorkplace } from '../../stores/workplaceStore'
import { sortedAgents } from '../../lib/sync'
import { STATUS_META } from '../../lib/format'
import { api, errorMessage } from '../../services/api'
import { Button, Chip, PanelHeader } from '../ui'
import { AgentForm } from './AgentForm'

export function AgentsPanel() {
  const agents = useWorkplace((s) => s.agents)
  const editingId = useWorkplace((s) => s.editingAgentId)
  const editAgent = useWorkplace((s) => s.editAgent)
  const setPanel = useWorkplace((s) => s.setPanel)
  const editing = editingId ? agents[editingId] : null

  if (editing) {
    return (
      <div>
        <PanelHeader
          title={`Inspect ${editing.name}`}
          subtitle={`${editing.role} · ${editing.kind === 'builtin' ? 'from learn_crewai.py' : 'custom agent'} · ${editing.id}`}
          actions={<Button variant="ghost" onClick={() => editAgent(null)}><ArrowLeft className="h-4 w-4" /> All agents</Button>}
        />
        <div className="p-5">
          <AgentForm key={editing.id} agent={editing} />
        </div>
      </div>
    )
  }

  const list = sortedAgents(agents)
  return (
    <div>
      <PanelHeader
        title="Agents"
        subtitle="Registered agents. Built-in agents come from learn_crewai.py; custom agents join future runs when enabled."
        actions={<Button variant="primary" onClick={() => setPanel('add-agent')}><UserPlus className="h-4 w-4" /> Add Agent</Button>}
      />
      <div className="grid gap-3 p-5 md:grid-cols-2" data-testid="agent-list">
        {list.map((a) => <AgentCard key={a.id} agent={a} />)}
      </div>
    </div>
  )
}

function AgentCard({ agent }: { agent: Agent }) {
  const editAgent = useWorkplace((s) => s.editAgent)
  const selectAgent = useWorkplace((s) => s.selectAgent)
  const setPanel = useWorkplace((s) => s.setPanel)
  const confirm = useWorkplace((s) => s.confirm)
  const toast = useWorkplace((s) => s.toast)
  const active = useWorkplace((s) => s.active)
  const meta = STATUS_META[agent.status]
  const custom = agent.kind === 'custom'
  const canToggle = custom && !!agent.task_description && !!agent.task_expected_output

  const toggle = async () => {
    try {
      await api.updateAgent(agent.id, { enabled: !agent.enabled })
    } catch (e) {
      toast({ level: 'error', title: 'Could not update agent', message: errorMessage(e) })
    }
  }
  const remove = async () => {
    const ok = await confirm({
      title: `Remove ${agent.name}?`,
      message: 'The agent is removed from the registry. Past runs and their records are kept.',
      confirmLabel: 'Remove agent',
      danger: true,
    })
    if (!ok) return
    try {
      await api.deleteAgent(agent.id)
    } catch (e) {
      toast({ level: 'error', title: 'Could not remove agent', message: errorMessage(e) })
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-start gap-3">
        <span className="h-10 w-10 shrink-0 rounded-lg border-2 border-white/20" style={{ background: agent.appearance.shirt_color }} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-black text-white">{agent.name}</div>
          <div className="truncate text-xs text-slate-400">{agent.role}</div>
        </div>
        <Chip className={meta.chip}>{meta.label}</Chip>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        <Chip className="bg-white/5 text-slate-300 ring-white/10">{custom ? 'Custom' : 'Built-in'}</Chip>
        <Chip className="bg-white/5 text-slate-300 ring-white/10">Desk {(agent.workstation ?? 0) + 1}</Chip>
        {agent.tools.map((t) => <Chip key={t} className="bg-white/5 text-slate-300 ring-white/10">{t}</Chip>)}
        {agent.llm_model && <Chip className="bg-white/5 text-slate-300 ring-white/10">{agent.llm_model}</Chip>}
      </div>
      <p className="mt-2 line-clamp-2 text-xs text-slate-400">{agent.task_name ? `${agent.task_name}: ` : ''}{agent.task_description ?? 'No task configured.'}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {custom ? (
          <label className={`mr-auto flex items-center gap-2 text-xs font-bold ${canToggle ? 'text-white' : 'text-slate-500'}`} title={canToggle ? '' : 'Configure a task first'}>
            <input type="checkbox" className="accent-emerald-400" checked={agent.enabled} disabled={!canToggle || (active && agent.enabled)} onChange={toggle} />
            In workflow
          </label>
        ) : (
          <span className="mr-auto text-xs font-bold text-emerald-300">Always in workflow</span>
        )}
        <Button variant="ghost" onClick={() => { selectAgent(agent.id); setPanel('workspace') }} title="Show in office"><Crosshair className="h-4 w-4" /></Button>
        <Button variant="secondary" onClick={() => editAgent(agent.id)}><Pencil className="h-4 w-4" /> Inspect</Button>
        {custom && <Button variant="danger" onClick={remove} aria-label={`Remove ${agent.name}`}><Trash2 className="h-4 w-4" /></Button>}
      </div>
    </div>
  )
}
