// App-wide state. The Sensor Engine runs here (not inside a page), so a ramp keeps going when the visitor
// changes page (addendum A0.4). What the PRD keeps in Supabase is kept in localStorage in this demo.

import { create } from 'zustand'
import cameraLibrary from 'virtual:camera-photos'
import {
  backfill, healthyReading, HISTORY_POINTS, rampProgress, readingAt, TICK_MS, type RampState,
} from '../sim/engine'
import { levelOf, sensorsIn, SENSOR_BY_ID, SENSOR_IDS, type Band, type Reading, type SensorId } from '../sim/ranges'
import { CATALOGUE_SITES, findSite, KSL_ID, type AddedLocation, type PatchId, type ReplantPatch } from '../site/catalogue'
import type { LatLng } from '../geo/geo'
import { hash1 } from '../sim/noise'
import { SPECIES_LIST, type Species, type SpeciesSuggestion } from '../sim/species'
import { SOIL_TEXTURES, type SoilTexture } from '../sim/soil'

export type Route = 'command' | 'satellite' | 'network' | 'twin'
export const ROUTES: Route[] = ['command', 'satellite', 'network', 'twin']

export const CAMERA_OFFLINE_SECONDS = 120
export const PHOTO_EXPIRY_MINUTES = 10

export interface DangerEvent {
  id: string
  startedAt: number
  endedAt: number | null
  endReason: 'recovered' | 'reset' | null
  triggerSensors: SensorId[]
}

export type RequestStatus = 'pending' | 'done' | 'failed' | 'expired'

export interface PhotoRequest {
  id: string
  createdAt: number
  dangerEventId: string
  kind: 'danger' | 'retry'
  status: RequestStatus
  dueAt: number
  willFail: boolean
  completedAt: number | null
  photoId: string | null
}

export interface Photo {
  id: string
  takenAt: number
  src: string
  credit: string | null
  source: 'sample' | 'own'
  requestId: string
  dangerEventId: string
}

/** A Replant Patch confirmed with "PlantLah!". Its Area Step is read from its Restoration Task. */
export interface ReplantArea {
  confirmedAt: number
  taskId: string
  /** The ten sensor values at the area's centre, as shown on the scan panel at the click. */
  readings: Reading
  suggestion: SpeciesSuggestion
}

export type SiteAreas = Partial<Record<PatchId, ReplantArea>>

export type TaskKind = 'prevention' | 'restoration'

interface TaskBase {
  id: string
  siteId: string
  /** Copied at creation so the card never has to look it up. */
  siteName: string
  createdAt: number
  /** When the first and the second step were done; null until done. */
  steps: [number | null, number | null]
}

export interface RestorationTask extends TaskBase {
  kind: 'restoration'
  patchId: PatchId
  /** As the scan shows it: rounded to the nearest 10. */
  areaM2: number
  species: Species
}

export interface PreventionTask extends TaskBase {
  kind: 'prevention'
  band: 'danger' | 'warning'
  sensors: SensorId[]
  advice: string
}

export type Task = RestorationTask | PreventionTask

/** What "SaveLah!" saw on screen: the AI Summary's Band, its sensors and its advice line. */
export interface PanelSummary {
  band: 'danger' | 'warning'
  sensors: SensorId[]
  advice: string
}

const MAX_PREVENTION_TASKS = 30

interface Persisted {
  events: DangerEvent[]
  requests: PhotoRequest[]
  photos: Photo[]
  /** Replant Areas per Site, then per patch. */
  areas: Record<string, SiteAreas>
  /** Every Site's tasks in one list, oldest first. */
  tasks: Task[]
  photoCursor: number
  /** Sites created with "Add Location". Only name, centre and time: never pixels, a Canopy Map or a model. */
  locations: AddedLocation[]
  /** Mangrove area of each built Site, so a card can show it without rebuilding the forest. */
  siteFacts: Record<string, { areaM2: number }>
  /** The Site that pages 2-4 show. Each tab keeps its own; it is read from storage at load only. */
  currentSiteId: string
  /** The Mangrove Species and Soil Type chosen on the Sentinel Network (null = None). They colour the Digital Twin only. */
  chosenSpecies: Species | null
  chosenSoil: SoilTexture | null
}

