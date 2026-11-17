// The Field Model (PRD decision 9): a value for every Sensor at any point, computed analytically.
// It takes the Current Site's station (live post) position and posts as parameters.

import type { SensorPost } from '../site/catalogue'
import { fbm2 } from './noise'
import { SENSORS, type Reading } from './ranges'

const OFFSET_SCALE = 60
const INFLUENCE_M = 120

// One seed per Sensor, in SENSORS order.
const SEEDS = [202, 303, 505, 808, 101, 909, 404, 606, 707, 1010]

export interface StationPoint {
  x: number
  z: number
}

// The spatial noise at the station, remembered for the last station asked about.
let noiseAt: StationPoint | null = null
let stationNoise: number[] = []

/**
 * Sensor values at local point (x, z), for the station (live post) standing at `at`.
 * value = healthy base (station healthy Reading plus a smooth spatial offset that is zero at the station)
 *       + w(p) x (station Reading - station healthy Reading), with w = exp(-(d / 120 m)^2).
 */
export function sensorsAt(x: number, z: number, at: StationPoint, station: Reading, stationHealthy: Reading, out?: Reading): Reading {
  if (!noiseAt || noiseAt.x !== at.x || noiseAt.z !== at.z) {
    noiseAt = { x: at.x, z: at.z }
    stationNoise = SENSORS.map((_, i) => fbm2(at.x / OFFSET_SCALE, at.z / OFFSET_SCALE, SEEDS[i], 2))
  }
  const r = (out ?? {}) as Reading
  const dx = x - at.x
  const dz = z - at.z
  const d2 = dx * dx + dz * dz
  const w = Math.exp(-d2 / (INFLUENCE_M * INFLUENCE_M))
  const fade = 1 - Math.exp(-d2 / (40 * 40))
  for (let i = 0; i < SENSORS.length; i++) {
    const s = SENSORS[i]
    const n = fbm2(x / OFFSET_SCALE, z / OFFSET_SCALE, SEEDS[i], 2) - stationNoise[i] * (1 - fade)
    const offset = s.offsetAmp * Math.max(-1, Math.min(1, n * 1.25)) * fade
    r[s.id] = stationHealthy[s.id] + offset + w * (station[s.id] - stationHealthy[s.id])
  }
  return r
}

/** One Reading per sensor post, in the order given. At the station this is exactly the live Reading. */
export function postReadings(posts: readonly SensorPost[], at: StationPoint, station: Reading, stationHealthy: Reading): Reading[] {
  return posts.map((p) => sensorsAt(p.x, p.z, at, station, stationHealthy))
}
