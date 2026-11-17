// Simulated AI text for the demo. Written from the live readings so the numbers always match the screen.

import { SENSOR_BY_ID, SENSORS, bandOf, formatReading, lowerName, sensorsIn, type Reading, type SensorId } from './ranges'
import type { SpeciesSuggestion } from './species'
import { mudSentences, suggestSoil, type MudCheck, type SoilSurvey } from './soil'

/**
 * Why a reading is off and what most likely caused it, per Sensor and side. Simulate danger plays Factory Pollution
 * (see `ranges.ts`), so the sides it moves are written for waste water from a factory upstream.
 */
const CAUSES: Record<SensorId, { low?: string; high?: string }> = {
  salinity: { high: 'it is likely caused by strong evaporation and little rain or river inflow, so salt builds up around the roots' },
  turbidity: { high: 'it is likely caused by factory waste water and an oil slick flowing down the river, which cloud the water, block light and coat the breathing roots' },
  water_temp: {
    low: 'it is likely caused by heavy cold rain or cool river water flooding in, which slows the trees’ growth',
    high: 'it is likely caused by hot waste water from a factory outlet upstream, which stresses the roots and young seedlings',
  },
  wave_height: { high: 'it is likely caused by a passing storm or monsoon swell pushing high waves against the forest edge, which can uproot young trees' },
  water_level: { high: 'it is likely caused by a storm surge on top of a high tide, which keeps the breathing roots under water for too long' },
  wave_velocity: { high: 'it is likely caused by strong storm currents scouring the mud around the roots and loosening the trees' },
  mud_ph: {
    low: 'it is likely caused by acidic factory waste soaking into the mud, which burns the fine roots and kills the helpful microbes',
    high: 'it is likely caused by alkaline runoff from nearby land settling into the mud',
  },
  mud_ec: { high: 'it is likely caused by dissolved chemicals and heavy metals from factory waste building up in the mud around the roots' },
  mud_temp: {
    low: 'it is likely caused by long spells of cold rain soaking into the mud',
    high: 'it is likely caused by hot factory waste water seeping into the mud at root depth',
  },
  mud_redox: {
    low: 'it is likely caused by oil and factory waste sealing the mud and using up its oxygen, so sulfide-making microbes take over from the helpful ones and poison the roots',
  },
}

function sentence(id: SensorId, v: number) {
  const spec = SENSOR_BY_ID[id]
  const high = v > spec.stress.ideal
  const cause = (high ? CAUSES[id].high : CAUSES[id].low) ?? CAUSES[id].high ?? CAUSES[id].low
  const unit = spec.unit ? (spec.unit === '°C' || spec.unit === '%' ? spec.unit : ` ${spec.unit}`) : ''
  const name = `The ${lowerName(id)}`
  return `${name} is too ${high ? 'high' : 'low'} (${formatReading(id, v)}${unit}); ${cause}.`
}

/** Null when nothing is in Danger or Warning. */
export function dangerSummary(r: Reading): { band: 'danger' | 'warning'; sensors: SensorId[]; lines: string[]; advice: string } | null {
  const danger = sensorsIn(r, 'danger')
  const ids = danger.length ? danger : sensorsIn(r, 'warning')
  if (!ids.length) return null
  const groups = new Set(ids.map((id) => SENSOR_BY_ID[id].group))
  const polluted = ids.some((id) => id === 'mud_ph' || id === 'mud_ec') || (ids.includes('turbidity') && ids.includes('water_temp'))
  const advice = polluted
    ? 'Together these point to factory pollution: oily, acidic waste water from upstream is reaching the station. Report the discharge to the Department of Environment, keep boats out of the slick, and check the roots for oil at low tide.'
    : groups.has('wave')
      ? 'Together these point to a storm surge hitting the station. Check the young trees for broken roots once the water calms.'
      : groups.has('water')
        ? 'Together these point to poor water flow around the station. Check the creek for blockages and watch the next readings.'
        : 'Keep an eye on the next readings; the trees recover if conditions return to normal within a few days.'
  return { band: danger.length ? 'danger' : 'warning', sensors: ids, lines: ids.map((id) => sentence(id, r[id])), advice }
}

/** Why the rule picked this species, in words, from the same Readings and branch as `suggestSpecies`. */
function speciesWhy(s: SpeciesSuggestion, values: Reading): string {
  const sal = `${formatReading('salinity', values.salinity)} PSU`
  if (s.branch === 'saline') {
    return `The water here is salty (${sal}, above 25), and ${s.species} is the salt-tolerant pioneer that grows on open, salty mud.`
  }
  if (s.branch === 'creek') {
    return `Salinity is ${sal}, inside the 15 to 25 range for Rhizophora, and the area lies within about 10 m of water, on the creek bank where ${s.species} grows.`
  }
  return `Salinity is ${sal}, inside the 15 to 25 range for Rhizophora, and the area lies more than 10 m from water, in the central zone where ${s.species} grows.`
}

export interface ReplantSuggestionText {
  intro: string
  species: string
  soil: string
}

/**
 * The scan's AI Suggestion: suitability and the healthy count, then the Mangrove Species (the species rule) and the
 * Soil Type (the Soil Type Suggestion and the Mud Check) in more depth.
 */
export function replantSuggestion(values: Reading, s: SpeciesSuggestion, survey: SoilSurvey, mud: MudCheck): ReplantSuggestionText {
  const healthy = SENSORS.filter((x) => bandOf(x.id, values[x.id]) === 'healthy').length
  const soil = suggestSoil(s.species, s.alternative, survey)
  return {
    intro: `This area is suitable for replanting mangroves. ${healthy} of ${SENSORS.length} readings at this spot are healthy.`,
    species: `Plant ${s.species}. ${speciesWhy(s, values)} ${s.alternative} is the second choice if seedlings run short.`,
    soil: `Best in ${soil.soil.toLowerCase()}. ${soil.sentences.join(' ')} The mud holds ${survey.organicPct}% organic matter and is under water about ${survey.floodHours} hours a day. ${mudSentences(mud).join(' ')}`,
  }
}
