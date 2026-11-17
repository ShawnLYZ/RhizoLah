// The Site Layout generator: where the station (the live post), the other sensor posts and the Replant Patches go
// in a Generated Site. A pure function of the Canopy Map: the same map always gives the same layout.

import { CANOPY, MUD, morph, N, WATER } from './model'
import { components, distanceTo, maskOf } from './raster'
import type { PatchId, ReplantPatch, SensorPost, SiteLayout } from '../site/catalogue'

const HALF = N / 2
const INSIDE_CANOPY_M = 6 // posts stand at least this far inside the canopy edge
const FROM_TILE_EDGE_M = 30
const MAX_POSTS = 10
/** The number the live post (the station) carries. */
const LIVE_POST_NO = 9
const POST_SPACING_M = 60
const PATCH_MIN_M2 = 300
const PATCH_MAX_M2 = 12_000
const PATCH_ENCLOSED = 0.6 // share of a patch's surroundings that must be canopy
const MAX_PATCHES = 3

/** Local metres of a pixel's centre. */
const local = (p: number) => ({ x: (p % N) + 0.5 - HALF, z: Math.floor(p / N) + 0.5 - HALF })

function candidates(classes: Uint8Array, inside: Float32Array, minInside: number, minEdge: number, anyLand: boolean): number[] {
  const out: number[] = []
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const p = y * N + x
      if (Math.min(x, y, N - 1 - x, N - 1 - y) < minEdge) continue
      if (anyLand ? classes[p] === WATER : classes[p] !== CANOPY || inside[p] < minInside) continue
      out.push(p)
    }
  }
  return out
}

/** The largest connected part of a mask (the first one in scan order when equal). Empty in, empty out. */
function largest(mask: Uint8Array): Uint8Array {
  const c = components(mask)
  let big = 0
  for (let l = 1; l <= c.count; l++) if (!big || c.area[l] > c.area[big]) big = l
  const out = new Uint8Array(N * N)
  if (big) for (let i = 0; i < N * N; i++) out[i] = c.labels[i] === big ? 1 : 0
  return out
}

/** The pixel with the smallest score; ties go to the first in scan order. */
function closest(cand: number[], score: (p: number) => number): number {
  let best = cand[0], bestS = Infinity
  for (const p of cand) {
    const s = score(p)
    if (s < bestS) { bestS = s; best = p }
  }
  return best
}

/** Walks the outer boundary of a labelled component along pixel edges; returns corner points in pixel units. */
function traceOutline(labels: Int32Array, label: number, start: number): number[] {
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && labels[y * N + x] === label
  // Directions: 0 east, 1 south, 2 west, 3 north. The component is kept on the right-hand side.
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1]
  const ahead = (vx: number, vy: number, d: number): [boolean, boolean] => {
    // [ahead-left, ahead-right] cells of the vertex (vx, vy) for heading d.
    if (d === 0) return [inside(vx, vy - 1), inside(vx, vy)]
    if (d === 1) return [inside(vx, vy), inside(vx - 1, vy)]
    if (d === 2) return [inside(vx - 1, vy), inside(vx - 1, vy - 1)]
    return [inside(vx - 1, vy - 1), inside(vx, vy - 1)]
  }
  const x0 = start % N, y0 = Math.floor(start / N)
  let vx = x0, vy = y0, d = 0
  const pts: number[] = [vx, vy]
  for (let guard = 0; guard < N * N * 4; guard++) {
    vx += DX[d]; vy += DY[d]
    if (vx === x0 && vy === y0) break
    const [left, right] = ahead(vx, vy, d)
    const nd = !right ? (d + 1) % 4 : left ? (d + 3) % 4 : d
    if (nd !== d) { pts.push(vx, vy); d = nd }
  }
  return pts
}

/** Douglas-Peucker on a closed ring of [x0, y0, x1, y1, ...]. */
function simplify(ring: number[], tolerance: number): number[] {
  const n = ring.length / 2
  if (n <= 4) return ring
  // Split the ring at its first point and the point farthest from it.
  let far = 0, farD = -1
  for (let i = 1; i < n; i++) {
    const d = (ring[i * 2] - ring[0]) ** 2 + (ring[i * 2 + 1] - ring[1]) ** 2
    if (d > farD) { farD = d; far = i }
  }
  const keep = new Uint8Array(n + 1)
  keep[0] = keep[far] = keep[n] = 1
  const at = (i: number) => [ring[(i % n) * 2], ring[(i % n) * 2 + 1]]
  const stack: [number, number][] = [[0, far], [far, n]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [ax, ay] = at(a), [bx, by] = at(b)
    const len = Math.hypot(bx - ax, by - ay) || 1
    let worst = -1, worstD = tolerance
    for (let i = a + 1; i < b; i++) {
      const [px, py] = at(i)
      const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len
      if (d > worstD) { worstD = d; worst = i }
    }
    if (worst > 0) { keep[worst] = 1; stack.push([a, worst], [worst, b]) }
  }
  const out: number[] = []
  for (let i = 0; i < n; i++) if (keep[i]) out.push(ring[i * 2], ring[i * 2 + 1])
  return out
}

