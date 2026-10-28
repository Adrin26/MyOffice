/** Office floor plan. Desks are arranged in rows of 6 (two clusters of 3)
 * facing the camera; the office grows backwards-to-front as rows are added. */

import type { Agent } from '../types/api'

export const DESKS_PER_ROW = 6
export const MIN_ROWS = 2
export const FIRST_ROW_Z = -1.2
export const ROW_SPACING = 3.8
export const BACK_WALL_Z = -8.2
export const OFFICE_HALF_WIDTH = 11
export const WALL_HEIGHT = 6.6
export const SCREEN = { width: 9, height: 5.0625, y: 3.7, z: BACK_WALL_Z + 0.25 }

const COLUMN_X = [-8, -5.3, -2.6, 2.6, 5.3, 8]

export interface Placement {
  index: number
  position: [number, number, number]
}

export function workstationPosition(index: number): Placement {
  const row = Math.floor(index / DESKS_PER_ROW)
  const col = index % DESKS_PER_ROW
  return { index, position: [COLUMN_X[col], 0, FIRST_ROW_Z + row * ROW_SPACING] }
}

export function rowCount(usedIndices: number[]): number {
  const maxIndex = usedIndices.length ? Math.max(...usedIndices) : -1
  return Math.max(MIN_ROWS, Math.floor(maxIndex / DESKS_PER_ROW) + 1, Math.ceil((usedIndices.length + 1) / DESKS_PER_ROW))
}

/** Assign each agent a desk index (backend-assigned, or the next free one as a fallback). */
export function allocateDesks(agents: Agent[]): Map<number, Agent> {
  const desks = new Map<number, Agent>()
  const pending: Agent[] = []
  for (const a of agents) {
    if (a.workstation !== null && !desks.has(a.workstation)) desks.set(a.workstation, a)
    else pending.push(a)
  }
  let i = 0
  for (const a of pending) {
    while (desks.has(i)) i++
    desks.set(i, a)
  }
  return desks
}

export function officeDepth(rows: number): { front: number; back: number; centerZ: number } {
  const front = FIRST_ROW_Z + (rows - 1) * ROW_SPACING + 4.2
  return { front, back: BACK_WALL_Z, centerZ: (front + BACK_WALL_Z) / 2 }
}
