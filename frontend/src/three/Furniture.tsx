import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { AgentStatus } from '../types/api'
import { Block } from './Block'
import { BOX, CYLINDER, mat } from './shared'

export const DESK_TOP_Y = 0.86

export function Desk({ color = '#f5deb3' }: { color?: string }) {
  return (
    <group>
      <Block size={[1.9, 0.09, 0.95]} position={[0, DESK_TOP_Y, 0]} color={color} roughness={0.5} shadow />
      <Block size={[0.08, 0.82, 0.85]} position={[-0.88, 0.41, 0]} color="#cbd5e1" shadow />
      <Block size={[0.08, 0.82, 0.85]} position={[0.88, 0.41, 0]} color="#cbd5e1" shadow />
      <Block size={[1.7, 0.45, 0.04]} position={[0, 0.55, 0.42]} color="#e2e8f0" />
      {/* Keyboard and mouse */}
      <Block size={[0.62, 0.035, 0.2]} position={[0, DESK_TOP_Y + 0.06, -0.18]} color="#334155" />
      <Block size={[0.1, 0.035, 0.14]} position={[0.45, DESK_TOP_Y + 0.06, -0.18]} color="#334155" />
      {/* Mug */}
      <mesh geometry={CYLINDER} material={mat('#ef4444')} scale={[0.12, 0.14, 0.12]} position={[-0.7, DESK_TOP_Y + 0.12, -0.15]} />
    </group>
  )
}

const SCREEN_COLORS: Record<AgentStatus | 'empty', { color: string; intensity: number }> = {
  empty: { color: '#0f172a', intensity: 0 },
  idle: { color: '#1e3a8a', intensity: 0.35 },
  queued: { color: '#6d28d9', intensity: 0.6 },
  working: { color: '#0ea5e9', intensity: 1.1 },
  completed: { color: '#22c55e', intensity: 0.9 },
  error: { color: '#ef4444', intensity: 1.0 },
}

/** Low-profile monitor facing the seated agent; its glow mirrors agent status. */
export function ComputerMonitor({ status }: { status: AgentStatus | 'empty' }) {
  const { color, intensity } = SCREEN_COLORS[status]
  // Per-monitor material because its brightness animates.
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#0b1220', emissive: color, emissiveIntensity: intensity, roughness: 0.3 }),
    [color, intensity],
  )
  useEffect(() => () => material.dispose(), [material])

  useFrame(({ clock }) => {
    if (status === 'working') {
      material.emissiveIntensity = intensity * (0.8 + Math.sin(clock.elapsedTime * 6) * 0.2)
    }
  })

  return (
    <group position={[0, DESK_TOP_Y + 0.05, 0.18]}>
      <Block size={[0.3, 0.03, 0.2]} position={[0, 0, 0]} color="#475569" />
      <Block size={[0.06, 0.18, 0.06]} position={[0, 0.1, 0.02]} color="#475569" />
      <Block size={[0.95, 0.5, 0.06]} position={[0, 0.42, 0.03]} color="#1e293b" shadow />
      <mesh geometry={BOX} material={material} scale={[0.87, 0.42, 0.01]} position={[0, 0.42, -0.005]} />
    </group>
  )
}

export function OfficeChair({ color = '#334155' }: { color?: string }) {
  return (
    <group>
      <Block size={[0.78, 0.12, 0.72]} position={[0, 0.48, 0]} color={color} shadow />
      <Block size={[0.78, 0.8, 0.1]} position={[0, 0.93, -0.38]} color={color} shadow />
      <Block size={[0.08, 0.42, 0.08]} position={[0, 0.22, 0]} color="#64748b" />
      <Block size={[0.6, 0.05, 0.08]} position={[0, 0.03, 0]} color="#64748b" />
      <Block size={[0.08, 0.05, 0.6]} position={[0, 0.03, 0]} color="#64748b" />
    </group>
  )
}

export function Plant({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale}>
      <mesh geometry={CYLINDER} material={mat('#c2410c', { roughness: 0.8 })} scale={[0.5, 0.55, 0.5]} position={[0, 0.275, 0]} castShadow />
      <Block size={[0.42, 0.06, 0.42]} position={[0, 0.56, 0]} color="#78350f" />
      <Block size={[0.12, 0.6, 0.12]} position={[0, 0.85, 0]} color="#166534" />
      <Block size={[0.6, 0.5, 0.6]} position={[0, 1.25, 0]} color="#22c55e" shadow />
      <Block size={[0.42, 0.42, 0.42]} position={[0.22, 1.6, 0.1]} color="#16a34a" shadow />
      <Block size={[0.36, 0.36, 0.36]} position={[-0.22, 1.5, -0.12]} color="#4ade80" shadow />
    </group>
  )
}

export function Sofa({ color = '#6366f1' }: { color?: string }) {
  return (
    <group>
      <Block size={[2.6, 0.45, 1]} position={[0, 0.3, 0]} color={color} shadow />
      <Block size={[2.6, 0.8, 0.25]} position={[0, 0.75, -0.4]} color={color} shadow />
      <Block size={[0.25, 0.65, 1]} position={[-1.3, 0.5, 0]} color={color} shadow />
      <Block size={[0.25, 0.65, 1]} position={[1.3, 0.5, 0]} color={color} shadow />
      <Block size={[1.1, 0.12, 0.85]} position={[-0.6, 0.58, 0.05]} color="#818cf8" />
      <Block size={[1.1, 0.12, 0.85]} position={[0.6, 0.58, 0.05]} color="#818cf8" />
    </group>
  )
}

export function CoffeeStation() {
  return (
    <group>
      <Block size={[1.6, 0.9, 0.7]} position={[0, 0.45, 0]} color="#e2e8f0" shadow />
      <Block size={[1.64, 0.06, 0.74]} position={[0, 0.92, 0]} color="#475569" />
      <Block size={[0.45, 0.6, 0.45]} position={[-0.4, 1.25, 0]} color="#1f2937" shadow />
      <Block size={[0.2, 0.08, 0.05]} position={[-0.4, 1.35, 0.24]} color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.8} />
      <mesh geometry={CYLINDER} material={mat('#bae6fd', { transparent: true, opacity: 0.7, roughness: 0.1 })} scale={[0.36, 0.6, 0.36]} position={[0.4, 1.25, 0]} />
    </group>
  )
}

export function Whiteboard() {
  return (
    <group>
      <Block size={[2.4, 1.4, 0.08]} position={[0, 1.6, 0]} color="#f8fafc" roughness={0.3} shadow />
      <Block size={[2.5, 0.08, 0.12]} position={[0, 0.88, 0.04]} color="#94a3b8" />
      <Block size={[0.9, 0.06, 0.01]} position={[-0.5, 1.95, 0.05]} color="#2563eb" />
      <Block size={[1.3, 0.06, 0.01]} position={[-0.3, 1.75, 0.05]} color="#16a34a" />
      <Block size={[0.6, 0.06, 0.01]} position={[-0.65, 1.55, 0.05]} color="#dc2626" />
      <Block size={[0.4, 0.4, 0.01]} position={[0.75, 1.55, 0.05]} color="#fde047" />
      <Block size={[0.06, 0.9, 0.06]} position={[-1.1, 0.45, 0]} color="#94a3b8" />
      <Block size={[0.06, 0.9, 0.06]} position={[1.1, 0.45, 0]} color="#94a3b8" />
    </group>
  )
}
