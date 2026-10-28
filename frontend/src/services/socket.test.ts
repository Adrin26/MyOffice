import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkplaceSocket, type ConnectionState } from './socket'
import type { ServerMessage } from '../types/api'

class FakeWS {
  static instances: FakeWS[] = []
  readyState = 0
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {
    FakeWS.instances.push(this)
  }
  send(d: string) { this.sent.push(d) }
  close() { this.readyState = 3; this.onclose?.() }
  open() { this.readyState = 1; this.onopen?.() }
}

describe('WorkplaceSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeWS.instances = []
  })
  afterEach(() => vi.useRealTimers())

  it('delivers messages and reconnects after a drop', () => {
    const states: ConnectionState[] = []
    const messages: ServerMessage[] = []
    const sock = new WorkplaceSocket('ws://x/ws', { onState: (s) => states.push(s), onMessage: (m) => messages.push(m) },
      (u) => new FakeWS(u) as unknown as WebSocket)
    sock.connect()
    FakeWS.instances[0].open()
    FakeWS.instances[0].onmessage?.({ data: JSON.stringify({ kind: 'pong' }) })
    FakeWS.instances[0].onmessage?.({ data: 'garbage' })
    expect(messages).toEqual([{ kind: 'pong' }])

    FakeWS.instances[0].close()
    expect(states.at(-1)).toBe('reconnecting')
    vi.advanceTimersByTime(1000)
    expect(FakeWS.instances).toHaveLength(2)
    FakeWS.instances[1].open()
    expect(states.at(-1)).toBe('open')
    sock.close()
    expect(states.at(-1)).toBe('closed')
    vi.advanceTimersByTime(20000)
    expect(FakeWS.instances).toHaveLength(2)
  })

  it('backs off exponentially while the backend is down', () => {
    const sock = new WorkplaceSocket('ws://x/ws', { onState: () => {}, onMessage: () => {} }, (u) => new FakeWS(u) as unknown as WebSocket)
    sock.connect()
    FakeWS.instances[0].close()
    vi.advanceTimersByTime(700)
    FakeWS.instances[1].close()
    vi.advanceTimersByTime(700)
    expect(FakeWS.instances).toHaveLength(2)
    vi.advanceTimersByTime(800)
    expect(FakeWS.instances).toHaveLength(3)
    sock.close()
  })
})
