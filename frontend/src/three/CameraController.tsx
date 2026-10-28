import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useWorkplace } from '../stores/workplaceStore'
import { SCREEN } from '../lib/layout'

interface Props {
  centerZ: number
  front: number
  /** World position of each agent's seat, keyed by agent id. */
  seats: Record<string, [number, number, number]>
}

/** Smoothly moves the camera between overview, top-down, agent focus and the presentation wall. */
export function CameraController({ centerZ, front, seats }: Props) {
  const controls = useRef<OrbitControlsImpl>(null)
  const camera = useThree((s) => s.camera)
  const mode = useWorkplace((s) => s.cameraMode)
  const nonce = useWorkplace((s) => s.cameraNonce)
  const selectedId = useWorkplace((s) => s.selectedAgentId)
  const goal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null)
  const seatX = selectedId ? seats[selectedId]?.[0] : undefined
  const seatZ = selectedId ? seats[selectedId]?.[2] : undefined
  const aspect = useThree((s) => (s.size.width > 0 && s.size.height > 0 ? s.size.width / s.size.height : 1.6))
  // Wide shots are framed for a landscape view; pull back on narrow viewports so the full width fits.
  // A hidden canvas reports a zero size, so the aspect falls back to landscape.
  const widen = Math.min(2.5, Math.max(1, 1.25 / aspect))

  useEffect(() => {
    let pos: THREE.Vector3
    let target: THREE.Vector3
    if (mode === 'focus' && seatX !== undefined && seatZ !== undefined) {
      const x = seatX
      const z = seatZ
      target = new THREE.Vector3(x, 1.6, z + 0.4)
      pos = new THREE.Vector3(x + 1.2, 4.2, z + 6.2)
    } else if (mode === 'top') {
      target = new THREE.Vector3(0, 0, centerZ)
      pos = new THREE.Vector3(0, 30, centerZ + 0.01)
    } else if (mode === 'presentation') {
      target = new THREE.Vector3(0, SCREEN.y, SCREEN.z)
      pos = new THREE.Vector3(0, SCREEN.y + 0.3, SCREEN.z + 8.6 * widen)
    } else {
      target = new THREE.Vector3(0, 1.2, centerZ - 0.5)
      pos = new THREE.Vector3(0, 13 + (front - 8) * 0.25, front + 9).sub(target).multiplyScalar(widen).add(target)
    }
    goal.current = { pos, target }
  }, [mode, nonce, seatX, seatZ, centerZ, front, widen])

  useEffect(() => {
    const c = controls.current
    if (!c) return
    const cancel = () => {
      goal.current = null
    }
    c.addEventListener('start', cancel)
    return () => c.removeEventListener('start', cancel)
  }, [])

  useFrame((_, dt) => {
    const g = goal.current
    const c = controls.current
    if (!g || !c) return
    if (!Number.isFinite(camera.position.lengthSq()) || !Number.isFinite(c.target.lengthSq())) {
      camera.position.copy(g.pos)
      c.target.copy(g.target)
    }
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 3.5)
    camera.position.lerp(g.pos, k)
    c.target.lerp(g.target, k)
    c.update()
    if (camera.position.distanceTo(g.pos) < 0.02 && c.target.distanceTo(g.target) < 0.02) goal.current = null
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      minDistance={2.5}
      maxDistance={48}
      maxPolarAngle={Math.PI / 2.08}
      screenSpacePanning
    />
  )
}
