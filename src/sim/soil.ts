// The Mud Check: the soil facts of one spot that no live Sensor gives, and what they mean for the microbes that help
// seedlings grow. On a real site the flooding and bed figures are worked out from the wave gauge's log, and the soil
// type, organic matter and DNA result come from a mud sample sent to a lab. In this demo they are simulated: a fixed
// function of the position (like the Field Model), so the same spot always gives the same answer.
// The limits and the survival factor are guide values chosen for the demo, not figures from a Knowledgebase source.
// Pure functions with plain inputs, so they can be unit-tested the day a test runner is added.

import { fbm2 } from './noise'
import { bandOf, formatReading, type Band } from './ranges'
import type { Species } from './species'

export type SoilTexture = 'Sandy mud' | 'Silty mud' | 'Clay mud'

export const SOIL_TEXTURES: readonly SoilTexture[] = ['Sandy mud', 'Silty mud', 'Clay mud']

export interface SoilSurvey {
  /** Hours a day the spot is under water. */
  floodHours: number
  /** Bed level change in cm a year: above zero the mud is building up, below zero it is washing away. */
  bedCmPerYear: number
  texture: SoilTexture
  /** Organic matter, percent of dry weight. */
  organicPct: number
  /** The lab DNA test: whether the microbes that help mangroves (nitrogen fixers, phosphate releasers) were found. */
  microbes: 'plenty' | 'few'
}

export const FLOOD_HEALTHY_MAX_H = 10
export const BED_HEALTHY_MAX_CM = 2
export const ORGANIC_HEALTHY_MIN_PCT = 5

const SCALE_M = 70

/** Smooth noise spread over 0 to 1. */
function unit(x: number, z: number, seed: number): number {
  return Math.max(0, Math.min(1, 0.5 + 0.8 * fbm2(x / SCALE_M, z / SCALE_M, seed, 2)))
}

const round1 = (v: number) => Math.round(v * 10) / 10

/** The simulated soil survey at local point (x, z). It never reaches the Danger Band: a scanned area stays plantable. */
export function soilSurveyAt(x: number, z: number): SoilSurvey {
  const floodHours = round1(4 + 9 * unit(x, z, 1201))
  const bedCmPerYear = round1((unit(x, z, 1302) - 0.5) * 8)
  const t = unit(x, z, 1403)
  const texture: SoilTexture = t < 0.3 ? 'Sandy mud' : t < 0.7 ? 'Silty mud' : 'Clay mud'
  // Sand holds less organic matter than fine mud.
  const organicPct = round1(Math.max(2, 2.5 + 7 * unit(x, z, 1504) - (texture === 'Sandy mud' ? 1.5 : 0)))
  // Helpful microbes need food (organic matter) and some oxygen (mud that is not flooded most of the day).
  // Sand gives them less surface and food than fine mud, so it needs more organic matter to carry them.
  const microbes = organicPct < (texture === 'Sandy mud' ? 7 : 4.5) || floodHours > 11 ? 'few' : 'plenty'
  return { floodHours, bedCmPerYear, texture, organicPct, microbes }
}

export type MudIssue = 'redox' | 'flood' | 'bed' | 'texture' | 'organic' | 'microbes'

export interface MudRow {
  id: MudIssue
  label: string
  value: string
  band: Band
  /** The finding as it reads inside a sentence. */
  phrase: string
}