export interface AppState extends Persisted {
  now: number
  /** When the current Reading was produced. */
  tickTime: number
  year: number
  ramp: RampState
  reading: Reading
  level: Band
  history: Record<SensorId, number[]>
  dangerReported: boolean
  healthyReported: boolean
  /** True only in the tab where the ramp button was pressed. */
  rampOwner: boolean
  heartbeatPhase: number
  /** Counts tasks created in this tab, so the Tasks icon rings once per task here and not in other tabs. */
  taskRing: number

  tick(): void
  clock(): void
  simulateDanger(): void
  restoreHealthy(): void
  retryPhoto(): void
  /**
   * PlantLah!: saves the Replant Area with its frozen Readings and Species Suggestion and creates its Restoration Task.
   * Refuses (returns false) while a Danger Event is open or when the patch already has an area.
   */
  confirmReplantArea(siteId: string, patch: ReplantPatch, readings: Reading, suggestion: SpeciesSuggestion): boolean
  /** Records the time of the task's next step. Does nothing once the task is complete. */
  advanceTask(id: string): void
  setCurrentSite(id: string): void
  setChosenSpecies(v: Species | null): void
  setChosenSoil(v: SoilTexture | null): void
  /** Saves a new Added Location, makes it the Current Site and returns its id. */
  addLocation(name: string, centre: LatLng, areaM2: number): string
  removeLocation(id: string): void
  setSiteFact(id: string, areaM2: number): void
  resetDemo(): void
  /**
   * SaveLah!: clears the camera panel, glides the readings back to Healthy like Restore healthy, and adds a
   * Prevention Task for the Current Site from the summary on screen.
   */
  savePanel(summary: PanelSummary | null): void
  syncFromStorage(): void
}

const KEY = 'bcs-demo-state-v1'

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

const PATCH_IDS: readonly string[] = ['patch-1', 'patch-2', 'patch-3']
const SPECIES: readonly string[] = SPECIES_LIST

const isTime = (v: unknown) => v === null || typeof v === 'number'

function isArea(a: unknown): a is ReplantArea {
  if (!isObject(a) || typeof a.confirmedAt !== 'number' || typeof a.taskId !== 'string') return false
  const r = a.readings, g = a.suggestion
  // Areas saved before mud redox was added are kept: the missing value is filled with the healthy preset.
  if (isObject(r) && typeof r.mud_redox !== 'number') r.mud_redox = SENSOR_BY_ID.mud_redox.preset
  return isObject(r) && SENSOR_IDS.every((id) => typeof r[id] === 'number')
    && isObject(g) && SPECIES.includes(g.species as string) && SPECIES.includes(g.alternative as string)
    && ['saline', 'creek', 'central'].includes(g.branch as string) && typeof g.nearWater === 'boolean'
}

/**
 * Replant Areas. Anything without the new shape is dropped, which clears the old version's plantings once
 * (they were saved under another key, in a per-Site shape or an earlier flat one).
 */
function loadAreas(v: unknown): Record<string, SiteAreas> {
  if (!isObject(v)) return {}
  const out: Record<string, SiteAreas> = {}
  for (const [site, p] of Object.entries(v)) {
    if (!isObject(p)) continue
    const areas: SiteAreas = {}
    for (const [id, a] of Object.entries(p)) if (PATCH_IDS.includes(id) && isArea(a)) areas[id as PatchId] = a
    if (Object.keys(areas).length) out[site] = areas
  }
  return out
}

