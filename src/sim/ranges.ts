// Sensor Ranges, Bands and Level (PRD decision 8). Boundary values belong to the healthier Band.

export type Band = 'healthy' | 'warning' | 'danger'

export type SensorId =
  | 'salinity'
  | 'turbidity'
  | 'water_temp'
  | 'wave_height'
  | 'water_level'
  | 'wave_velocity'
  | 'mud_ph'
  | 'mud_ec'
  | 'mud_temp'
  | 'mud_redox'

export interface SensorSpec {
  id: SensorId
  name: string
  short: string
  hint: string
  unit: string
  decimals: number
  preset: number
  wobble: number
  /**
   * Where Simulate danger takes this Sensor and the band its wobble stays in; null when it does not change. The
   * scenario is Factory Pollution: oily, acidic, hot waste water reaching the station from upstream, so the water
   * clouds and warms, the mud turns acidic, salty with dissolved chemicals and airless. Tides and salinity stay normal.
   */
  danger: { target: number; min: number; max: number } | null
  offsetAmp: number
  group: 'water' | 'wave' | 'mud'
  /** Stress anchors: value at stress 0 (ideal), 1 (healthy edge), 2 (danger edge) and 3, per side. */
  stress: { ideal: number; low?: [number, number, number]; high?: [number, number, number] }
}

// The ten parameters of the Mangrove Focus kit, in the order of mangrove-sensor-3d.html.
export const SENSORS: readonly SensorSpec[] = [
  {
    id: 'salinity', name: 'Salinity', short: 'Salinity', group: 'water',
    hint: 'How salty the water is', unit: 'PSU', decimals: 1,
    preset: 28, wobble: 1.0, danger: null, offsetAmp: 4,
    stress: { ideal: 28, high: [35, 45, 55] },
  },
  {
    id: 'turbidity', name: 'Turbidity', short: 'Turbidity', group: 'water',
    hint: 'How muddy or cloudy the water is', unit: 'NTU', decimals: 0,
    preset: 18, wobble: 3, danger: { target: 160, min: 150, max: 170 }, offsetAmp: 3,
    stress: { ideal: 18, high: [25, 100, 180] },
  },
  {
    id: 'water_temp', name: 'Water temperature', short: 'Water temp', group: 'water',
    hint: 'How warm the water is around the roots', unit: '°C', decimals: 1,
    preset: 29.3, wobble: 0.5, danger: { target: 37.5, min: 37, max: 38 }, offsetAmp: 0.8,
    stress: { ideal: 29.3, low: [20, 15, 10], high: [32, 36, 40] },
  },
  {
    id: 'wave_height', name: 'Wave height', short: 'Wave height', group: 'wave',
    hint: 'How high the waves reach the roots', unit: 'm', decimals: 2,
    preset: 0.3, wobble: 0.06, danger: null, offsetAmp: 0.08,
    stress: { ideal: 0.3, high: [0.5, 1.0, 1.6] },
  },
  {
    id: 'water_level', name: 'Water level', short: 'Water level', group: 'wave',
    hint: 'How deep the tide is over the forest floor', unit: 'm', decimals: 2,
    preset: 0.95, wobble: 0.12, danger: null, offsetAmp: 0.1,
    stress: { ideal: 0.95, high: [1.8, 2.2, 2.8] },
  },
  {
    id: 'wave_velocity', name: 'Wave velocity', short: 'Wave velocity', group: 'wave',
    hint: 'How fast the water hits the roots', unit: 'm/s', decimals: 2,
    preset: 0.25, wobble: 0.05, danger: null, offsetAmp: 0.08,
    stress: { ideal: 0.25, high: [0.5, 1.0, 1.6] },
  },
  {
    id: 'mud_ph', name: 'Mud pH', short: 'Mud pH', group: 'mud',
    hint: 'How acidic the mud is at the roots', unit: '', decimals: 1,
    preset: 6.9, wobble: 0.1, danger: { target: 4.4, min: 4.2, max: 4.6 }, offsetAmp: 0.3,
    stress: { ideal: 6.9, low: [6.0, 5.0, 4.0], high: [8.0, 9.0, 10.0] },
  },
  {
    id: 'mud_ec', name: 'Mud EC', short: 'Mud EC', group: 'mud',
    hint: 'How much salt the mud holds around the roots', unit: 'mS/cm', decimals: 1,
    preset: 32, wobble: 1.5, danger: { target: 62, min: 59, max: 65 }, offsetAmp: 4,
    stress: { ideal: 32, high: [45, 55, 65] },
  },
  {
    id: 'mud_temp', name: 'Mud temperature', short: 'Mud temp', group: 'mud',
    hint: 'How warm the mud is at root depth', unit: '°C', decimals: 1,
    preset: 28.1, wobble: 0.3, danger: { target: 33.5, min: 33, max: 34 }, offsetAmp: 0.6,
    stress: { ideal: 28.1, low: [20, 15, 10], high: [32, 36, 40] },
  },
  // Mud redox (Eh) is the microbe proxy: it shows which microbes the mud can support. Above about -100 mV the
  // helpful ones (iron reducers, nitrogen fixers) do the work; below it sulfate reducers make sulfide that poisons
  // roots, and below about -200 mV methane makers take over. Guide values; only the low side is judged.
  {
    id: 'mud_redox', name: 'Mud redox', short: 'Mud redox', group: 'mud',
    hint: 'Oxygen in the mud for roots and helpful microbes', unit: 'mV', decimals: 0,
    preset: 60, wobble: 18, danger: { target: -240, min: -270, max: -210 }, offsetAmp: 90,
    stress: { ideal: 60, low: [-100, -200, -300] },
  },
]

