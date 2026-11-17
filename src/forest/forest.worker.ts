// Web Worker: surveys and builds a Site (Canopy Map -> Forest Model + Site Layout), and paints the
// Digital Twin layer overlay (500 x 500, 1 m).
// The overlay only colours the ground around each sensor post: there is no data between posts.

import { buildForest, mangroveAreaM2, N, tracedCanopyMap, type ForestModel } from './model'
import { fetchFootprintPixels } from './survey'
import { canopyFraction, classifyCanopy } from './classify'
import { generateLayout } from './layout'
import { SENSORS, stressOf, type Reading, type SensorId } from '../sim/ranges'
import { STRESS_LUT } from './stressColor'
import { KSL_LAYOUT, POST_RADIUS_M, type SiteLayout } from '../site/catalogue'
import { hash2 } from '../sim/noise'
import type { LatLng } from '../geo/geo'

export type WorkerRequest =
  /** Builds a Site. Generated Sites read live satellite pixels with the token. */
  | { type: 'build'; seq: number; source: 'traced' | 'generated'; centre: LatLng; token: string }
  /** Site Survey only: is there forest in this square? The Canopy Map is kept for the build that follows. */
  | { type: 'survey'; seq: number; centre: LatLng; token: string }
  /** `at` is the flat list of post positions [x0, z0, x1, z1, ...] matching `posts`. */
  | { type: 'overlay'; seq: number; layer: SensorId | 'natural'; posts: Reading[]; at: number[] }

export type WorkerReply =
  | { type: 'built'; seq: number; model: ForestModel; layout: SiteLayout; canopyFraction: number }
  | { type: 'surveyed'; seq: number; canopyFraction: number; areaM2: number }
  /** `imagery`: the satellite pixels could not be read. `build`: anything else. */
  | { type: 'failed'; seq: number; reason: 'imagery' | 'build' }
  | { type: 'overlay'; seq: number; layer: SensorId | 'natural'; rgba: Uint8Array }

const post = (reply: WorkerReply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(reply, transfer)

const centreKey = (c: LatLng) => `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`

/** The Canopy Map of the last surveyed square, so "Use this area" does not fetch the tiles twice. */
let surveyed: { key: string; classes: Uint8Array } | null = null

async function surveyCentre(centre: LatLng, token: string): Promise<Uint8Array> {
  const key = centreKey(centre)
  if (surveyed?.key === key) return surveyed.classes
  const pixels = await fetchFootprintPixels(centre, token)
  // The pixels are dropped here: only the Canopy Map goes on.
  return classifyCanopy(pixels)
}

let zonesKey = ''
let nearest = new Int8Array(0)
let falloff = new Float32Array(0)

/** For every pixel: the nearest post within reach (or -1) and how strongly its colour shows there. */
function prepareZones(at: number[]) {
  const key = at.join(',')
  if (key === zonesKey) return
  zonesKey = key
  nearest = new Int8Array(N * N).fill(-1)
  falloff = new Float32Array(N * N)
  const count = at.length / 2
  const r2 = POST_RADIUS_M * POST_RADIUS_M
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = i + 0.5 - 250, z = j + 0.5 - 250
      let best = -1, bestD2 = r2
      for (let k = 0; k < count; k++) {
        const dx = x - at[k * 2], dz = z - at[k * 2 + 1]
        const d2 = dx * dx + dz * dz
        if (d2 < bestD2) { bestD2 = d2; best = k }
      }
      if (best < 0) continue
      const p = j * N + i
      nearest[p] = best
      // Solid core, soft rim.
      const e = Math.min(1, (1 - Math.sqrt(bestD2) / POST_RADIUS_M) / 0.35)
      falloff[p] = e * e * (3 - 2 * e)
    }
  }
}

function paint(layer: SensorId | 'natural', posts: Reading[], at: number[]): Uint8Array {
  prepareZones(at)
  const near = nearest, fall = falloff
  const out = new Uint8Array(N * N * 4)
  // One stress value per post, then each pixel just looks up its post.
  const stress = posts.map((r) => {
    if (layer !== 'natural') return Math.min(3, stressOf(layer, r[layer]))
    let worst = 0
    for (const s of SENSORS) worst = Math.max(worst, stressOf(s.id, r[s.id]))
    return worst
  })
  for (let p = 0; p < N * N; p++) {
    const k = near[p]
    if (k < 0) continue
    const s = stress[k]
    const li = Math.round((Math.min(3, s) / 3) * 255) * 3
    let a: number
    if (layer === 'natural') {
      // Natural: no tint, except a red bloom around posts whose readings are outside the healthy range.
      const g = Math.min(1, Math.max(0, (s - 0.95) / 1.0))
      a = g * g * (3 - 2 * g) * 200 * fall[p]
    } else {
      a = 255 * fall[p]
    }
    out[p * 4] = STRESS_LUT[li]
    out[p * 4 + 1] = STRESS_LUT[li + 1]
    out[p * 4 + 2] = STRESS_LUT[li + 2]
    out[p * 4 + 3] = Math.round(a)
  }
  return out
}

function sendBuilt(seq: number, classes: Uint8Array, seedOffset: number, layout: SiteLayout) {
  const fraction = canopyFraction(classes)
  const m = buildForest(classes, seedOffset)
  post({ type: 'built', seq, model: m, layout, canopyFraction: fraction }, [
    m.classes.buffer, m.heights.buffer, m.info.buffer, m.trees.buffer, m.roots.buffer,
  ])
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data
  if (msg.type === 'overlay') {
    const rgba = paint(msg.layer, msg.posts, msg.at)
    post({ type: 'overlay', seq: msg.seq, layer: msg.layer, rgba }, [rgba.buffer])
    return
  }
  if (msg.type === 'survey') {
    try {
      const classes = await surveyCentre(msg.centre, msg.token)
      surveyed = { key: centreKey(msg.centre), classes }
      post({ type: 'surveyed', seq: msg.seq, canopyFraction: canopyFraction(classes), areaM2: mangroveAreaM2(classes) })
    } catch {
      post({ type: 'failed', seq: msg.seq, reason: 'imagery' })
    }
    return
  }
  // build
  if (msg.source === 'traced') {
    try {
      sendBuilt(msg.seq, tracedCanopyMap(), 0, KSL_LAYOUT)
    } catch {
      post({ type: 'failed', seq: msg.seq, reason: 'build' })
    }
    return
  }
  let classes: Uint8Array
  try {
    classes = await surveyCentre(msg.centre, msg.token)
  } catch {
    post({ type: 'failed', seq: msg.seq, reason: 'imagery' })
    return
  }
  surveyed = null
  try {
    // Seeds differ from site to site but never between two opens of the same site.
    const seedOffset = 1 + Math.floor(hash2(Math.round(msg.centre.lat * 1e5), Math.round(msg.centre.lng * 1e5), 7) * 1_000_000)
    sendBuilt(msg.seq, classes, seedOffset, generateLayout(classes))
  } catch {
    post({ type: 'failed', seq: msg.seq, reason: 'build' })
  }
}
