import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { AgentAppearance, AgentStatus } from '../types/api'
import { Block } from './Block'
import { SPHERE, hashSeed, mat } from './shared'

export type AvatarPose = 'seated' | 'standing'

export interface AgentAvatarProps {
  id: string
  appearance: AgentAppearance
  status: AgentStatus
  /** Latest activity kind reported by the backend ('thinking' | 'tool' | 'working'). */
  activity?: string | null
  pose?: AvatarPose
  reduceMotion?: boolean
}

export const HIP_Y: Record<AvatarPose, number> = { seated: 0.55, standing: 0.92 }

/**
 * Procedural blocky character. Arms, legs and head are separate pivot groups so
 * each can animate independently. Animations visualise backend-reported state.
 */
export function AgentAvatar({ id, appearance: a, status, activity, pose = 'seated', reduceMotion }: AgentAvatarProps) {
  const body = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const leftArm = useRef<THREE.Group>(null)
  const rightArm = useRef<THREE.Group>(null)
  const hips = useRef<THREE.Group>(null)
  const thought = useRef<THREE.Group>(null)
  const changedAt = useRef(0)
  const phase = useMemo(() => hashSeed(id) * 10, [id])
  const hipY = HIP_Y[pose]

  useEffect(() => {
    changedAt.current = performance.now()
  }, [status])

  useFrame((state, dt) => {
    if (!body.current || !head.current || !leftArm.current || !rightArm.current || !hips.current) return
    const t = state.clock.elapsedTime + phase
    const amp = reduceMotion ? 0.25 : 1
    const k = 1 - Math.exp(-dt * 9)
    const since = (performance.now() - changedAt.current) / 1000

    // Targets: [leftArm.x, leftArm.z, rightArm.x, rightArm.z, head.x, head.y, head.z, bounce]
    let la = -0.55, laz = 0.05, ra = -0.55, raz = -0.05, hx = 0, hy = 0, hz = 0, bounce = 0
    const breathe = 1 + Math.sin(t * 2) * 0.012 * amp

    if (status === 'idle' || status === 'queued') {
      hy = Math.sin(t * 0.45) * 0.25 * amp
      hx = Math.sin(t * 0.7) * 0.04 * amp
      if (status === 'queued') hz = Math.sin(t * 1.2) * 0.06 * amp
    } else if (status === 'working') {
      if (activity === 'thinking') {
        ra = -2.35; raz = -0.45
        la = -1.05 + Math.sin(t * 3) * 0.04 * amp
        hz = 0.12 + Math.sin(t * 1.3) * 0.06 * amp
        hy = Math.sin(t * 0.8) * 0.15 * amp
        hx = -0.08
      } else {
        la = -1.05 + Math.sin(t * 16) * 0.13 * amp
        ra = -1.05 + Math.sin(t * 16 + Math.PI) * 0.13 * amp
        hx = 0.12 + Math.sin(t * 4) * 0.04 * amp
        hy = Math.sin(t * 0.9) * 0.08 * amp
      }
    } else if (status === 'completed') {
      if (since < 6) {
        la = ra = -2.9
        laz = 0.25 + Math.sin(t * 9) * 0.25 * amp
        raz = -0.25 - Math.sin(t * 9) * 0.25 * amp
        bounce = Math.abs(Math.sin(t * 6)) * 0.18 * amp
        hx = -0.15
      } else {
        la = ra = -0.7
        hy = Math.sin(t * 0.5) * 0.2 * amp
        hx = -0.05
      }
    } else if (status === 'error') {
      la = ra = -0.15
      laz = 0.12; raz = -0.12
      hx = 0.38
      hy = Math.sin(t * 2.5) * 0.12 * amp * (Math.sin(t * 0.5) > 0 ? 1 : 0.2)
    }

    leftArm.current.rotation.x += (la - leftArm.current.rotation.x) * k
    leftArm.current.rotation.z += (laz - leftArm.current.rotation.z) * k
    rightArm.current.rotation.x += (ra - rightArm.current.rotation.x) * k
    rightArm.current.rotation.z += (raz - rightArm.current.rotation.z) * k
    head.current.rotation.x += (hx - head.current.rotation.x) * k
    head.current.rotation.y += (hy - head.current.rotation.y) * k
    head.current.rotation.z += (hz - head.current.rotation.z) * k
    body.current.scale.y = breathe
    hips.current.position.y += (hipY + bounce - hips.current.position.y) * Math.min(1, k * 2)

    if (thought.current) {
      thought.current.children.forEach((c, i) => {
        c.position.y = 0.15 * i + Math.sin(t * 4 + i) * 0.04 * amp
      })
    }
  })

  const legRotation = pose === 'seated' ? -Math.PI / 2 : 0
  const mouthCornerY = status === 'error' ? -0.2 : -0.12
  const mouthWidth = status === 'completed' ? 0.3 : 0.2

  return (
    <group>
      <group ref={hips} position={[0, hipY, 0]}>
        {/* Legs */}
        {[-0.22, 0.22].map((x) => (
          <group key={x} position={[x, 0, 0]} rotation={[legRotation, 0, 0]}>
            <Block size={[0.42, 0.9, 0.44]} position={[0, -0.45, 0]} color={a.pants_color} shadow />
            <Block size={[0.44, 0.12, 0.46]} position={[0, -0.86, 0]} color="#1f2937" />
          </group>
        ))}

        <group ref={body}>
          {/* Torso */}
          <Block size={[0.9, 0.95, 0.48]} position={[0, 0.475, 0]} color={a.shirt_color} shadow />
          <Block size={[0.92, 0.1, 0.5]} position={[0, 0.05, 0]} color={a.pants_color} />
          {a.accessory === 'tie' && (
            <>
              <Block size={[0.14, 0.1, 0.03]} position={[0, 0.88, 0.25]} color="#991b1b" />
              <Block size={[0.12, 0.55, 0.03]} position={[0, 0.55, 0.25]} color="#b91c1c" />
            </>
          )}
          {a.accessory === 'badge' && (
            <>
              <Block size={[0.18, 0.22, 0.03]} position={[0.22, 0.68, 0.25]} color="#f8fafc" />
              <Block size={[0.18, 0.06, 0.035]} position={[0.22, 0.76, 0.25]} color="#f59e0b" />
            </>
          )}

          {/* Arms: pivot at the shoulder */}
          {([[-0.64, leftArm], [0.64, rightArm]] as const).map(([x, ref]) => (
            <group key={x} ref={ref} position={[x, 0.88, 0]}>
              <Block size={[0.38, 0.48, 0.42]} position={[0, -0.2, 0]} color={a.shirt_color} shadow />
              <Block size={[0.34, 0.46, 0.38]} position={[0, -0.64, 0]} color={a.skin_color} shadow />
            </group>
          ))}

          {/* Head: pivot at the neck */}
          <group ref={head} position={[0, 0.95, 0]}>
            <Block size={[0.72, 0.72, 0.72]} position={[0, 0.38, 0]} color={a.skin_color} shadow />
            {/* Face */}
            <Block size={[0.1, 0.15, 0.02]} position={[-0.15, 0.45, 0.365]} color="#111827" />
            <Block size={[0.1, 0.15, 0.02]} position={[0.15, 0.45, 0.365]} color="#111827" />
            <Block size={[mouthWidth, 0.05, 0.02]} position={[0, 0.25, 0.365]} color="#7f1d1d" />
            <Block size={[0.06, 0.05, 0.02]} position={[-mouthWidth / 2 - 0.02, 0.38 + mouthCornerY + 0.01, 0.365]} color="#7f1d1d" />
            <Block size={[0.06, 0.05, 0.02]} position={[mouthWidth / 2 + 0.02, 0.38 + mouthCornerY + 0.01, 0.365]} color="#7f1d1d" />
            <Hair style={a.hair_style} color={a.hair_color} />
            {a.accessory === 'glasses' && (
              <>
                <Block size={[0.22, 0.17, 0.03]} position={[-0.15, 0.45, 0.375]} color="#0f172a" roughness={0.2} />
                <Block size={[0.22, 0.17, 0.03]} position={[0.15, 0.45, 0.375]} color="#0f172a" roughness={0.2} />
                <Block size={[0.1, 0.03, 0.03]} position={[0, 0.48, 0.375]} color="#0f172a" />
              </>
            )}
            {a.accessory === 'headset' && (
              <>
                <Block size={[0.84, 0.07, 0.14]} position={[0, 0.84, 0]} color="#1f2937" />
                <Block size={[0.08, 0.5, 0.1]} position={[-0.4, 0.6, 0]} color="#1f2937" />
                <Block size={[0.08, 0.5, 0.1]} position={[0.4, 0.6, 0]} color="#1f2937" />
                <Block size={[0.1, 0.26, 0.26]} position={[-0.41, 0.38, 0]} color="#334155" />
                <Block size={[0.1, 0.26, 0.26]} position={[0.41, 0.38, 0]} color="#334155" />
                <Block size={[0.04, 0.04, 0.34]} position={[-0.38, 0.28, 0.2]} rotation={[0, 0.5, 0]} color="#334155" />
              </>
            )}
          </group>
        </group>

        {/* Status props above the head */}
        {status === 'working' && activity === 'thinking' && (
          <group ref={thought} position={[0.55, 2.0, 0.1]}>
            {[0.08, 0.12, 0.17].map((r, i) => (
              <mesh key={i} geometry={SPHERE} material={mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.4 })}
                scale={r * 2} position={[i * 0.12, 0.15 * i, 0]} />
            ))}
          </group>
        )}
        {status === 'error' && (
          <group position={[0, 2.25, 0]}>
            <Block size={[0.14, 0.38, 0.14]} position={[0, 0.12, 0]} color="#ef4444" emissive="#ef4444" emissiveIntensity={0.8} />
            <Block size={[0.14, 0.14, 0.14]} position={[0, -0.18, 0]} color="#ef4444" emissive="#ef4444" emissiveIntensity={0.8} />
          </group>
        )}
      </group>
    </group>
  )
}

