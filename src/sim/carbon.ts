// Estimated CO2 reduced: the carbon dioxide the planted trees take out of the air as they grow, for the Growth
// Simulation. Above-ground wood and leaves only (roots and mud carbon are left out), so it is an underestimate.
//
// Per tree: K4 measured about 216 t/ha of above-ground biomass in 15-year-old Matang Rhizophora apiculata stands
// at 4,331 stems/ha, about 50 kg a tree. Earlier years scale that by stem diameter² × height from the K3 curves
// (growth.ts), a common allometric shape; that scaling, the 0.47 carbon share of dry wood and the 44/12 carbon to
// CO2 factor are standard conversions with no Knowledgebase source. Trees standing come from the seedlings planted
// (planting.ts) and K3's survival, adjusted by each area's Mud Check like the 3D trees.

import { heightAt, stemAt, survivalAt, GROWTH_YEARS } from './growth'

/** K4: above-ground biomass (kg) of one 15-year-old tree: 216 t/ha ÷ 4,331 stems/ha. */
const TREE_AGB_KG_Y15 = (216 * 1000) / 4331
const CARBON_SHARE = 0.47
const CO2_PER_C = 44 / 12

const size = (year: number) => stemAt(year) ** 2 * heightAt(year)

/** Above-ground dry biomass (kg) of one tree at this Growth Year. */
export const treeBiomassKg = (year: number) => TREE_AGB_KG_Y15 * (size(year) / size(GROWTH_YEARS))

export interface CarbonArea {
  seedlings: number
  /** The Mud Check's survival factor (1 = the measured plantation). */
  mud: number
}

export interface CarbonEstimate {
  /** Tonnes of CO2 taken up so far. */
  co2T: number
  /** Trees still standing across the areas. */
  standing: number
}

export function co2At(year: number, areas: readonly CarbonArea[]): CarbonEstimate {
  let standing = 0
  for (const a of areas) standing += a.seedlings * survivalAt(year, a.mud)
  const co2T = (standing * treeBiomassKg(year) * CARBON_SHARE * CO2_PER_C) / 1000
  return { co2T, standing: Math.round(standing) }
}

/** "0.4 t", "12.3 t", "197 t". */
export function formatTonnes(t: number): string {
  const dp = t < 100 ? 1 : 0
  return `${t.toLocaleString('en-MY', { minimumFractionDigits: dp, maximumFractionDigits: dp })} t`
}