function loadTasks(v: unknown): Task[] {
  if (!Array.isArray(v)) return []
  return v.filter((t): t is Task => {
    if (!isObject(t) || typeof t.id !== 'string' || typeof t.siteId !== 'string' || typeof t.siteName !== 'string'
      || typeof t.createdAt !== 'number' || !Array.isArray(t.steps) || t.steps.length !== 2 || !t.steps.every(isTime)) return false
    if (t.kind === 'restoration') {
      return PATCH_IDS.includes(t.patchId as string) && typeof t.areaM2 === 'number' && SPECIES.includes(t.species as string)
    }
    return t.kind === 'prevention' && (t.band === 'danger' || t.band === 'warning') && Array.isArray(t.sensors)
      && t.sensors.every((id) => SENSOR_IDS.includes(id as SensorId)) && typeof t.advice === 'string'
  })
}

function loadLocations(v: unknown): AddedLocation[] {
  if (!Array.isArray(v)) return []
  return v.filter((l): l is AddedLocation =>
    isObject(l) && typeof l.id === 'string' && typeof l.name === 'string' && isObject(l.centre)
    && Number.isFinite(l.centre.lat) && Number.isFinite(l.centre.lng) && typeof l.addedAt === 'number'
    && !CATALOGUE_SITES.some((c) => c.id === l.id))
}

/** The given Site id if it still exists and is live, otherwise Kuala Selangor. */
function validSiteId(id: unknown, locations: AddedLocation[]): string {
  const site = typeof id === 'string' ? findSite(id, locations) : null
  return site?.live ? site.id : KSL_ID
}

function load(): Persisted {
  const empty: Persisted = {
    events: [], requests: [], photos: [], areas: {}, tasks: [], photoCursor: 0, locations: [], siteFacts: {}, currentSiteId: KSL_ID,
    chosenSpecies: null, chosenSoil: null,
  }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return empty
    const p = JSON.parse(raw) as Partial<Persisted>
    const locations = loadLocations(p.locations)
    const siteFacts: Record<string, { areaM2: number }> = {}
    if (isObject(p.siteFacts)) {
      for (const [id, f] of Object.entries(p.siteFacts)) {
        if (isObject(f) && typeof f.areaM2 === 'number') siteFacts[id] = { areaM2: f.areaM2 }
      }
    }
    return {
      events: Array.isArray(p.events) ? p.events : [],
      requests: Array.isArray(p.requests) ? p.requests : [],
      photos: Array.isArray(p.photos) ? p.photos : [],
      areas: loadAreas(p.areas),
      tasks: loadTasks(p.tasks),
      photoCursor: typeof p.photoCursor === 'number' ? p.photoCursor : 0,
      locations,
      siteFacts,
      currentSiteId: validSiteId(p.currentSiteId, locations),
      chosenSpecies: SPECIES_LIST.find((x) => x === p.chosenSpecies) ?? null,
      chosenSoil: SOIL_TEXTURES.find((x) => x === p.chosenSoil) ?? null,
    }
  } catch {
    return empty
  }
}

function save(s: Persisted) {
  try {
    const { events, requests, photos, areas, tasks, photoCursor, locations, siteFacts, currentSiteId, chosenSpecies, chosenSoil } = s
    localStorage.setItem(KEY, JSON.stringify({
      events, requests, photos, areas, tasks, photoCursor, locations, siteFacts, currentSiteId, chosenSpecies, chosenSoil,
    }))
  } catch {
    // Private windows or blocked storage: the demo still runs, it just forgets on reload.
  }
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)

export const openEvent = (s: Pick<AppState, 'events'>) => s.events.find((e) => e.endedAt === null) ?? null
export const pendingRequest = (s: Pick<AppState, 'requests'>) => s.requests.find((r) => r.status === 'pending') ?? null
export const latestRequest = (s: Pick<AppState, 'requests'>) => s.requests[s.requests.length - 1] ?? null