const one = (v: number) => v.toLocaleString('en-MY', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** The Mud Check's rows, in reading order. Mud redox is the frozen or live Reading at the spot. */
export function mudRows(s: SoilSurvey, redox: number): MudRow[] {
  const bed = s.bedCmPerYear
  return [
    {
      id: 'redox', label: 'Mud redox', value: `${formatReading('mud_redox', redox)} mV`, band: bandOf('mud_redox', redox),
      phrase: `low mud redox (${formatReading('mud_redox', redox)} mV)`,
    },
    {
      id: 'flood', label: 'Flooded each day', value: `${one(s.floodHours)} h`,
      band: s.floodHours <= FLOOD_HEALTHY_MAX_H ? 'healthy' : 'warning',
      phrase: `mud under water ${one(s.floodHours)} hours a day`,
    },
    {
      id: 'bed', label: 'Mud level', value: `${bed > 0 ? '+' : ''}${one(bed)} cm/year`,
      band: Math.abs(bed) <= BED_HEALTHY_MAX_CM ? 'healthy' : 'warning',
      phrase: bed > 0 ? `mud building up ${one(bed)} cm a year` : `mud washing away ${one(-bed)} cm a year`,
    },
    { id: 'texture', label: 'Soil type', value: s.texture, band: s.texture === 'Sandy mud' ? 'warning' : 'healthy', phrase: 'sandy mud' },
    {
      id: 'organic', label: 'Organic matter', value: `${one(s.organicPct)} %`,
      band: s.organicPct >= ORGANIC_HEALTHY_MIN_PCT ? 'healthy' : 'warning',
      phrase: `little organic matter (${one(s.organicPct)} %)`,
    },
    {
      id: 'microbes', label: 'DNA test', value: s.microbes === 'plenty' ? 'Helpful microbes found' : 'Few helpful microbes',
      band: s.microbes === 'plenty' ? 'healthy' : 'warning',
      phrase: 'few helpful microbes in the lab DNA test',
    },
  ]
}

/** What to do about each finding, most useful first. */
const ADVICE: Record<MudIssue, string> = {
  microbes: 'Plant each seedling with a scoop of mud from a healthy stand of the same species, so its microbes come along.',
  redox: 'The mud is short of oxygen. Open a drainage channel so the tide can leave, and plant after the reading recovers.',
  flood: 'The mud stays under water for much of the day. Plant on the higher part of the area.',
  organic: 'The mud holds little food for microbes. Leave fallen leaves and roots in place, and raise the seedlings in nursery mud first.',
  texture: 'Sandy mud holds little food and water. Raise the seedlings in nursery mud and plant them with it.',
  bed: 'The mud level is changing fast. Stake the seedlings and check them after storms.',
}
const ADVICE_ORDER: readonly MudIssue[] = ['microbes', 'redox', 'flood', 'organic', 'texture', 'bed']

export interface MudCheck {
  rows: MudRow[]
  /** The rows outside the Healthy Band. */
  issues: MudIssue[]
  band: Band
  /** One sentence on the most useful thing to do; null when nothing was found. */
  advice: string | null
  /**
   * How well plants last here compared with the measured plantation (1 = the same). Each finding takes a tenth off,
   * down to 0.6. An assumption for the demo, not a sourced figure.
   */
  survival: number
}

export function mudCheck(s: SoilSurvey, redox: number): MudCheck {
  const rows = mudRows(s, redox)
  const issues = rows.filter((r) => r.band !== 'healthy').map((r) => r.id)
  const band: Band = rows.some((r) => r.band === 'danger') ? 'danger' : issues.length ? 'warning' : 'healthy'
  const first = ADVICE_ORDER.find((id) => issues.includes(id))
  return { rows, issues, band, advice: first ? ADVICE[first] : null, survival: Math.max(0.6, 1 - 0.1 * issues.length) }
}

/**
 * The soil each species grows best in, and the soil it also takes. General mangrove zonation used as guide values for
 * the demo, not figures from a Knowledgebase source, so the Soil Type Suggestion carries no citation.
 */
const SOIL_FOR_SPECIES: Record<Species, { best: SoilTexture; also: SoilTexture; why: string }> = {
  'Avicennia marina': { best: 'Sandy mud', also: 'Silty mud', why: 'is a pioneer on the seaward edge that roots well in firm, sandy mud' },
  'Sonneratia alba': { best: 'Sandy mud', also: 'Silty mud', why: 'grows on the open seaward edge in sandy or soft mud' },
  'Rhizophora mucronata': { best: 'Silty mud', also: 'Clay mud', why: 'grows on creek banks in deep, soft silty mud' },
  'Rhizophora apiculata': { best: 'Silty mud', also: 'Clay mud', why: 'grows in deep, soft mud that normal high tides flood' },
  'Bruguiera gymnorhiza': { best: 'Clay mud', also: 'Silty mud', why: 'grows further inland in firmer clay mud that is flooded less often' },
}

export interface SoilSuggestion {
  /** The soil type the suggested species grows best in. */
  soil: SoilTexture
  /** The soil type the Mud Check found at the spot. */
  found: SoilTexture
  /** best: the found soil is the suggested one; ok: the species also takes it; poor: neither. */
  fit: 'best' | 'ok' | 'poor'
  sentences: string[]
}

/** The Soil Type Suggestion for a species at a surveyed spot. It never changes the species. */
export function suggestSoil(species: Species, alternative: Species, s: SoilSurvey): SoilSuggestion {
  const pref = SOIL_FOR_SPECIES[species]
  const found = s.texture
  const fit = found === pref.best ? 'best' : found === pref.also ? 'ok' : 'poor'
  const lower = (t: SoilTexture) => t.toLowerCase()
  const sentences = [`${species} ${pref.why}.`]
  if (fit === 'best') {
    sentences.push(`The mud check found ${lower(found)} here, the soil it grows best in.`)
  } else if (fit === 'ok') {
    sentences.push(`The mud check found ${lower(found)} here. It grows best in ${lower(pref.best)} but also takes ${lower(found)}.`)
  }
  // The Mud Check lists sandy mud for every species (it holds little food for microbes), so say why both are true.
  if (fit !== 'poor' && found === 'Sandy mud') {
    sentences.push('Sandy mud still holds little food for microbes, so the mud check lists it. Follow its advice when planting.')
  }
  if (fit === 'poor') {
    const alt = SOIL_FOR_SPECIES[alternative]
    const altFits = found === alt.best || found === alt.also
    sentences.push(`The mud check found ${lower(found)} here, not the ${lower(pref.best)} it grows best in. Fill each planting hole with ${lower(pref.best)} from a healthy stand${altFits ? `, or plant ${alternative}, which takes ${lower(found)}` : ''}.`)
  }
  return { soil: pref.best, found, fit, sentences }
}

/** The Mud Check in two short sentences for the Species Suggestion and the scan's AI Suggestion. */
export function mudSentences(c: MudCheck): string[] {
  if (!c.issues.length) return ['The mud check found nothing to fix: the mud has oxygen, food and helpful microbes.']
  const found = c.rows.filter((r) => r.band !== 'healthy').map((r) => r.phrase)
  const list = found.length > 1 ? `${found.slice(0, -1).join(', ')} and ${found[found.length - 1]}` : found[0]
  return [`The mud check found ${found.length === 1 ? 'one thing' : `${found.length} things`} to fix: ${list}.`, c.advice!]
}
