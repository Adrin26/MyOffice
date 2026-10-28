// Mirrors backend/app/schemas/*.py. Keep both sides in sync.

export type AgentStatus = 'idle' | 'queued' | 'working' | 'completed' | 'error'
export type HairStyle = 'short' | 'spiky' | 'long' | 'bun' | 'cap' | 'bald'
export type Accessory = 'none' | 'glasses' | 'headset' | 'tie' | 'badge'
export type RunStatus = 'queued' | 'running' | 'completed' | 'failed'
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed'
export type EventLevel = 'info' | 'success' | 'warning' | 'error'
export type ActivityKind = 'thinking' | 'tool' | 'working' | null

export interface AgentAppearance {
  skin_color: string
  shirt_color: string
  pants_color: string
  hair_color: string
  hair_style: HairStyle
  accessory: Accessory
  scale: number
}

export interface AgentRuntime {
  status: AgentStatus
  current_task: string | null
  current_task_id: string | null
  /** Kind of the latest observed activity: 'thinking' (LLM call), 'tool', 'working'. */
  activity: string | null
  last_activity: string | null
  last_activity_at: string | null
  /** Only set when genuinely measurable; CrewAI does not report per-agent percentages. */
  progress: number | null
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  run_id: string | null
}

export interface Agent extends AgentRuntime {
  id: string
  project_id: string
  kind: 'builtin' | 'custom'
  name: string
  role: string
  goal: string
  backstory: string
  tools: string[]
  llm_model: string | null
  task_name: string | null
  task_description: string | null
  task_expected_output: string | null
  enabled: boolean
  participant: boolean
  workflow_order: number
  appearance: AgentAppearance
  workstation: number | null
  created_at: string
  updated_at: string
}

export interface AgentInput {
  name: string
  role: string
  goal: string
  backstory: string
  tools: string[]
  llm_model: string | null
  task_name: string | null
  task_description: string | null
  task_expected_output: string | null
  enabled: boolean
  workflow_order: number
  appearance: AgentAppearance
  workstation: number | null
}

export interface InputField {
  name: string
  label: string
  description: string
  required: boolean
  max_length: number
}

export interface Project {
  id: string
  name: string
  description: string
  process: string
  inputs: InputField[]
  builtin_agent_count: number
  default_inputs: Record<string, string>
}

export interface Participant {
  agent_id: string
  name: string
  role: string
  kind: string
}

export interface Run {
  id: string
  project_id: string
  status: RunStatus
  inputs: Record<string, string>
  participants: Participant[]
  total_tasks: number
  completed_tasks: number
  created_at: string
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  has_result: boolean
}

export interface Task {
  id: string
  run_id: string
  position: number
  key: string
  name: string
  description: string
  expected_output: string
  agent_id: string
  agent_name: string
  agent_role: string
  depends_on: string[]
  status: TaskStatus
  started_at: string | null
  completed_at: string | null
  output_preview: string | null
  error_message: string | null
}

export interface WorkplaceEvent {
  id: number
  run_id: string | null
  type: string
  timestamp: string
  level: EventLevel
  agent_id: string | null
  agent_name: string | null
  task_id: string | null
  task_name: string | null
  message: string
  data: Record<string, unknown>
}

export interface Artifact {
  id: string
  run_id: string
  kind: string
  filename: string
  size: number
  media_type: string
  created_at: string
  url: string
}

export interface ResultSection {
  id: string
  title: string
  kind: string
  markdown: string
}

export interface ResultTaskOutput {
  task_id: string
  key: string
  name: string
  agent_id: string
  agent_name: string
  status: string
  markdown: string
}

export interface PresentationResult {
  run_id: string
  status: 'completed' | 'partial' | 'failed'
  warning: string | null
  title: string
  summary: string | null
  sections: ResultSection[]
  task_outputs: ResultTaskOutput[]
  sources: { label: string; url: string }[]
  report_markdown: string | null
  artifacts: Artifact[]
  generated_at: string
}

export interface StateSnapshot {
  server_time: string
  project: Project
  agents: Agent[]
  active: boolean
  current_run: Run | null
  tasks: Task[]
  recent_events: WorkplaceEvent[]
  last_event_id: number
}

export interface ToolInfo {
  key: string
  label: string
  description: string
  available: boolean
  unavailable_reason: string | null
}

export interface ModelsInfo {
  default: string
  allowed: string[]
}

export interface AppSettings {
  default_topic: string
  auto_present: boolean
}

export interface Health {
  status: string
  version: string
  crewai_version: string
  openai_key_configured: boolean
  schema_version: number
  active_run_id: string | null
}

export type ServerMessage =
  | { kind: 'snapshot'; snapshot: StateSnapshot }
  | { kind: 'event'; event: WorkplaceEvent }
  | { kind: 'resync' }
  | { kind: 'pong' }