/** The camera's simulated heartbeat: once a minute, at a fixed phase. */
export function lastHeard(s: Pick<AppState, 'now' | 'heartbeatPhase' | 'photos'>): number {
  const beat = Math.floor((s.now - s.heartbeatPhase) / 60_000) * 60_000 + s.heartbeatPhase
  const lastPhoto = s.photos.length ? s.photos[s.photos.length - 1].takenAt : 0
  return Math.max(beat, lastPhoto <= s.now ? lastPhoto : 0)
}

export function cameraOnline(s: Pick<AppState, 'now' | 'heartbeatPhase' | 'photos'>): boolean {
  return s.now - lastHeard(s) < CAMERA_OFFLINE_SECONDS * 1000
}

function newRequest(s: Persisted, eventId: string, kind: 'danger' | 'retry', now: number): PhotoRequest {
  const willFail = cameraLibrary.photos.length === 0
  // The camera checks every 5 s, captures (up to 3 attempts) and uploads: a photo lands in about 6-12 s.
  const delay = willFail ? 14_000 : 6_000 + Math.round(hash1(s.requests.length * 977 + Math.floor(now / 1000)) * 6_000)
  return {
    id: uid(), createdAt: now, dangerEventId: eventId, kind, status: 'pending', dueAt: now + delay, willFail,
    completedAt: null, photoId: null,
  }
}

const initial = load()
const now0 = Date.now()
const startOpen = initial.events.some((e) => e.endedAt === null)
const ramp0: RampState = { mode: startOpen ? 'danger' : 'healthy', startedAt: now0, from: healthyReading(now0) }
const reading0 = readingAt(ramp0, now0)

