import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { BACK_WALL_Z, OFFICE_HALF_WIDTH, WALL_HEIGHT } from '../lib/layout'
import { Block } from './Block'
import { CoffeeStation, Plant, Sofa } from './Furniture'

function useCheckerTexture(repeatX: number, repeatZ: number) {
  const texture = useMemo(() => {
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#e7dccb'
    ctx.fillRect(0, 0, size, size)
    ctx.fillStyle = '#d9cbb5'
    ctx.fillRect(0, 0, size / 2, size / 2)
    ctx.fillRect(size / 2, size / 2, size / 2, size / 2)
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'
    ctx.lineWidth = 2
    ctx.strokeRect(0, 0, size, size)
    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.colorSpace = THREE.SRGBColorSpace
    tex.magFilter = THREE.NearestFilter
    return tex
  }, [])
  useEffect(() => {
    texture.repeat.set(repeatX, repeatZ)
    texture.needsUpdate = true
  }, [texture, repeatX, repeatZ])
  useEffect(() => () => texture.dispose(), [texture])
  return texture
}

function WindowPanel({ position, rotationY = 0, width = 3 }: { position: [number, number, number]; rotationY?: number; width?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <Block size={[width + 0.25, 2.45, 0.08]} color="#f8fafc" />
      <Block size={[width, 2.2, 0.1]} color="#93c5fd" emissive="#bfdbfe" emissiveIntensity={0.55} roughness={0.1} metalness={0.1} />
      <Block size={[0.08, 2.2, 0.12]} color="#f8fafc" />
      <Block size={[width, 0.08, 0.12]} color="#f8fafc" />
    </group>
  )
}

export function OfficeEnvironment({ front, shadows }: { front: number; shadows: boolean }) {
  const depth = front - BACK_WALL_Z
  const centerZ = (front + BACK_WALL_Z) / 2
  const width = OFFICE_HALF_WIDTH * 2
  const floorTex = useCheckerTexture(width / 2, depth / 2)
  const sideWindows = useMemo(() => {
    const zs: number[] = []
    for (let z = BACK_WALL_Z + 3; z < front - 2; z += 4.5) zs.push(z)
    return zs
  }, [front])

  return (
    <group>
      {/* Lighting: hemisphere fill + one shadow-casting sun */}
      <hemisphereLight args={['#e0f2fe', '#fde68a', 0.9]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[9, 18, 12]}
        intensity={1.6}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-camera-near={1}
        shadow-camera-far={60}
        shadow-bias={-0.0005}
      />
      <pointLight position={[0, 5.5, BACK_WALL_Z + 4]} intensity={12} distance={14} color="#fef3c7" />

      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, centerZ]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial map={floorTex} roughness={0.85} />
      </mesh>
      {/* Base slab and trim */}
      <Block size={[width + 0.6, 0.3, depth + 0.6]} position={[0, -0.16, centerZ]} color="#64748b" />

      {/* Back wall */}
      <Block size={[width, WALL_HEIGHT, 0.3]} position={[0, WALL_HEIGHT / 2, BACK_WALL_Z - 0.15]} color="#f1f5f9" shadow />
      <Block size={[width, 0.4, 0.34]} position={[0, 0.2, BACK_WALL_Z - 0.1]} color="#94a3b8" />
      <Block size={[width, 0.25, 0.4]} position={[0, WALL_HEIGHT, BACK_WALL_Z - 0.1]} color="#cbd5e1" />
      <WindowPanel position={[-8.3, 3.4, BACK_WALL_Z + 0.02]} width={2.6} />
      <WindowPanel position={[8.3, 3.4, BACK_WALL_Z + 0.02]} width={2.6} />

      {/* Side walls (half height so the camera can see in) */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <Block size={[0.3, WALL_HEIGHT * 0.75, depth]} position={[side * (OFFICE_HALF_WIDTH + 0.15), (WALL_HEIGHT * 0.75) / 2, centerZ]} color="#e2e8f0" shadow />
          <Block size={[0.34, 0.4, depth]} position={[side * (OFFICE_HALF_WIDTH + 0.1), 0.2, centerZ]} color="#94a3b8" />
          {sideWindows.map((z) => (
            <WindowPanel key={z} position={[side * (OFFICE_HALF_WIDTH - 0.02), 2.7, z]} rotationY={Math.PI / 2} width={2.8} />
          ))}
        </group>
      ))}

      {/* Decor */}
      <group position={[-OFFICE_HALF_WIDTH + 0.8, 0, BACK_WALL_Z + 0.8]}><Plant scale={1.3} /></group>
      <group position={[OFFICE_HALF_WIDTH - 0.8, 0, BACK_WALL_Z + 0.8]}><Plant scale={1.3} /></group>
      <group position={[-OFFICE_HALF_WIDTH + 0.8, 0, front - 1]}><Plant /></group>
      <group position={[OFFICE_HALF_WIDTH - 0.8, 0, front - 1]}><Plant /></group>
      <group position={[0, 0, front - 1]}><Plant scale={0.8} /></group>
      <group position={[7.6, 0, BACK_WALL_Z + 3.4]} rotation={[0, -Math.PI / 2, 0]}><Sofa /></group>
      <group position={[OFFICE_HALF_WIDTH - 0.6, 0, BACK_WALL_Z + 5.6]} rotation={[0, -Math.PI / 2, 0]}><CoffeeStation /></group>
      <Block size={[1.2, 0.35, 0.8]} position={[6.2, 0.18, BACK_WALL_Z + 3.4]} color="#a16207" shadow />
    </group>
  )
}
