// The Species Suggestion: plain rules from the Knowledgebase's Built-in Sources (no AI).
// Pure functions with plain inputs, so they can be unit-tested the day a test runner is added.

import { N, WATER } from '../forest/model'
import { pointInRing } from '../geo/geo'
import { formatReading, roundTo, type Reading } from './ranges'
import type { SourceId } from '../knowledge/sources'

export type Species = 'Avicennia marina' | 'Sonneratia alba' | 'Rhizophora mucronata' | 'Rhizophora apiculata' | 'Bruguiera gymnorhiza'

export const SPECIES_LIST: readonly Species[] = ['Avicennia marina', 'Sonneratia alba', 'Rhizophora mucronata', 'Rhizophora apiculata', 'Bruguiera gymnorhiza']

/** Which row of K1's salinity table applied. */
export type RuleBranch = 'saline' | 'creek' | 'central'

export interface SpeciesSuggestion {
  species: Species
  alternative: Species
  branch: RuleBranch
  nearWater: boolean
}

export const NEAR_WATER_M = 10

/**
 * K1 p. 26 (salinity) and p. 3 (zones). Salinity is judged as displayed (one decimal place), so the number on
 * screen and the species always agree. Exactly 25.0 is in the 15 to 25 row. Below 15 PSU is outside the table and
 * falls back to the 15 to 25 rows (implementation choice).
 */
export function suggestSpecies(salinity: number, nearWater: boolean): SpeciesSuggestion {
  const s = roundTo(salinity, 1)
  if (s > 25) return { species: 'Avicennia marina', alternative: 'Sonneratia alba', branch: 'saline', nearWater }
  if (nearWater) return { species: 'Rhizophora mucronata', alternative: 'Rhizophora apiculata', branch: 'creek', nearWater }
  return { species: 'Rhizophora apiculata', alternative: 'Bruguiera gymnorhiza', branch: 'central', nearWater }
}

function distToSegment2(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az
  const l2 = dx * dx + dz * dz
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0
  const ex = ax + t * dx - px, ez = az + t * dz - pz
  return ex * ex + ez * ez
}

/**
 * Whether any water pixel of the Canopy Map (1 m per pixel) lies within `metres` of the area's outline
 * (or inside it). A Site with no water is never near water.
 */
export function isNearWater(ring: readonly number[], classes: Uint8Array, metres = NEAR_WATER_M): boolean {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (let i = 0; i < ring.length; i += 2) {
    minX = Math.min(minX, ring[i]); maxX = Math.max(maxX, ring[i])
    minZ = Math.min(minZ, ring[i + 1]); maxZ = Math.max(maxZ, ring[i + 1])
  }
  const i0 = Math.max(0, Math.floor(minX - metres + 250)), i1 = Math.min(N - 1, Math.ceil(maxX + metres + 250))
  const j0 = Math.max(0, Math.floor(minZ - metres + 250)), j1 = Math.min(N - 1, Math.ceil(maxZ + metres + 250))
  const m2 = metres * metres
  const n = ring.length / 2
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      if (classes[j * N + i] !== WATER) continue
      const x = i + 0.5 - 250, z = j + 0.5 - 250
      if (pointInRing(ring, x, z)) return true
      for (let a = 0, b = n - 1; a < n; b = a++) {
        if (distToSegment2(x, z, ring[b * 2], ring[b * 2 + 1], ring[a * 2], ring[a * 2 + 1]) <= m2) return true
      }
    }
  }
  return false
}

export interface SuggestionReason {
  text: string
  sources: SourceId[]
}

/** Two or three short reasons that quote the frozen Readings. Never claims the forest was surveyed. */
export function suggestionReasons(s: SpeciesSuggestion, values: Reading): SuggestionReason[] {
  const sal = roundTo(values.salinity, 1)
  const salText = `${formatReading('salinity', values.salinity)} PSU`
  const out: SuggestionReason[] = []
  if (s.branch === 'saline') {
    out.push({ text: `Salinity was ${salText}. Above 25, the manual lists Avicennia marina and Sonneratia alba.`, sources: ['K1'] })
  } else if (sal < 15) {
    out.push({ text: `Salinity was ${salText}, below the 15 to 25 range the manual lists for Rhizophora and Bruguiera.`, sources: ['K1'] })
  } else {
    out.push({ text: `Salinity was ${salText}, inside the 15 to 25 range the manual lists for Rhizophora and Bruguiera.`, sources: ['K1'] })
  }
  if (s.branch === 'creek') {
    out.push({ text: 'The area is within about 10 m of water. The manual places Rhizophora mucronata on creek banks.', sources: ['K1'] })
  } else if (s.branch === 'central') {
    out.push({ text: 'The area is more than 10 m from water. The manual places Rhizophora apiculata and Bruguiera in the central zone.', sources: ['K1'] })
  }
  out.push({ text: `Mud pH was ${formatReading('mud_ph', values.mud_ph)}. Most mangrove soils are between 6 and 7, and some are as low as 5.`, sources: ['K2'] })
  return out
}