function replantPatches(classes: Uint8Array): ReplantPatch[] {
  // Bare ground (never water), opened by 2 m so thin paths do not join clearings together.
  const bare = morph(morph(maskOf(classes, MUD), 2, false), 2, true)
  for (let i = 0; i < N * N; i++) if (classes[i] !== MUD) bare[i] = 0
  const c = components(bare)
  // How much of each clearing's surroundings (a 3 m ring) is canopy.
  const ringArea = new Int32Array(c.count + 1), ringCanopy = new Int32Array(c.count + 1)
  const first = new Int32Array(c.count + 1).fill(-1)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const p = y * N + x
      if (c.labels[p]) { if (first[c.labels[p]] < 0) first[c.labels[p]] = p; continue }
      const seen: number[] = []
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (dx * dx + dy * dy > 9) continue
          const xx = x + dx, yy = y + dy
          if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue
          const l = c.labels[yy * N + xx]
          if (l && !seen.includes(l)) seen.push(l)
        }
      }
      for (const l of seen) { ringArea[l]++; if (classes[p] === CANOPY) ringCanopy[l]++ }
    }
  }
  const picked: number[] = []
  for (let l = 1; l <= c.count; l++) {
    if (c.edge[l] || c.area[l] < PATCH_MIN_M2 || c.area[l] > PATCH_MAX_M2) continue
    if (ringCanopy[l] < PATCH_ENCLOSED * ringArea[l]) continue
    picked.push(l)
  }
  // Largest first; equal areas keep scan order.
  picked.sort((a, b) => c.area[b] - c.area[a] || a - b)
  const depth = distanceTo(maskOf(bare, 0))
  return picked.slice(0, MAX_PATCHES).map((l, k) => {
    // The centre is the point deepest inside the patch, so it always lies in it.
    let centre = first[l], deepest = -1
    for (let p = 0; p < N * N; p++) if (c.labels[p] === l && depth[p] > deepest) { deepest = depth[p]; centre = p }
    const ring = simplify(traceOutline(c.labels, l, first[l]), 1).map((v) => v - HALF)
    return { id: `patch-${k + 1}` as PatchId, ring, areaM2: c.area[l], centroid: local(centre) }
  })
}

export function generateLayout(classes: Uint8Array): SiteLayout {
  const canopy = maskOf(classes, CANOPY)
  const water = maskOf(classes, WATER)
  let hasWater = false, hasCanopy = false
  for (let i = 0; i < N * N; i++) { if (water[i]) hasWater = true; if (canopy[i]) hasCanopy = true }
  const inside = hasCanopy ? distanceTo(maskOf(canopy, 0)) : new Float32Array(N * N)

  // Candidate spots, relaxing the rules in steps so every site gets a station.
  let cand = candidates(classes, inside, INSIDE_CANOPY_M, FROM_TILE_EDGE_M, false)
  if (!cand.length) cand = candidates(classes, inside, 1, FROM_TILE_EDGE_M, false)
  if (!cand.length) cand = candidates(classes, inside, 1, 0, false)
  const onCanopy = cand.length > 0
  if (!cand.length) cand = candidates(classes, inside, 0, 0, true)

  const centre = (p: number) => { const q = local(p); return q.x * q.x + q.z * q.z }
  let stationPx: number
  if (!cand.length) stationPx = HALF * N + HALF
  else if (!onCanopy) stationPx = closest(cand, centre)
  else if (hasWater) {
    // Beside the main body of water (the largest one), not a stray pond.
    const d = distanceTo(largest(water))
    stationPx = closest(cand, (p) => d[p])
  } else {
    // No water: stand beside the largest clearing instead.
    const clearing = largest(maskOf(classes, MUD))
    let any = false
    for (let i = 0; i < N * N && !any; i++) any = clearing[i] === 1
    if (any) {
      const d = distanceTo(clearing)
      stationPx = closest(cand, (p) => d[p])
    } else stationPx = closest(cand, centre)
  }

  // Other posts: farthest-point sampling, while a new post can still be 60 m from every other.
  const chosen = [stationPx]
  if (onCanopy) {
    const nearest = new Float32Array(cand.length).fill(Infinity)
    let last = stationPx
    while (chosen.length < MAX_POSTS) {
      const a = local(last)
      let best = -1, bestD = POST_SPACING_M * POST_SPACING_M
      for (let k = 0; k < cand.length; k++) {
        const b = local(cand[k])
        const d = (a.x - b.x) ** 2 + (a.z - b.z) ** 2
        if (d < nearest[k]) nearest[k] = d
        if (nearest[k] >= bestD && (nearest[k] > bestD || best < 0)) { bestD = nearest[k]; best = k }
      }
      if (best < 0) break
      last = cand[best]
      chosen.push(last)
    }
  }
  const station = local(stationPx)
  // The station is Sensor post 9 (or the last number when there are fewer posts); the others take the remaining
  // numbers in reading order: north to south, then west to east.
  const others = chosen.slice(1).map(local).sort((a, b) => a.z - b.z || a.x - b.x)
  const liveNo = Math.min(LIVE_POST_NO, chosen.length)
  const post = (p: { x: number; z: number }, no: number, live: boolean): SensorPost =>
    ({ id: `post-${no}`, name: `Sensor post ${no}`, x: p.x, z: p.z, live })
  const posts: SensorPost[] = others.map((p, k) => post(p, k + 1 < liveNo ? k + 1 : k + 2, false))
  posts.splice(liveNo - 1, 0, post(station, liveNo, true))
  return { station, posts, patches: replantPatches(classes), hasWater }
}
