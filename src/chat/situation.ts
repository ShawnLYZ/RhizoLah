// The live situation Ask RhizoLah! answers about: a plain-text snapshot of the app state at the moment of the
// question (Current Site, the ten Readings and their Bands, danger, camera, Replant Areas, tasks). Everything here is
// simulated demo data, so the chat cites it as [Live], never as a Knowledgebase source.

import { useRoute, ROUTE_INFO } from '../app/router'
import { useSite } from '../forest/forestData'
import { comingSoonSites, liveName } from '../site/catalogue'
import { SENSORS, bandOf, formatReading, type SensorId } from '../sim/ranges'
import { dangerSummary } from '../sim/insights'
import { suggestionReasons } from '../sim/species'
import { mudCheck, mudSentences, soilSurveyAt, suggestSoil } from '../sim/soil'
import { growthCaption } from '../sim/growth'
import { formatRM, plantingCost, plantingPlan } from '../sim/planting'
import { co2At, formatTonnes } from '../sim/carbon'
import {
  areaStep, cameraOnline, currentSite, lastHeard, openEvent, siteAreas, taskComplete, useApp, type Task,
} from '../state/store'
import { formatArea, formatMYTDateTime, timeAgo } from '../ui/time'

/** The Band limits of ranges.ts `bandOf`, in words. Keep in step with it. */
const BAND_LIMITS: Record<SensorId, string> = {
  salinity: 'healthy up to 35, warning up to 45, danger above 45',
  turbidity: 'healthy up to 25, warning up to 100, danger above 100',
  water_temp: 'healthy 20 to 32, warning 15 to 36, danger outside',
  wave_height: 'healthy up to 0.5, warning up to 1.0, danger above 1.0',
  water_level: 'healthy up to 1.8, warning up to 2.2, danger above 2.2',
  wave_velocity: 'healthy up to 0.5, warning up to 1.0, danger above 1.0',
  mud_ph: 'healthy 6 to 8, warning 5 to 9, danger outside',
  mud_ec: 'healthy up to 45, warning up to 55, danger above 55',
  mud_temp: 'healthy 20 to 32, warning 15 to 36, danger outside',
  mud_redox: 'healthy from -100 up, warning down to -200, danger below -200',
}

const MODE_WORDS = {
  healthy: 'steady',
  dropping: 'a danger simulation is ramping the readings down',
  danger: 'a danger simulation is running',
  restoring: 'readings are being restored to healthy',
} as const

const STEP_WORDS = { suitable: 'Suitable to Plant (not planted yet)', planted: 'Planted', grown: 'Done growing' } as const

function taskLine(t: Task): string {
  const state = taskComplete(t) ? 'complete' : t.steps[0] === null ? 'open, first step not done' : 'open, second step not done'
  if (t.kind === 'restoration') {
    return `Restoration Task at ${t.siteName}: plant ${t.species} on ${formatArea(t.areaM2)}; ${state}; created ${formatMYTDateTime(t.createdAt)}.`
  }
  return `Prevention Task at ${t.siteName}: ${t.band} in ${t.sensors.join(', ')}; advice "${t.advice}"; ${state}; created ${formatMYTDateTime(t.createdAt)}.`
}

