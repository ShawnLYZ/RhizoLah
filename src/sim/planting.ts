// The Planting Plan of a Replant Area: how far apart to plant the suggested species and how many seedlings fit.
// Rule-based (no AI). Pure functions with plain inputs.
//
// Spacing: Rhizophora apiculata 1.2 m and Rhizophora mucronata 1.8 m are Matang's replanting spacings (K4). The other
// three species have no spacing in the Knowledgebase: their values are demo guide values, so they carry no citation.

import type { SourceId } from '../knowledge/sources'
import type { Species } from './species'

export interface SpacingRule {
  /** Distance between neighbouring seedlings, in metres, on a square grid. */
  metres: number
  /** The Knowledgebase source, or null for a demo guide value. */
  source: SourceId | null
}

export const SPACING: Record<Species, SpacingRule> = {
  'Rhizophora apiculata': { metres: 1.2, source: 'K4' },
  'Rhizophora mucronata': { metres: 1.8, source: 'K4' },
  'Avicennia marina': { metres: 1.0, source: null },
  'Sonneratia alba': { metres: 1.5, source: null },
  'Bruguiera gymnorhiza': { metres: 1.5, source: null },
}

export interface PlantingPlan {
  spacingM: number
  source: SourceId | null
  /** Seedlings on a square grid at that spacing over the empty area. */
  seedlings: number
  areaM2: number
}

/** One seedling per spacing × spacing square of the empty area, rounded down. */
export function plantingPlan(species: Species, areaM2: number): PlantingPlan {
  const { metres, source } = SPACING[species]
  return { spacingM: metres, source, seedlings: Math.floor(areaM2 / (metres * metres)), areaM2 }
}

/** One photo per species in public/species-photos (credits also in its SOURCES.md). */
export const SPECIES_PHOTO: Record<Species, { src: string; credit: string }> = {
  'Avicennia marina': { src: '/species-photos/avicennia-marina.jpg', credit: 'Vengolis · CC BY-SA 4.0 · Wikimedia Commons' },
  'Sonneratia alba': { src: '/species-photos/sonneratia-alba.jpg', credit: 'Vengolis · CC BY-SA 4.0 · Wikimedia Commons' },
  'Rhizophora mucronata': { src: '/species-photos/rhizophora-mucronata.jpg', credit: 'Bernard DUPONT · CC BY-SA 2.0 · Wikimedia Commons' },
  'Rhizophora apiculata': { src: '/species-photos/rhizophora-apiculata.jpg', credit: 'Dinesh Valke · CC BY-SA 2.0 · Wikimedia Commons' },
  'Bruguiera gymnorhiza': { src: '/species-photos/bruguiera-gymnorhiza.jpg', credit: 'Dinesh Valke · CC BY-SA 2.0 · Wikimedia Commons' },
}

// The Planting Cost: what it would take to finish planting the whole Replant Area, in Malaysian ringgit.
// Every price here is a demo estimate with no Knowledgebase source and no supplier quote, so the card says so and
// carries no citation. Change the numbers below to match real quotes.

/** Price of one seedling or propagule, RM. Rhizophora and Bruguiera are planted as propagules; the others nursery-raised. */
export const SEEDLING_PRICE_RM: Record<Species, number> = {
  'Rhizophora apiculata': 1.5,
  'Rhizophora mucronata': 1.5,
  'Bruguiera gymnorhiza': 2.0,
  'Avicennia marina': 3.0,
  'Sonneratia alba': 3.0,
}

/** Per-seedling prices, RM (demo estimates). */
export const COST_PER_SEEDLING_RM = {
  stake: 0.4,        // bamboo stake and tie, so tides do not topple it
  labour: 0.8,       // digging and planting by the field team
  transport: 0.2,    // boat and carrying to the planting site
  soilFill: 0.5,     // a scoop of the right soil per hole, only when the soil found is not a good fit
  mudCheckFix: 0.3,  // a scoop of mud from a healthy stand, only when the mud check found something to fix
} as const

/** Share of seedlings replanted in the first year to replace those lost (demo assumption). */
export const REPLACE_SHARE = 0.1
/** Fixed costs for the whole area, RM (demo estimates). */
export const FIXED_COST_RM = { sitePrep: 300, monitoring: 600 } as const

export interface CostLine {
  label: string
  /** How the line was worked out, for example "6,593 × RM 3.00". */
  detail: string
  rm: number
}

export interface PlantingCost {
  lines: CostLine[]
  totalRM: number
}

export const formatRM = (rm: number) =>
  `RM ${rm.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const unit = (rm: number) => `RM ${rm.toFixed(2)}`

/** Every cost to finish planting the area. `poorSoil` and `mudIssues` add the extra steps the card's advice asks for. */
export function plantingCost(species: Species, seedlings: number, opts: { poorSoil: boolean; mudIssues: boolean }): PlantingCost {
  const n = seedlings
  const count = n.toLocaleString('en-MY')
  const c = COST_PER_SEEDLING_RM
  const price = SEEDLING_PRICE_RM[species]
  const lines: CostLine[] = [
    { label: 'Seedlings', detail: `${count} × ${unit(price)}`, rm: n * price },
    { label: 'Stakes and ties', detail: `${count} × ${unit(c.stake)}`, rm: n * c.stake },
    { label: 'Planting labour', detail: `${count} × ${unit(c.labour)}`, rm: n * c.labour },
    { label: 'Transport by boat', detail: `${count} × ${unit(c.transport)}`, rm: n * c.transport },
  ]
  if (opts.poorSoil) lines.push({ label: 'Soil for each hole', detail: `${count} × ${unit(c.soilFill)}`, rm: n * c.soilFill })
  if (opts.mudIssues) lines.push({ label: 'Mud from a healthy stand', detail: `${count} × ${unit(c.mudCheckFix)}`, rm: n * c.mudCheckFix })
  const perPlant = price + c.stake + c.labour + c.transport
  const replace = Math.ceil(n * REPLACE_SHARE)
  lines.push({ label: 'Replacing first-year losses', detail: `${replace.toLocaleString('en-MY')} × ${unit(perPlant)} (${REPLACE_SHARE * 100}%)`, rm: replace * perPlant })
  lines.push({ label: 'Site preparation', detail: 'clearing debris, marking rows', rm: FIXED_COST_RM.sitePrep })
  lines.push({ label: 'First-year monitoring', detail: 'survival counts', rm: FIXED_COST_RM.monitoring })
  return { lines, totalRM: lines.reduce((t, l) => t + l.rm, 0) }
}
