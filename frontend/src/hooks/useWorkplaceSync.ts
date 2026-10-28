import { useEffect } from 'react'
import { WorkplaceSocket, defaultSocketUrl } from '../services/socket'
import { useWorkplace } from '../stores/workplaceStore'

/** Connects the live WebSocket to the store for the lifetime of the app. */
export function useWorkplaceSync(): void {
  useEffect(() => {
    const { receiveSnapshot, receiveEvent, setConnection, loadMeta } = useWorkplace.getState()
    void loadMeta()
    const socket = new WorkplaceSocket(defaultSocketUrl(), {
      onState: (state) => {
        setConnection(state)
        if (state === 'open') void loadMeta()
      },
      onMessage: (msg) => {
        if (msg.kind === 'snapshot') receiveSnapshot(msg.snapshot)
        else if (msg.kind === 'event') receiveEvent(msg.event)
      },
    })
    socket.connect()
    return () => socket.close()
  }, [])
}