function Hair({ style, color }: { style: AgentAppearance['hair_style']; color: string }) {
  switch (style) {
    case 'bald':
      return null
    case 'spiky':
      return (
        <>
          <Block size={[0.76, 0.12, 0.76]} position={[0, 0.78, 0]} color={color} />
          <Block size={[0.76, 0.35, 0.12]} position={[0, 0.6, -0.33]} color={color} />
          {[[-0.22, 0.2], [0, 0], [0.22, -0.2], [-0.12, -0.15], [0.14, 0.18]].map(([x, z], i) => (
            <Block key={i} size={[0.17, 0.26, 0.17]} position={[x, 0.92, z]} rotation={[z * 1.2, 0, -x * 1.6]} color={color} />
          ))}
        </>
      )
    case 'long':
      return (
        <>
          <Block size={[0.78, 0.16, 0.78]} position={[0, 0.79, 0]} color={color} />
          <Block size={[0.8, 0.95, 0.14]} position={[0, 0.36, -0.35]} color={color} />
          <Block size={[0.1, 0.62, 0.62]} position={[-0.39, 0.46, -0.05]} color={color} />
          <Block size={[0.1, 0.62, 0.62]} position={[0.39, 0.46, -0.05]} color={color} />
          <Block size={[0.78, 0.1, 0.08]} position={[0, 0.68, 0.35]} color={color} />
        </>
      )
    case 'bun':
      return (
        <>
          <Block size={[0.78, 0.16, 0.78]} position={[0, 0.79, 0]} color={color} />
          <Block size={[0.78, 0.4, 0.12]} position={[0, 0.58, -0.34]} color={color} />
          <Block size={[0.32, 0.32, 0.32]} position={[0, 0.95, -0.22]} color={color} />
        </>
      )
    case 'cap':
      return (
        <>
          <Block size={[0.8, 0.24, 0.8]} position={[0, 0.82, 0]} color={color} />
          <Block size={[0.66, 0.06, 0.34]} position={[0, 0.72, 0.5]} color={color} />
          <Block size={[0.12, 0.1, 0.12]} position={[0, 0.97, 0]} color="#f8fafc" />
        </>
      )
    case 'short':
    default:
      return (
        <>
          <Block size={[0.78, 0.16, 0.78]} position={[0, 0.79, 0]} color={color} />
          <Block size={[0.78, 0.45, 0.12]} position={[0, 0.55, -0.34]} color={color} />
          <Block size={[0.78, 0.1, 0.08]} position={[0, 0.69, 0.35]} color={color} />
        </>
      )
  }
}