export function situationText(): string {
  const s = useApp.getState()
  const route = useRoute.getState().route
  const site = currentSite(s)
  const bundle = useSite.getState().bundle
  const out: string[] = []

  out.push(`Time now: ${formatMYTDateTime(s.now)} (Malaysia time).`)
  out.push(`The visitor is on the "${ROUTE_INFO[route].title}" page (${ROUTE_INFO[route].sub}).`)
  out.push(`Current Site: ${site.name}, ${site.region}, Malaysia (${site.centre.lat.toFixed(4)}, ${site.centre.lng.toFixed(4)}).`
    + (site.source === 'traced' ? ' Its forest outline was hand-traced.' : ' Its 3D forest is generated from satellite imagery, an estimate, not a survey.'))
  const area = bundle && bundle.site.id === site.id ? bundle.areaM2 : s.siteFacts[site.id]?.areaM2
  if (area) out.push(`Mangrove area in the 500 x 500 m monitored square: ${formatArea(area)}.`)
  const soon = comingSoonSites().map((c) => c.name)
  if (soon.length) out.push(`Coming Soon sites (not live yet): ${soon.join(', ')}.`)

  const live = bundle && bundle.site.id === site.id ? liveName(bundle.layout.posts) : 'the live post'
  out.push('')
  out.push(`Forest health (the worst Band of the ten sensors at ${live}, the only live post): ${s.level.toUpperCase()}; ${MODE_WORDS[s.ramp.mode]}. Readings update every 2 s.`)
  out.push('Readings (value, Band, Band limits):')
  for (const spec of SENSORS) {
    const v = s.reading[spec.id]
    out.push(`- ${spec.name} (${spec.hint.toLowerCase()}): ${formatReading(spec.id, v)}${spec.unit ? ` ${spec.unit}` : ''}, ${bandOf(spec.id, v)}; ${BAND_LIMITS[spec.id]}${spec.unit ? ` ${spec.unit}` : ''}.`)
  }
  const sum = dangerSummary(s.reading)
  if (sum) {
    out.push(`Why (the app's generated explanation): ${sum.lines.join(' ')} ${sum.advice}`)
  }

  const ev = openEvent(s)
  out.push('')
  out.push(ev ? `A danger episode is open since ${formatMYTDateTime(ev.startedAt)}.` : 'No danger episode is open.')
  out.push(`Camera at ${live}: ${cameraOnline(s) ? 'online' : 'offline'}, last heard ${timeAgo(lastHeard(s), s.now)}. It takes a photo by itself when a reading reaches Danger.`)
  const last = s.photos[s.photos.length - 1]
  out.push(last ? `Danger photos taken: ${s.photos.length}; latest ${formatMYTDateTime(last.takenAt)}.` : 'No danger photos yet.')

  out.push('')
  const areas = siteAreas(s, site.id)
  const patches = bundle && bundle.site.id === site.id ? bundle.layout.patches : []
  const found = patches.filter((p) => areas[p.id])
  if (!found.length) {
    out.push(`Replant Areas at ${site.shortName}: none yet. "Scan for replanting" (More menu, needs all readings Healthy) finds them; PlantLah! confirms one.`)
  } else {
    out.push(`Replant Areas at ${site.shortName} (shown on the Digital Twin as "Suitable to Plant", "Planted" or "Done growing"):`)
    found.forEach((p, i) => {
      const a = areas[p.id]!
      const task = s.tasks.find((t) => t.id === a.taskId)
      const survey = soilSurveyAt(p.centroid.x, p.centroid.z)
      const mud = mudCheck(survey, a.readings.mud_redox)
      const soil = suggestSoil(a.suggestion.species, a.suggestion.alternative, survey)
      const reasons = suggestionReasons(a.suggestion, a.readings).map((r) => `${r.text} [${r.sources.join(', ')}]`)
      out.push(`- Replant Area ${i + 1}: ${formatArea(p.areaM2)}, ${STEP_WORDS[areaStep(task)]}, scanned ${formatMYTDateTime(a.confirmedAt)}.`)
      out.push(`  Species Suggestion: ${a.suggestion.species} (alternative ${a.suggestion.alternative}). Reasons: ${reasons.join(' ')}`)
      out.push(`  Mud Check (no Knowledgebase source): ${mudSentences(mud).join(' ')}`)
      out.push(`  Soil Type Suggestion (no Knowledgebase source): ${soil.soil}; found here ${soil.found} (${soil.fit} fit). ${soil.sentences.join(' ')}`)
      const plan = plantingPlan(a.suggestion.species, p.areaM2)
      out.push(`  Planting Plan: about ${plan.seedlings} seedlings, ${plan.spacingM.toFixed(1)} m apart on a square grid ${plan.source ? `(spacing from ${plan.source})` : '(spacing has no Knowledgebase source)'}.`)
      const cost = plantingCost(a.suggestion.species, plan.seedlings, { poorSoil: soil.fit === 'poor', mudIssues: mud.issues.length > 0 })
      out.push(`  Planting Cost (estimate in RM, no Knowledgebase source): total ${formatRM(cost.totalRM)}; ${cost.lines.map((l) => `${l.label} ${formatRM(l.rm)} (${l.detail})`).join('; ')}.`)
    })
    out.push(`Growth Simulation year: ${growthCaption(s.year)} (Rhizophora apiculata figures from K3).`)
    const carbon = found.map((p) => {
      const a = areas[p.id]!
      return { seedlings: plantingPlan(a.suggestion.species, p.areaM2).seedlings, mud: mudCheck(soilSurveyAt(p.centroid.x, p.centroid.z), a.readings.mud_redox).survival }
    })
    const c = co2At(s.year, carbon)
    out.push(`Estimated CO2 reduced at that year: ${formatTonnes(c.co2T)} by about ${c.standing} plants standing (above-ground only; per-tree biomass from K4's 216 t/ha at 4,331 stems/ha at 15 years, scaled by K3's growth; the 0.47 carbon share and 44/12 conversion are standard factors, not Knowledgebase sources).`)
  }

  const open = s.tasks.filter((t) => !taskComplete(t))
  out.push('')
  out.push(open.length ? `Open tasks (${open.length}):` : 'No open tasks.')
  for (const t of open.slice(-8)) out.push(`- ${taskLine(t)}`)
  const done = s.tasks.length - open.length
  if (done) out.push(`Completed tasks: ${done}.`)

  if (s.chosenSpecies || s.chosenSoil) {
    out.push(`Chosen on the Sentinel Network to colour the Digital Twin: species ${s.chosenSpecies ?? 'none'}, soil ${s.chosenSoil ?? 'none'}.`)
  }
  return out.join('\n')
}
