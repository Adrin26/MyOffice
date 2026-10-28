import type { ThreeElements } from '@react-three/fiber'
import { BOX, mat } from './shared'

type MeshProps = ThreeElements['mesh']

interface BlockProps extends Omit<MeshProps, 'args'> {
  size: [number, number, number]
  color: string
  emissive?: string
  emissiveIntensity?: number
  roughness?: number
  metalness?: number
  shadow?: boolean
}

/** A box built from the shared unit geometry and a cached material. */
export function Block({ size, color, emissive, emissiveIntensity, roughness, metalness, shadow = false, ...rest }: BlockProps) {
  return (
    <mesh
      geometry={BOX}
      material={mat(color, { emissive, emissiveIntensity, roughness, metalness })}
      scale={size}
      castShadow={shadow}
      receiveShadow={shadow}
      {...rest}
    />
  )
}
