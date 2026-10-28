import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { AgentAppearance } from '../../types/api'
import { AgentAvatar } from '../../three/AgentAvatar'

function Spinner({ appearance }: { appearance: AgentAppearance }) {
  const group = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (group.current) group.current.rotation.y += dt * 0.6
  })
  return (
    <group ref={group} scale={appearance.scale}>
      <AgentAvatar id="preview" appearance={appearance} status="idle" pose="standing" />
    </group>
  )
}

/** Small live preview of an avatar's appearance used by the agent form. */
export function AvatarPreview({ appearance }: { appearance: AgentAppearance }) {
  return (
    <div className="h-56 w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-sky-300/30 to-slate-900" data-testid="avatar-preview">
      <Canvas camera={{ position: [0, 1.6, 4.2], fov: 40 }} dpr={[1, 1.5]}>
        <hemisphereLight args={['#ffffff', '#fde68a', 1.2]} />
        <directionalLight position={[3, 5, 4]} intensity={1.2} />
        <group position={[0, -0.25, 0]}>
          <Spinner appearance={appearance} />
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[1.1, 32]} />
            <meshStandardMaterial color="#334155" />
          </mesh>
        </group>
      </Canvas>
    </div>
  )
}