export const useApp = create<AppState>((set, get) => ({
  ...initial,
  now: now0,
  tickTime: now0,
  year: 1,
  ramp: ramp0,
  reading: reading0,
  level: levelOf(reading0),
  history: backfill(ramp0, now0),
  dangerReported: startOpen,
  healthyReported: !startOpen,
  rampOwner: false,
  heartbeatPhase: now0 - 17_000 - Math.round(Math.random() * 20_000),
  taskRing: 0,

  tick() {
    const s = get()
    const t = Date.now()
    const reading = readingAt(s.ramp, t)
    const level = levelOf(reading)
    const history = { ...s.history }
    for (const id of SENSOR_IDS) {
      const arr = s.history[id].slice(-(HISTORY_POINTS - 1))
      arr.push(reading[id])
      history[id] = arr
    }
    let ramp = s.ramp
    let { dangerReported, healthyReported } = s
    const p = rampProgress(ramp, t)
    let next: Partial<AppState> = {}

    if (ramp.mode === 'dropping') {
      if (level === 'danger' && !dangerReported) {
        dangerReported = true
        next = { ...next, ...openDanger(get(), sensorsIn(reading, 'danger'), t) }
      }
      if (p >= 1) ramp = { ...ramp, mode: 'danger' }
    } else if (ramp.mode === 'restoring') {
      if (level === 'healthy' && !healthyReported) {
        healthyReported = true
        next = { ...next, ...closeDanger(get(), 'recovered', t) }
      }
      if (p >= 1) ramp = { ...ramp, mode: 'healthy' }
    }
    set({ ...next, now: t, tickTime: t, reading, level, history, ramp, dangerReported, healthyReported })
  },

  clock() {
    const s = get()
    const t = Date.now()
    let changed = false
    let cursor = s.photoCursor
    const photos = [...s.photos]
    const requests = s.requests.map((r) => {
      if (r.status !== 'pending') return r
      if (t - r.createdAt > PHOTO_EXPIRY_MINUTES * 60_000) {
        changed = true
        return { ...r, status: 'expired' as const, completedAt: t }
      }
      if (t < r.dueAt) return r
      changed = true
      const lib = cameraLibrary.photos
      if (r.willFail || lib.length === 0) return { ...r, status: 'failed' as const, completedAt: r.dueAt }
      const pick = lib[cursor % lib.length]
      cursor += 1
      const photo: Photo = {
        id: uid(), takenAt: r.dueAt, src: pick.src, credit: pick.credit, source: cameraLibrary.source,
        requestId: r.id, dangerEventId: r.dangerEventId,
      }
      photos.push(photo)
      return { ...r, status: 'done' as const, completedAt: r.dueAt, photoId: photo.id }
    })
    if (changed) {
      const persisted = { ...s, requests, photos: photos.slice(-40), photoCursor: cursor }
      save(persisted)
      set({ now: t, requests, photos: persisted.photos, photoCursor: cursor })
    } else {
      set({ now: t })
    }
  },

  simulateDanger() {
    const s = get()
    if (s.ramp.mode !== 'healthy') return
    const t = Date.now()
    set({
      ramp: { mode: 'dropping', startedAt: t, from: readingAt(s.ramp, t) },
      dangerReported: false, healthyReported: false, rampOwner: true,
    })
    restartTicker()
  },

  restoreHealthy() {
    const s = get()
    if (s.ramp.mode !== 'danger') return
    const t = Date.now()
    set({
      ramp: { mode: 'restoring', startedAt: t, from: readingAt(s.ramp, t) },
      healthyReported: false, rampOwner: true,
    })
    restartTicker()
  },

  retryPhoto() {
    const s = get()
    if (pendingRequest(s)) return
    const ev = s.events[s.events.length - 1]
    if (!ev) return
    const t = Date.now()
    const requests = [...s.requests, newRequest(s, ev.id, 'retry', t)]
    save({ ...s, requests })
    set({ requests, now: t })
  },

  confirmReplantArea(siteId, patch, readings, suggestion) {
    const s = get()
    const site = findSite(siteId, s.locations)
    if (!site || openEvent(s) || s.areas[siteId]?.[patch.id]) return false
    const t = Date.now()
    const task: RestorationTask = {
      id: uid(), kind: 'restoration', siteId, siteName: site.shortName, createdAt: t, steps: [null, null],
      patchId: patch.id, areaM2: Math.round(patch.areaM2 / 10) * 10, species: suggestion.species,
    }
    const area: ReplantArea = { confirmedAt: t, taskId: task.id, readings: { ...readings }, suggestion: { ...suggestion } }
    const areas = { ...s.areas, [siteId]: { ...s.areas[siteId], [patch.id]: area } }
    const tasks = [...s.tasks, task]
    save({ ...s, areas, tasks })
    set({ areas, tasks, taskRing: s.taskRing + 1 })
    return true
  },

  advanceTask(id) {
    const s = get()
    const i = s.tasks.findIndex((x) => x.id === id)
    if (i < 0) return
    const task = s.tasks[i]
    if (task.steps[1] !== null) return
    const t = Date.now()
    const steps: [number | null, number | null] = task.steps[0] === null ? [t, null] : [task.steps[0], t]
    const tasks = s.tasks.map((x, j) => (j === i ? { ...x, steps } : x))
    save({ ...s, tasks })
    set({ tasks })
  },

  setCurrentSite(id) {
    const s = get()
    const currentSiteId = validSiteId(id, s.locations)
    if (currentSiteId === s.currentSiteId) return
    save({ ...s, currentSiteId })
    set({ currentSiteId })
  },

  setChosenSpecies(chosenSpecies) {
    save({ ...get(), chosenSpecies })
    set({ chosenSpecies })
  },

  setChosenSoil(chosenSoil) {
    save({ ...get(), chosenSoil })
    set({ chosenSoil })
  },

  addLocation(name, centre, areaM2) {
    const s = get()
    const id = `added-${uid().replace(/-/g, '').slice(0, 10)}`
    const locations = [...s.locations, { id, name, centre: { lat: centre.lat, lng: centre.lng }, addedAt: Date.now() }]
    const siteFacts = { ...s.siteFacts, [id]: { areaM2 } }
    save({ ...s, locations, siteFacts, currentSiteId: id })
    set({ locations, siteFacts, currentSiteId: id })
    return id
  },

  removeLocation(id) {
    const s = get()
    if (!s.locations.some((l) => l.id === id)) return
    const locations = s.locations.filter((l) => l.id !== id)
    const siteFacts = { ...s.siteFacts }
    const areas = { ...s.areas }
    delete siteFacts[id]
    delete areas[id]
    const tasks = s.tasks.filter((t) => t.siteId !== id)
    const currentSiteId = s.currentSiteId === id ? KSL_ID : s.currentSiteId
    save({ ...s, locations, siteFacts, areas, tasks, currentSiteId })
    set({ locations, siteFacts, areas, tasks, currentSiteId })
  },

  setSiteFact(id, areaM2) {
    const s = get()
    if (s.siteFacts[id]?.areaM2 === areaM2 || !findSite(id, s.locations)) return
    const siteFacts = { ...s.siteFacts, [id]: { areaM2 } }
    save({ ...s, siteFacts })
    set({ siteFacts })
  },

  resetDemo() {
    const s = get()
    const t = Date.now()
    const events = s.events.map((e) => (e.endedAt === null ? { ...e, endedAt: t, endReason: 'reset' as const } : e))
    const requests = s.requests.map((r) => (r.status === 'pending' ? { ...r, status: 'expired' as const, completedAt: t } : r))
    const ramp: RampState = { mode: 'healthy', startedAt: t, from: healthyReading(t) }
    const reading = readingAt(ramp, t)
    // Added Locations go too, with their facts; the Current Site is Kuala Selangor again.
    const kept = s.siteFacts[KSL_ID]
    const siteFacts: Record<string, { areaM2: number }> = kept ? { [KSL_ID]: kept } : {}
    // Tasks and Replant Areas are cleared; Knowledgebase uploads live elsewhere and are kept.
    save({ ...s, events, requests, areas: {}, tasks: [], locations: [], siteFacts, currentSiteId: KSL_ID, chosenSpecies: null, chosenSoil: null })
    set({
      chosenSpecies: null, chosenSoil: null,
      events, requests, areas: {}, tasks: [], locations: [], siteFacts, currentSiteId: KSL_ID, year: 1, ramp, reading, level: levelOf(reading),
      history: backfill(ramp, t), dangerReported: false, healthyReported: true, rampOwner: false, now: t, tickTime: t,
    })
  },

  savePanel(summary) {
    const s = get()
    const t = Date.now()
    const restore = s.ramp.mode === 'danger' || s.ramp.mode === 'dropping'
    let tasks = s.tasks
    if (summary) {
      const site = currentSite(s)
      const task: PreventionTask = {
        id: uid(), kind: 'prevention', siteId: site.id, siteName: site.shortName, createdAt: t, steps: [null, null],
        band: summary.band, sensors: [...summary.sensors], advice: summary.advice,
      }
      tasks = capPrevention([...s.tasks, task])
    }
    save({ ...s, requests: [], photos: [], tasks })
    set({
      requests: [], photos: [], now: t, tasks, taskRing: summary ? s.taskRing + 1 : s.taskRing,
      // Same glide back as Restore healthy; the tick closes the Danger Event once readings are Healthy.
      ...(restore ? { ramp: { mode: 'restoring' as const, startedAt: t, from: readingAt(s.ramp, t) }, healthyReported: false, rampOwner: true } : {}),
    })
    if (restore) restartTicker()
  },

  syncFromStorage() {
    const s = get()
    const p = load()
    const wasOpen = !!openEvent(s)
    const isOpen = p.events.some((e) => e.endedAt === null)
    const t = Date.now()
    // Added Locations, site facts, Replant Areas and tasks follow the other tab. The Current Site does not,
    // unless it was removed or reset there.
    let patch: Partial<AppState> = { ...p, currentSiteId: validSiteId(s.currentSiteId, p.locations) }
    // Another tab opened or closed the Danger Event: follow it, unless this tab is running its own ramp.
    if (isOpen && !wasOpen && s.ramp.mode === 'healthy') {
      patch = { ...patch, ramp: { mode: 'danger', startedAt: t, from: s.reading }, dangerReported: true }
    }
    if (!isOpen && wasOpen && (s.ramp.mode === 'danger' || (s.ramp.mode === 'dropping' && !s.rampOwner))) {
      patch = { ...patch, ramp: { mode: 'healthy', startedAt: t, from: s.reading }, healthyReported: true }
    }
    set(patch)
  },
}))

