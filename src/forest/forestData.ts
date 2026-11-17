// Main-thread access to the forest worker: the Site Bundle of the Current Site, site surveys, overlays.
// The Current Site itself lives in the app store; this module builds whatever it points at.

import { create } from 'zustand'
import type { ForestModel } from './model'
import type { WorkerReply, WorkerRequest } from './forest.worker'
import type { Reading, SensorId } from '../sim/ranges'
import { siteFrame, type LatLng, type SiteFrame } from '../geo/geo'
import type { SensorPost, Site, SiteLayout } from '../site/catalogue'
import { currentSite, useApp } from '../state/store'
import { MAPBOX_TOKEN, MAP_UNAVAILABLE } from '../maps/mapbox'

/** Everything the pages need for the Current Site. */
export interface SiteBundle {
  site: Site
  frame: SiteFrame
  model: ForestModel
  layout: SiteLayout
  areaM2: number
}

interface SiteState {
  status: 'loading' | 'ready' | 'error'
  /** Null while the Current Site is loading or could not be built. */
  bundle: SiteBundle | null
  error: string | null
}

export const useSite = create<SiteState>(() => ({ status: 'loading', bundle: null, error: null }))

const BUILD_FAILED = 'The forest model could not be built.'
const CACHE_SIZE = 4

/** Bundles built this session, most recent last. Memory only. */
const cache = new Map<string, SiteBundle>()
const cacheKey = (s: Site) => `${s.id}@${s.centre.lat},${s.centre.lng}`

let worker: Worker | null = null
let seq = 0
const overlays = new Map<number, (rgba: Uint8Array) => void>()
const surveys = new Map<number, (r: SurveyResult) => void>()
/** The build the page is waiting for. Replies to older builds are discarded. */
let building: { seq: number; site: Site } | null = null

export type SurveyResult = { ok: true; canopyFraction: number; areaM2: number } | { ok: false }

function onReply(msg: WorkerReply) {
  if (msg.type === 'overlay') {
    overlays.get(msg.seq)?.(msg.rgba)
    overlays.delete(msg.seq)
  } else if (msg.type === 'surveyed') {
    surveys.get(msg.seq)?.({ ok: true, canopyFraction: msg.canopyFraction, areaM2: msg.areaM2 })
    surveys.delete(msg.seq)
  } else if (msg.type === 'failed') {
    if (surveys.has(msg.seq)) {
      surveys.get(msg.seq)!({ ok: false })
      surveys.delete(msg.seq)
    } else if (building?.seq === msg.seq) {
      building = null
      useSite.setState({ status: 'error', bundle: null, error: msg.reason === 'imagery' ? MAP_UNAVAILABLE : BUILD_FAILED })
    }
  } else if (msg.type === 'built') {
    if (building?.seq !== msg.seq) return
    const site = building.site
    building = null
    const bundle: SiteBundle = { site, frame: siteFrame(site.centre), model: msg.model, layout: msg.layout, areaM2: msg.model.areaM2 }
    cache.set(cacheKey(site), bundle)
    while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!)
    useSite.setState({ status: 'ready', bundle, error: null })
    useApp.getState().setSiteFact(site.id, bundle.areaM2)
  }
}

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./forest.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<WorkerReply>) => onReply(e.data)
  worker.onerror = () => {
    if (building) {
      building = null
      useSite.setState({ status: 'error', bundle: null, error: BUILD_FAILED })
    }
  }
  return worker
}

const send = (msg: WorkerRequest) => getWorker().postMessage(msg)

/** Shows a Site: from the session cache when it was built before, otherwise built in the worker. */
function open(site: Site) {
  const key = cacheKey(site)
  const hit = cache.get(key)
  if (hit) {
    // Refresh its place in the cache.
    cache.delete(key)
    cache.set(key, hit)
    building = null
    useSite.setState({ status: 'ready', bundle: hit, error: null })
    return
  }
  const id = ++seq
  building = { seq: id, site }
  useSite.setState({ status: 'loading', bundle: null, error: null })
  send({ type: 'build', seq: id, source: site.source, centre: site.centre, token: MAPBOX_TOKEN })
}

let started = false
/** Builds the Current Site now and whenever it changes. Safe to call many times. */
export function startSites() {
  if (started) return
  started = true
  let shown = currentSite(useApp.getState())
  open(shown)
  useApp.subscribe((s) => {
    const next = currentSite(s)
    if (next.id === shown.id) return
    shown = next
    open(next)
  })
}

/** Tries the Current Site again after a failed build (for example once the connection is back). */
export function retrySite() {
  if (started && useSite.getState().status === 'error') open(currentSite(useApp.getState()))
}

/** Site Survey for a square: how much of it is canopy. The worker keeps the Canopy Map for the build that follows. */
export function surveySquare(centre: LatLng): Promise<SurveyResult> {
  const id = ++seq
  return new Promise((resolve) => {
    surveys.set(id, resolve)
    send({ type: 'survey', seq: id, centre, token: MAPBOX_TOKEN })
  })
}

/** Paints the layer from one Reading per sensor post (in the order of `posts`). */
export function requestOverlay(layer: SensorId | 'natural', readings: Reading[], posts: readonly SensorPost[]): Promise<Uint8Array> {
  const id = ++seq
  return new Promise((resolve) => {
    overlays.set(id, resolve)
    send({ type: 'overlay', seq: id, layer, posts: readings, at: posts.flatMap((p) => [p.x, p.z]) })
  })
}