export const SENSOR_BY_ID = Object.fromEntries(SENSORS.map((s) => [s.id, s])) as Record<SensorId, SensorSpec>
export const SENSOR_IDS = SENSORS.map((s) => s.id)

export type Reading = Record<SensorId, number>

export function roundTo(v: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round(v * f) / f
}

/** The Band of one value, judged on the value as displayed so the number and the chip always agree. */
export function bandOf(id: SensorId, raw: number): Band {
  const v = roundTo(raw, SENSOR_BY_ID[id].decimals)
  switch (id) {
    case 'salinity':
      return v <= 35 ? 'healthy' : v <= 45 ? 'warning' : 'danger'
    case 'turbidity':
      return v <= 25 ? 'healthy' : v <= 100 ? 'warning' : 'danger'
    case 'water_temp':
    case 'mud_temp':
      return v >= 20 && v <= 32 ? 'healthy' : v >= 15 && v <= 36 ? 'warning' : 'danger'
    case 'wave_height':
      return v <= 0.5 ? 'healthy' : v <= 1.0 ? 'warning' : 'danger'
    case 'water_level':
      return v <= 1.8 ? 'healthy' : v <= 2.2 ? 'warning' : 'danger'
    case 'wave_velocity':
      return v <= 0.5 ? 'healthy' : v <= 1.0 ? 'warning' : 'danger'
    case 'mud_ph':
      return v >= 6 && v <= 8 ? 'healthy' : v >= 5 && v <= 9 ? 'warning' : 'danger'
    case 'mud_ec':
      return v <= 45 ? 'healthy' : v <= 55 ? 'warning' : 'danger'
    case 'mud_redox':
      return v >= -100 ? 'healthy' : v >= -200 ? 'warning' : 'danger'
  }
}

const RANK: Record<Band, number> = { healthy: 0, warning: 1, danger: 2 }

/** The Level is the Floor: the worst Band across the ten Sensors. */
export function levelOf(r: Reading): Band {
  let worst: Band = 'healthy'
  for (const id of SENSOR_IDS) {
    const b = bandOf(id, r[id])
    if (RANK[b] > RANK[worst]) worst = b
  }
  return worst
}

export function sensorsIn(r: Reading, band: Band): SensorId[] {
  return SENSOR_IDS.filter((id) => bandOf(id, r[id]) === band)
}

/** Continuous stress: 0 ideal, 1 at the healthy edge, 2 at the danger edge, up to 3. */
export function stressOf(id: SensorId, v: number): number {
  const s = SENSOR_BY_ID[id].stress
  const side = (a: [number, number, number]) => {
    const pts = [s.ideal, a[0], a[1], a[2]]
    const dir = Math.sign(a[0] - s.ideal)
    const d = (v - s.ideal) * dir
    if (d <= 0) return 0
    for (let i = 0; i < 3; i++) {
      const lo = (pts[i] - s.ideal) * dir
      const hi = (pts[i + 1] - s.ideal) * dir
      if (d <= hi) return i + (d - lo) / (hi - lo)
    }
    return 3
  }
  let out = 0
  if (s.low && v < s.ideal) out = side(s.low)
  if (s.high && v > s.ideal) out = side(s.high)
  return Math.min(3, out)
}

export function formatReading(id: SensorId, v: number): string {
  const spec = SENSOR_BY_ID[id]
  if (!Number.isFinite(v)) return '—'
  return roundTo(v, spec.decimals).toLocaleString('en-MY', {
    minimumFractionDigits: spec.decimals,
    maximumFractionDigits: spec.decimals,
  })
}

export function listSensors(ids: SensorId[]): string {
  const names = ids.map((id, i) => (i === 0 ? SENSOR_BY_ID[id].name : lowerName(id)))
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** The name mid-sentence: only the first letter is lowered, so "Mud pH" reads "mud pH". */
export function lowerName(id: SensorId): string {
  const n = SENSOR_BY_ID[id].name
  return n[0].toLowerCase() + n.slice(1)
}