function openDanger(s: AppState, sensors: SensorId[], t: number): Partial<AppState> {
  if (openEvent(s)) return {}
  const ev: DangerEvent = { id: uid(), startedAt: t, endedAt: null, endReason: null, triggerSensors: sensors }
  const events = [...s.events, ev].slice(-30)
  const requests = pendingRequest(s) ? s.requests : [...s.requests, newRequest(s, ev.id, 'danger', t)].slice(-40)
  save({ ...s, events, requests })
  return { events, requests }
}

function closeDanger(s: AppState, reason: 'recovered' | 'reset', t: number): Partial<AppState> {
  if (!openEvent(s)) return {}
  const events = s.events.map((e) => (e.endedAt === null ? { ...e, endedAt: t, endReason: reason } : e))
  save({ ...s, events })
  return { events }
}

let ticker: ReturnType<typeof setInterval> | null = null
function restartTicker() {
  if (ticker) clearInterval(ticker)
  ticker = setInterval(() => useApp.getState().tick(), TICK_MS)
}

let started = false
/** Starts the app-wide clocks once: Readings every 2 s, camera and "time ago" labels every second. */
export function startSimulation() {
  if (started) return
  started = true
  restartTicker()
  setInterval(() => useApp.getState().clock(), 1000)
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) useApp.getState().syncFromStorage()
  })
}

