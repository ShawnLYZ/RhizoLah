// The Growth Simulation's curves: measured Rhizophora apiculata figures from one plantation (K3, Hassan et al. 2018).
// Pure functions of the Growth Year with no hidden state, in the spirit of the Sensor Engine.

export const GROWTH_YEARS = 15

/** K3 p. 7839: mean height (m) by age. */
const HEIGHT: readonly [number, number][] = [[0, 0], [1, 0.51], [2, 1.27], [3, 1.83], [5, 3.78], [10, 7.93], [15, 11.5]]
/**
 * K3 pp. 7838 to 7839: stem diameter (cm) from Year 3. Before Year 3 the source gives none; the line runs to 0 at
 * Year 0 only so the stage rule has a value (every plant is shorter than 1.3 m or a Sapling there either way).
 */
const STEM: readonly [number, number][] = [[0, 0], [3, 1.16], [5, 2.23], [10, 4.36], [15, 6.54]]
/** K3 p. 7838: share of the 25,000 planted per hectare still standing. One straight line from Year 2 to Year 15. */
const SURVIVAL: readonly [number, number][] = [[0, 1], [1, 0.944], [2, 0.844], [15, 0.348]]

/** The tree definition used in K4 and K2: at least 1.3 m tall with a stem of at least 2.5 cm. */
export const TREE_MIN_HEIGHT_M = 1.3
export const TREE_MIN_STEM_CM = 2.5

export type GrowthStage = 'Seed' | 'Seedling' | 'Sapling' | 'Tree'

function lerpTable(t: readonly [number, number][], year: number): number {
  const y = Math.max(t[0][0], Math.min(t[t.length - 1][0], year))
  for (let i = 1; i < t.length; i++) {
    const [x0, v0] = t[i - 1], [x1, v1] = t[i]
    if (y <= x1) return v0 + ((y - x0) / (x1 - x0)) * (v1 - v0)
  }
  return t[t.length - 1][1]
}

export const heightAt = (year: number) => lerpTable(HEIGHT, year)
export const stemAt = (year: number) => lerpTable(STEM, year)
/**
 * The share still standing. `mud` is the Mud Check's survival factor (1 = the measured plantation). Below 1 the
 * losses come faster, but Year 0 always starts with every plant: share ^ (1 / mud). The factor is a demo assumption,
 * not a figure from K3.
 */
export const survivalAt = (year: number, mud = 1) => Math.pow(lerpTable(SURVIVAL, year), 1 / Math.max(0.1, mud))

export function stageAt(year: number): GrowthStage {
  if (year <= 0) return 'Seed'
  const h = heightAt(year)
  if (h < TREE_MIN_HEIGHT_M) return 'Seedling'
  return stemAt(year) < TREE_MIN_STEM_CM ? 'Sapling' : 'Tree'
}

const oneDp = (v: number) => v.toLocaleString('en-MY', { maximumFractionDigits: 1 })

/** "Year 3 · Sapling · about 1.8 m tall"; "Year 0 · Seed" at Year 0. */
export function growthCaption(year: number): string {
  const y = Math.round(year * 10) / 10
  const stage = stageAt(y)
  if (stage === 'Seed') return 'Year 0 · Seed'
  return `Year ${oneDp(y)} · ${stage} · about ${heightAt(y).toLocaleString('en-MY', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m tall`
}
