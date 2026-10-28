import { useRef } from 'react'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SCREEN } from '../lib/layout'
import { useWorkplace } from '../stores/workplaceStore'
import { ScreenContent } from '../components/presentation/ScreenContent'
import { Block } from './Block'
import { htmlPortal } from './shared'

const PX_W = 1600
const PX_H = 900
// drei <Html transform>: 1 CSS px = distanceFactor / 400 world units.
const DISTANCE_FACTOR = (SCREEN.width / PX_W) * 400

/** The giant wall display. Content is real DOM laid onto the wall, so text stays crisp. */
export function PresentationScreen() {
  const open = useWorkplace((s) => s.presentation.open)
  const glow = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (!glow.current) return
    const m = glow.current.material as THREE.MeshStandardMaterial
    m.emissiveIntensity = open ? 1.4 + Math.sin(clock.elapsedTime * 3) * 0.4 : 0.6
  })

  return (
    <group position={[0, SCREEN.y, SCREEN.z]}>
      {/* Bezel, glow strip and stand */}
      <Block size={[SCREEN.width + 0.5, SCREEN.height + 0.5, 0.2]} position={[0, 0, -0.08]} color="#0f172a" roughness={0.4} shadow />
      <mesh ref={glow} position={[0, -SCREEN.height / 2 - 0.3, 0.05]} scale={[SCREEN.width, 0.08, 0.05]}>
        <boxGeometry />
        <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.6} />
      </mesh>
      <Block size={[SCREEN.width, SCREEN.height, 0.02]} position={[0, 0, 0.02]} color="#0b1220" emissive="#0b1220" emissiveIntensity={0.3} />
      {/* Stage in front of the screen */}
      <Block size={[SCREEN.width + 2, 0.25, 2.2]} position={[0, -SCREEN.y + 0.125, 1.1]} color="#1e3a8a" shadow />
      <Block size={[SCREEN.width + 2.2, 0.08, 2.4]} position={[0, -SCREEN.y + 0.04, 1.1]} color="#fbbf24" />

      <Html
        transform
        position={[0, 0, 0.04]}
        distanceFactor={DISTANCE_FACTOR}
        zIndexRange={[10, 0]}
        portal={htmlPortal}
        style={{ width: PX_W, height: PX_H }}
      >
        <div
          className="screen-root h-[900px] w-[1600px] overflow-hidden rounded-md bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 p-10 text-slate-100"
          data-testid="presentation-screen"
        >
          <ScreenContent />
        </div>
      </Html>
    </group>
  )
}
