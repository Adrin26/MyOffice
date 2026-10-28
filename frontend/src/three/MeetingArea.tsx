import { BACK_WALL_Z } from '../lib/layout'
import { Block } from './Block'
import { OfficeChair, Whiteboard } from './Furniture'
import { CYLINDER, mat } from './shared'

/** Round meeting table with chairs and a whiteboard, back-left corner. */
export function MeetingArea() {
  const seats: [number, number, number][] = [
    [0, 0, -1.4], [1.4, 0, 0], [0, 0, 1.4], [-1.4, 0, 0],
  ]
  return (
    <group position={[-7.4, 0, BACK_WALL_Z + 3.6]}>
      <mesh geometry={CYLINDER} material={mat('#fbbf24', { roughness: 0.6 })} scale={[2.6, 0.12, 2.6]} position={[0, 0.82, 0]} castShadow receiveShadow />
      <mesh geometry={CYLINDER} material={mat('#78716c')} scale={[0.25, 0.8, 0.25]} position={[0, 0.4, 0]} />
      <Block size={[1, 0.04, 1]} position={[0, 0.02, 0]} color="#78716c" />
      {seats.map((p, i) => (
        <group key={i} position={p} rotation={[0, Math.atan2(-p[0], -p[2]), 0]}>
          <OfficeChair color="#0f766e" />
        </group>
      ))}
      <Block size={[3.8, 0.02, 3.8]} position={[0, 0.011, 0]} color="#99f6e4" />
      <group position={[-2.2, 0, -2.5]} rotation={[0, 0.35, 0]}><Whiteboard /></group>
    </group>
  )
}
