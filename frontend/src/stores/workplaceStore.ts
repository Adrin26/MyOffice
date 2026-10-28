import { create } from 'zustand'
import { api, errorMessage } from '../services/api'
import type { ConnectionState } from '../services/socket'
import { applyEvent, applySnapshot, emptySync, type SyncState } from '../lib/sync'
import type {
  AppSettings, Health, ModelsInfo, PresentationResult, StateSnapshot, ToolInfo, WorkplaceEvent,
} from '../types/api'

export type PanelId = 'workspace' | 'agents' | 'add-agent' | 'tasks' | 'results' | 'logs' | 'settings'
export type CameraMode = 'overview' | 'top' | 'focus' | 'presentation'

export interface Toast {
  id: number
  level: 'info' | 'success' | 'warning' | 'error'
  title: string
  message?: string
}

export interface ConfirmRequest {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  resolve: (ok: boolean) => void
}

interface PresentationState {
  open: boolean
  runId: string | null
  result: PresentationResult | null
  loading: boolean
  error: string | null
  section: number
  expanded: boolean
}

export interface UiPrefs {
  shadows: boolean
  reduceMotion: boolean
  showLabels: boolean
}

interface WorkplaceStore extends SyncState {
  connection: ConnectionState
  selectedAgentId: string | null
  hoveredAgentId: string | null
  cameraMode: CameraMode
  cameraNonce: number
  panel: PanelId
  editingAgentId: string | null
  startDialogOpen: boolean
  presentation: PresentationState
  toasts: Toast[]
  confirmRequest: ConfirmRequest | null
  appSettings: AppSettings
  prefs: UiPrefs
  tools: ToolInfo[]
  models: ModelsInfo | null
  health: Health | null

  setConnection: (c: ConnectionState) => void
  receiveSnapshot: (s: StateSnapshot) => void
  receiveEvent: (e: WorkplaceEvent) => void
  selectAgent: (id: string | null, focus?: boolean) => void
  hoverAgent: (id: string | null) => void
  setCameraMode: (mode: CameraMode) => void
  setPanel: (panel: PanelId) => void
  editAgent: (id: string | null) => void
  setStartDialog: (open: boolean) => void
  presentRun: (runId: string) => Promise<void>
  closePresentation: () => void
  setSection: (i: number) => void
  setExpanded: (v: boolean) => void
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: number) => void
  confirm: (req: Omit<ConfirmRequest, 'resolve'>) => Promise<boolean>
  resolveConfirm: (ok: boolean) => void
  setPrefs: (p: Partial<UiPrefs>) => void
  setAppSettings: (s: AppSettings) => void
  loadMeta: () => Promise<void>
}

const PREFS_KEY = 'workplace.prefs'
const loadPrefs = (): UiPrefs => {
  const defaults: UiPrefs = { shadows: true, reduceMotion: false, showLabels: true }
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') }
  } catch {
    return defaults
  }
}

let toastSeq = 0

const EVENT_TOASTS: Record<string, Toast['level']> = {
  'workflow.started': 'info',
  'workflow.completed': 'success',
  'workflow.failed': 'error',
  'task.completed': 'success',
  'task.failed': 'error',
  'agent.registered': 'success',
  'agent.removed': 'warning',
}

export const useWorkplace = create<WorkplaceStore>((set, get) => ({
  ...emptySync,
  connection: 'connecting',
  selectedAgentId: null,
  hoveredAgentId: null,
  cameraMode: 'overview',
  cameraNonce: 0,
  panel: 'workspace',
  editingAgentId: null,
  startDialogOpen: false,
  presentation: { open: false, runId: null, result: null, loading: false, error: null, section: 0, expanded: false },
  toasts: [],
  confirmRequest: null,
  appSettings: { default_topic: '', auto_present: true },
  prefs: loadPrefs(),
  tools: [],
  models: null,
  health: null,

  setConnection: (connection) => set({ connection }),

  receiveSnapshot: (snap) =>
    set((s) => {
      const next = applySnapshot(s, snap)
      const selectedAgentId = s.selectedAgentId && next.agents[s.selectedAgentId] ? s.selectedAgentId : null
      return { ...next, selectedAgentId }
    }),

  receiveEvent: (e) => {
    const before = get()
    if (e.id <= before.lastEventId) return
    set((s) => {
      const next = applyEvent(s, e)
      const selectedAgentId = s.selectedAgentId && next.agents[s.selectedAgentId] ? s.selectedAgentId : null
      return { ...next, selectedAgentId }
    })
    const level = EVENT_TOASTS[e.type]
    if (level) get().toast({ level, title: e.message })
    if (e.type === 'result.created' && get().appSettings.auto_present && e.run_id) {
      void get().presentRun(e.run_id)
    }
  },

  selectAgent: (id, focus = true) =>
    set((s) => ({
      selectedAgentId: id,
      cameraMode: id && focus ? 'focus' : s.cameraMode === 'focus' ? 'overview' : s.cameraMode,
      cameraNonce: s.cameraNonce + 1,
    })),
  hoverAgent: (hoveredAgentId) => set({ hoveredAgentId }),
  setCameraMode: (cameraMode) => set((s) => ({ cameraMode, cameraNonce: s.cameraNonce + 1 })),
  setPanel: (panel) => set({ panel, editingAgentId: panel === 'agents' ? get().editingAgentId : null }),
  editAgent: (editingAgentId) => set({ editingAgentId, panel: 'agents' }),
  setStartDialog: (startDialogOpen) => set({ startDialogOpen }),

  presentRun: async (runId) => {
    set((s) => ({
      presentation: { ...s.presentation, open: true, runId, loading: true, error: null, section: 0 },
      cameraMode: 'presentation',
      cameraNonce: s.cameraNonce + 1,
      panel: 'workspace',
    }))
    try {
      const result = await api.results(runId)
      set((s) => ({ presentation: { ...s.presentation, result, loading: false } }))
    } catch (err) {
      set((s) => ({ presentation: { ...s.presentation, loading: false, error: errorMessage(err) } }))
    }
  },
  closePresentation: () =>
    set((s) => ({
      presentation: { ...s.presentation, open: false, expanded: false },
      cameraMode: 'overview',
      cameraNonce: s.cameraNonce + 1,
    })),
  setSection: (section) => set((s) => ({ presentation: { ...s.presentation, section } })),
  setExpanded: (expanded) => set((s) => ({ presentation: { ...s.presentation, expanded } })),

  toast: (t) => {
    const id = ++toastSeq
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...t, id }] }))
    setTimeout(() => get().dismissToast(id), t.level === 'error' ? 9000 : 5000)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  confirm: (req) =>
    new Promise<boolean>((resolve) => {
      get().confirmRequest?.resolve(false)
      set({ confirmRequest: { ...req, resolve } })
    }),
  resolveConfirm: (ok) => {
    get().confirmRequest?.resolve(ok)
    set({ confirmRequest: null })
  },

  setPrefs: (p) => {
    const prefs = { ...get().prefs, ...p }
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    set({ prefs })
  },
  setAppSettings: (appSettings) => set({ appSettings }),

  loadMeta: async () => {
    const results = await Promise.allSettled([api.tools(), api.models(), api.getSettings(), api.health()])
    const [tools, models, settings, health] = results
    set({
      ...(tools.status === 'fulfilled' ? { tools: tools.value } : {}),
      ...(models.status === 'fulfilled' ? { models: models.value } : {}),
      ...(settings.status === 'fulfilled' ? { appSettings: settings.value } : {}),
      ...(health.status === 'fulfilled' ? { health: health.value } : {}),
    })
  },
}))
