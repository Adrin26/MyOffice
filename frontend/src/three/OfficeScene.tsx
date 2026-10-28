import { Suspense, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { AdaptiveDpr } from '@react-three/drei'
import { useWorkplace } from '../stores/workplaceStore'
import { DESKS_PER_ROW, allocateDesks, officeDepth, rowCount, workstationPosition } from '../lib/layout'
import { AgentWorkstation } from './AgentWorkstation'
import { CameraController } from './CameraController'
import { MeetingArea } from './MeetingArea'
import { OfficeEnvironment } from './OfficeEnvironment'
import { PresentationScreen } from './PresentationScreen'
import { htmlPortal } from './shared'

export function OfficeScene() {
  const agentsMap = useWorkplace((s) => s.agents)
  const shadows = useWorkplace((s) => s.prefs.shadows)
  const selectAgent = useWorkplace((s) => s.selectAgent)

  const { desks, rows, seats } = useMemo(() => {
    const desks = allocateDesks(Object.values(agentsMap))
    const rows = rowCount([...desks.keys()])
    const seats: Record<string, [number, number, number]> = {}
    for (const [index, agent] of desks) seats[agent.id] = workstationPosition(index).position
    return { desks, rows, seats }
  }, [agentsMap])

  const { front, centerZ } = officeDepth(rows)
  const deskIndices = Array.from({ length: rows * DESKS_PER_ROW }, (_, i) => i)
  const [overlayHost, setOverlayHost] = useState<HTMLDivElement | null>(null)

  return (
    <div
      className="relative h-full w-full"
      ref={(el) => {
        if (el) htmlPortal.current = el
        setOverlayHost(el)
      }}
    >
      {overlayHost && (
        <Canvas
          shadows={shadows ? 'percentage' : false}
          dpr={[1, 1.75]}
          camera={{ position: [0, 14, 18], fov: 45, near: 0.1, far: 200 }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          onPointerMissed={() => selectAgent(null)}
          data-testid="office-canvas"
        >
          <color attach="background" args={['#9fd3ff']} />
          <fog attach="fog" args={['#9fd3ff', 45, 90]} />
          <AdaptiveDpr pixelated />
          <Suspense fallback={null}>
            <OfficeEnvironment front={front} shadows={shadows} />
            <MeetingArea />
            <PresentationScreen />
            {deskIndices.map((i) => (
              <AgentWorkstation key={i} position={workstationPosition(i).position} agent={desks.get(i)} />
            ))}
          </Suspense>
          <CameraController centerZ={centerZ} front={front} seats={seats} />
        </Canvas>
      )}
    </div>
  )
}
