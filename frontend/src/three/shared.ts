import * as THREE from 'three'

/** One unit cube reused by every block in the scene; sizes come from mesh scale. */
export const BOX = new THREE.BoxGeometry(1, 1, 1)
export const CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 20)
export const SPHERE = new THREE.SphereGeometry(0.5, 16, 12)

const cache = new Map<string, THREE.MeshStandardMaterial>()

/** Cached standard material per colour/variant. Shared, so never mutate it. */
export function mat(
  color: string,
  opts: { roughness?: number; metalness?: number; emissive?: string; emissiveIntensity?: number; transparent?: boolean; opacity?: number } = {},
): THREE.MeshStandardMaterial {
  const key = `${color}|${JSON.stringify(opts)}`
  let m = cache.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness ?? 0.65,
      metalness: opts.metalness ?? 0.02,
      emissive: opts.emissive ?? '#000000',
      emissiveIntensity: opts.emissiveIntensity ?? 0,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
    })
    cache.set(key, m)
  }
  return m
}

/**
 * Mount target for every drei <Html> in the office. Without a fixed target drei switches
 * from the canvas parent to the event wrapper after mount and recreates its React root,
 * which can leave the overlay empty.
 */
export const htmlPortal: { current: HTMLElement } = { current: null as unknown as HTMLElement }

export function hashSeed(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return ((h >>> 0) % 1000) / 1000
}
