import type { ServerMessage } from '../types/api'

export type ConnectionState = 'connecting' | 'open' | 'reconnecting' | 'closed'

interface Handlers {
  onMessage: (msg: ServerMessage) => void
  onState: (state: ConnectionState) => void
}

const HEARTBEAT_MS = 15_000
const STALE_MS = 40_000
const MAX_BACKOFF_MS = 10_000

export function defaultSocketUrl(path = '/ws'): string {
  const base = import.meta.env.VITE_WS_BASE as string | undefined
  if (base) return base + path
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}${path}`
}

/**
 * WebSocket with automatic reconnection. The server sends a full snapshot on
 * every (re)connect, so no client-side replay is needed.
 */
export class WorkplaceSocket {
  private ws: WebSocket | null = null
  private attempts = 0
  private heartbeat: ReturnType<typeof setInterval> | undefined
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private lastMessageAt = 0
  private stopped = false
  private readonly url: string
  private readonly handlers: Handlers
  private readonly factory: (url: string) => WebSocket

  constructor(url: string, handlers: Handlers, factory: (url: string) => WebSocket = (u) => new WebSocket(u)) {
    this.url = url
    this.handlers = handlers
    this.factory = factory
  }

  connect(): void {
    this.stopped = false
    this.open()
  }

  close(): void {
    this.stopped = true
    clearTimeout(this.retryTimer)
    clearInterval(this.heartbeat)
    this.ws?.close()
    this.ws = null
    this.handlers.onState('closed')
  }

  requestSync(): void {
    this.send({ type: 'sync' })
  }

  private send(msg: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  private open(): void {
    this.handlers.onState(this.attempts === 0 ? 'connecting' : 'reconnecting')
    const ws = this.factory(this.url)
    this.ws = ws
    ws.onopen = () => {
      this.attempts = 0
      this.lastMessageAt = Date.now()
      this.handlers.onState('open')
      clearInterval(this.heartbeat)
      this.heartbeat = setInterval(() => {
        if (Date.now() - this.lastMessageAt > STALE_MS) {
          ws.close()
          return
        }
        this.send({ type: 'ping' })
      }, HEARTBEAT_MS)
    }
    ws.onmessage = (ev) => {
      this.lastMessageAt = Date.now()
      try {
        this.handlers.onMessage(JSON.parse(ev.data as string) as ServerMessage)
      } catch (err) {
        console.warn('Ignoring malformed socket message', err)
      }
    }
    ws.onclose = () => {
      clearInterval(this.heartbeat)
      if (this.ws !== ws || this.stopped) return
      this.scheduleReconnect()
    }
    ws.onerror = () => ws.close()
  }

  private scheduleReconnect(): void {
    this.attempts += 1
    const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** (this.attempts - 1)) * (0.75 + Math.random() * 0.5)
    this.handlers.onState('reconnecting')
    this.retryTimer = setTimeout(() => this.open(), delay)
  }
}
