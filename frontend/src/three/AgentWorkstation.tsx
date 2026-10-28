import { memo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { Agent } from '../types/api'
import { useWorkplace } from '../stores/workplaceStore'
import { AgentAvatar, HIP_Y } from './AgentAvatar'
import { ComputerMonitor, Desk, OfficeChair } from './Furniture'
import { FloatingAgentLabel } from './FloatingAgentLabel'

const RING_GEOMETRY = new THREE.RingGeometry(0.8, 0.98, 40)

interface Props {
  position: [number, number, number]
  agent?: Agent
}

/** Desk + chair + monitor, optionally occupied by an agent avatar. */
export const AgentWorkstation = memo(function AgentWorkstation({ position, agent }: Props) {
  return (
    <group position={position}>
      <group position={[0, 0, 0.95]}>
        <Desk />
        <ComputerMonitor status={agent ? agent.status : 'empty'} />
      </group>
      <OfficeChair color={agent ? '#1e293b' : '#475569'} />
      {agent && <SeatedAgent agent={agent} />}
    </group>
  )
})

function SeatedAgent({ agent }: { agent: Agent }) {
  const selected = useWorkplace((s) => s.selectedAgentId === agent.id)
  const hovered = useWorkplace((s) => s.hoveredAgentId === agent.id)
  const selectAgent = useWorkplace((s) => s.selectAgent)
  const hoverAgent = useWorkplace((s) => s.hoverAgent)
  const reduceMotion = useWorkplace((s) => s.prefs.reduceMotion)
  const showLabels = useWorkplace((s) => s.prefs.showLabels)
  const ring = useRef<THREE.Mesh>(null)
  const scale = agent.appearance.scale

  useFrame(({ clock }) => {
    if (ring.current && selected) {
      const s = 1 + Math.sin(clock.elapsedTime * 4) * 0.06
      ring.current.scale.set(s, s, s)
    }
  })

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    selectAgent(agent.id)
  }
  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    hoverAgent(agent.id)
    document.body.style.cursor = 'pointer'
  }
  const onOut = () => {
    hoverAgent(null)
    document.body.style.cursor = ''
  }

  return (
    <group>
      {(selected || hovered) && (
        <mesh ref={ring} geometry={RING_GEOMETRY} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0.2]}>
          <meshBasicMaterial color={selected ? '#fbbf24' : '#e0f2fe'} transparent opacity={0.9} />
        </mesh>
      )}
      <group
        position={[0, HIP_Y.seated * (1 - scale), 0]}
        scale={scale}
        onClick={onClick}
        onPointerOver={onOver}
        onPointerOut={onOut}
      >
        <AgentAvatar
          id={agent.id}
          appearance={agent.appearance}
          status={agent.status}
          activity={agent.activity}
          reduceMotion={reduceMotion}
        />
      </group>
      {showLabels && <FloatingAgentLabel agent={agent} y={3.25 * scale} highlighted={selected || hovered} />}
    </group>
  )
}