/** Keeps at most 30 Prevention Tasks: the oldest completed one goes first, or the oldest one if none is complete. */
function capPrevention(tasks: Task[]): Task[] {
  const prevention = tasks.filter((t) => t.kind === 'prevention')
  if (prevention.length <= MAX_PREVENTION_TASKS) return tasks
  const drop = prevention.find((t) => t.steps[1] !== null) ?? prevention[0]
  return tasks.filter((t) => t !== drop)
}

const NO_AREAS: SiteAreas = {}

/** One Site's Replant Areas (a stable object, safe as a store selector). */
export const siteAreas = (s: Pick<AppState, 'areas'>, siteId: string): SiteAreas => s.areas[siteId] ?? NO_AREAS

/** The Current Site. Always a live Site. */
export const currentSite = (s: Pick<AppState, 'currentSiteId' | 'locations'>) => findSite(s.currentSiteId, s.locations) ?? CATALOGUE_SITES[0]

/** The next patch the replanting scan offers: the first one of the Site with no Replant Area. */
export function nextPatch(patches: readonly ReplantPatch[], areas: SiteAreas) {
  return patches.find((p) => !areas[p.id]) ?? null
}

/** The ids of a Site's Replant Areas. Areas whose patch no longer exists are ignored. */
export function areaIds(patches: readonly ReplantPatch[], areas: SiteAreas): PatchId[] {
  return patches.filter((p) => areas[p.id]).map((p) => p.id)
}

export const taskComplete = (t: Task) => t.steps[1] !== null

/** Open tasks: not complete. */
export const openTaskCount = (s: Pick<AppState, 'tasks'>) => s.tasks.reduce((n, t) => n + (taskComplete(t) ? 0 : 1), 0)

export type AreaStep = 'suitable' | 'planted' | 'grown'

/** The Area Step is always read from the area's Restoration Task. */
export function areaStep(task: Task | undefined): AreaStep {
  if (!task || task.steps[0] === null) return 'suitable'
  return task.steps[1] === null ? 'planted' : 'grown'
}

export const PHOTO_SOURCE = cameraLibrary.source
export const PHOTO_COUNT = cameraLibrary.photos.length
