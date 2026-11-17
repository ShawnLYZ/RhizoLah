// The Site Survey, part 2: the canopy classifier. Satellite pixels in, Canopy Map out.
// A pure function of the 500 x 500 RGBA image: colour and local texture only. No AI model, no randomness,
// no network. The result is an estimate: it follows the image's layout, it is not a survey.

import { CANOPY, MUD, morph, N, WATER } from './model'
import { components, distanceTo, maskOf } from './raster'

// Tuned once against Kuala Selangor's hand-traced Canopy Map, then fixed. These are constants, not settings.
const EXG_MIN = 0.1 // the vegetation threshold found by Otsu is clamped to this range
const EXG_MAX = 0.2
const LEAF_HUE_MAX = 2.3 // hue on a 0..6 wheel (2 is pure green, 3 is cyan): beyond this, green is sea, not leaves
const WATER_ROUGHNESS = 2 // brightness spread (5 x 5) below which a pixel counts as smooth
const WATER_GREEN_MAX = 0.25 // murky green water is smooth and only mildly green; above this it is foliage
const WATER_MAX_BRIGHTNESS = 170 // smooth areas brighter than this are sand, concrete or cloud, not water
const CREEK_DARKNESS = 0.8 // a creek is darker than this share of the image's typical open-ground brightness
const WATER_MIN_M2 = 600
const WATER_KEEP_M2 = 150
const CREEK_MIN_M2 = 400
const CREEK_ELONGATION = 4 // length at least four times width
const SHADOW_MAX_M2 = 40
const SPECK_M2 = 12
const ISLET_M2 = 300 // smaller bits of "land" standing in open water are wave streaks and boat wakes

/** Canopy share of the Footprint, 0..1. */
export function canopyFraction(classes: Uint8Array): number {
  let n = 0
  for (let i = 0; i < classes.length; i++) if (classes[i] === CANOPY) n++
  return n / classes.length
}

function boxMean(src: Float32Array, r: number): Float32Array {
  const tmp = new Float32Array(N * N)
  const out = new Float32Array(N * N)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let s = 0, c = 0
      for (let k = Math.max(0, x - r); k <= Math.min(N - 1, x + r); k++) { s += src[y * N + k]; c++ }
      tmp[y * N + x] = s / c
    }
  }
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let s = 0, c = 0
      for (let k = Math.max(0, y - r); k <= Math.min(N - 1, y + r); k++) { s += tmp[k * N + x]; c++ }
      out[y * N + x] = s / c
    }
  }
  return out
}

/** Otsu's threshold on values in [lo, hi]. */
function otsu(values: Float32Array, lo: number, hi: number): number {
  const BINS = 256
  const hist = new Float64Array(BINS)
  for (let i = 0; i < values.length; i++) {
    const b = Math.floor(((values[i] - lo) / (hi - lo)) * BINS)
    hist[Math.min(BINS - 1, Math.max(0, b))]++
  }
  let total = 0, sum = 0
  for (let b = 0; b < BINS; b++) { total += hist[b]; sum += hist[b] * b }
  let w0 = 0, s0 = 0, best = 0, bestVar = -1
  for (let b = 0; b < BINS; b++) {
    w0 += hist[b]
    if (w0 === 0) continue
    const w1 = total - w0
    if (w1 === 0) break
    s0 += hist[b] * b
    const m0 = s0 / w0, m1 = (sum - s0) / w1
    const v = w0 * w1 * (m0 - m1) * (m0 - m1)
    if (v > bestVar) { bestVar = v; best = b }
  }
  return lo + ((best + 1) / BINS) * (hi - lo)
}

function median(values: Float32Array, pick: Uint8Array): number {
  const hist = new Int32Array(256)
  let n = 0
  for (let i = 0; i < values.length; i++) if (pick[i]) { hist[Math.min(255, Math.max(0, Math.round(values[i])))]++; n++ }
  if (!n) return 0
  let acc = 0
  for (let b = 0; b < 256; b++) { acc += hist[b]; if (acc * 2 >= n) return b }
  return 255
}

/** Classifies every square metre as bare ground (MUD), CANOPY or WATER. Valid for any input. */
export function classifyCanopy(rgba: Uint8ClampedArray): Uint8Array {
  const P = N * N
  // 1. Smooth: a light 3 x 3 pass against compression noise.
  const raw = [new Float32Array(P), new Float32Array(P), new Float32Array(P)]
  for (let i = 0; i < P; i++) { raw[0][i] = rgba[i * 4]; raw[1][i] = rgba[i * 4 + 1]; raw[2][i] = rgba[i * 4 + 2] }
  const R = boxMean(raw[0], 1), G = boxMean(raw[1], 1), B = boxMean(raw[2], 1)

  // 2. Features: brightness, saturation, hue, normalised excess green, local roughness.
  const bright = new Float32Array(P)
  const exg = new Float32Array(P)
  const blueish = new Uint8Array(P)
  const leafy = new Uint8Array(P)
  for (let i = 0; i < P; i++) {
    const r = R[i], g = G[i], b = B[i]
    const sum = r + g + b
    bright[i] = sum / 3
    exg[i] = (2 * g - r - b) / (sum + 1)
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
    const sat = mx > 0 ? (mx - mn) / mx : 0
    let hue = 0
    if (mx > mn) {
      if (mx === r) hue = ((g - b) / (mx - mn) + 6) % 6
      else if (mx === g) hue = (b - r) / (mx - mn) + 2
      else hue = (r - g) / (mx - mn) + 4
    }
    // Blue-dominant: hue between cyan and blue-violet, with some colour in it.
    blueish[i] = sat > 0.08 && hue >= 2.9 && hue <= 4.4 ? 1 : 0
    leafy[i] = g >= r && g >= b && hue <= LEAF_HUE_MAX ? 1 : 0
  }
  const mean = boxMean(bright, 2)
  const sq = new Float32Array(P)
  for (let i = 0; i < P; i++) sq[i] = bright[i] * bright[i]
  const meanSq = boxMean(sq, 2)
  const rough = new Float32Array(P)
  for (let i = 0; i < P; i++) rough[i] = Math.sqrt(Math.max(0, meanSq[i] - mean[i] * mean[i]))

  // 3. Vegetation: green is the strongest channel (leaf green, not sea green) and excess green is above
  // the image's own threshold.
  const t = Math.min(EXG_MAX, Math.max(EXG_MIN, otsu(exg, -0.1, 0.4)))
  const classes = new Uint8Array(P)
  for (let i = 0; i < P; i++) classes[i] = leafy[i] && exg[i] > t ? CANOPY : MUD

  const notVeg = maskOf(classes, MUD)
  const typical = median(bright, notVeg)

  // 4. Water: blue-dominant or very smooth, in large connected areas, and not bright unless it is blue.
  // (Silty estuary water is often lighter than mud, and often greenish, so "smooth" is the cue, not "dark".)
  const smooth = new Uint8Array(P)
  for (let i = 0; i < P; i++) smooth[i] = blueish[i] || (rough[i] < WATER_ROUGHNESS && (notVeg[i] || exg[i] < WATER_GREEN_MAX)) ? 1 : 0
  {
    const c = components(morph(morph(smooth, 1, false), 1, true))
    const sumV = new Float64Array(c.count + 1), sumBlue = new Float64Array(c.count + 1)
    for (let i = 0; i < P; i++) {
      const l = c.labels[i]
      if (l) { sumV[l] += bright[i]; sumBlue[l] += blueish[i] }
    }
    for (let i = 0; i < P; i++) {
      const l = c.labels[i]
      if (!l || c.area[l] < WATER_MIN_M2) continue
      const blue = sumBlue[l] / c.area[l] > 0.5
      if (blue || sumV[l] / c.area[l] < WATER_MAX_BRIGHTNESS) classes[i] = WATER
    }
  }

  // Tidal creeks: dark, narrow, elongated gaps running through canopy.
  {
    const gap = new Uint8Array(P)
    for (let i = 0; i < P; i++) gap[i] = classes[i] === MUD && bright[i] < CREEK_DARKNESS * typical ? 1 : 0
    const c = components(gap)
    const inside = distanceTo(maskOf(gap, 0))
    const half = new Float32Array(c.count + 1)
    const touch = new Int32Array(c.count + 1), border = new Int32Array(c.count + 1)
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const p = y * N + x
        const l = c.labels[p]
        if (!l) continue
        if (inside[p] > half[l]) half[l] = inside[p]
        const around = [x > 0 ? p - 1 : -1, x < N - 1 ? p + 1 : -1, y > 0 ? p - N : -1, y < N - 1 ? p + N : -1]
        for (const q of around) {
          if (q < 0 || c.labels[q] === l) continue
          border[l]++
          if (classes[q] === CANOPY) touch[l]++
        }
      }
    }
    for (let i = 0; i < P; i++) {
      const l = c.labels[i]
      if (!l || c.area[l] < CREEK_MIN_M2) continue
      const width = 2 * half[l]
      const length = c.area[l] / width
      if (length >= CREEK_ELONGATION * width && touch[l] >= 0.5 * border[l]) classes[i] = WATER
    }
  }

  // 6. Shadow repair: small dark holes fully surrounded by canopy are shadows between crowns.
  {
    let sum = 0, n = 0
    for (let i = 0; i < P; i++) if (classes[i] === CANOPY) { sum += bright[i]; n++ }
    const canopyBright = n ? sum / n : 0
    const hole = new Uint8Array(P)
    for (let i = 0; i < P; i++) hole[i] = classes[i] === CANOPY ? 0 : 1
    const c = components(hole)
    const enclosed = new Uint8Array(c.count + 1).fill(1)
    const sumV = new Float64Array(c.count + 1)
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const p = y * N + x
        const l = c.labels[p]
        if (!l) continue
        sumV[l] += bright[p]
        // Components of "not canopy" only ever border canopy, so enclosed means: not at the tile edge.
        if (c.edge[l]) enclosed[l] = 0
      }
    }
    for (let i = 0; i < P; i++) {
      const l = c.labels[i]
      if (l && enclosed[l] && c.area[l] < SHADOW_MAX_M2 && sumV[l] / c.area[l] < canopyBright) classes[i] = CANOPY
    }
  }

  // 7. Clean-up: majority filter, specks, small ponds, islets, then a 1 m open-and-close on the canopy edge.
  const voted = new Uint8Array(P)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const votes = [0, 0, 0]
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(N - 1, Math.max(0, x + dx)), yy = Math.min(N - 1, Math.max(0, y + dy))
          votes[classes[yy * N + xx]]++
        }
      }
      const own = classes[y * N + x]
      let best = own
      for (let k = 0; k < 3; k++) if (votes[k] > votes[best]) best = k
      voted[y * N + x] = best
    }
  }
  {
    const c = components(maskOf(voted, CANOPY))
    for (let i = 0; i < P; i++) if (c.labels[i] && c.area[c.labels[i]] < SPECK_M2) voted[i] = MUD
  }
  {
    const c = components(maskOf(voted, WATER))
    for (let i = 0; i < P; i++) if (c.labels[i] && c.area[c.labels[i]] < WATER_KEEP_M2) voted[i] = MUD
  }
  {
    // Land (anything not water) is only ever bordered by water, so a small piece away from the tile edge is an islet.
    const land = new Uint8Array(P)
    for (let i = 0; i < P; i++) land[i] = voted[i] === WATER ? 0 : 1
    const c = components(land)
    for (let i = 0; i < P; i++) {
      const l = c.labels[i]
      if (l && !c.edge[l] && c.area[l] < ISLET_M2) voted[i] = WATER
    }
  }
  const canopy = maskOf(voted, CANOPY)
  const tidy = morph(morph(morph(morph(canopy, 1, false), 1, true), 1, true), 1, false)
  for (let i = 0; i < P; i++) {
    if (voted[i] === CANOPY && !tidy[i]) voted[i] = MUD
    else if (voted[i] === MUD && tidy[i]) voted[i] = CANOPY
  }
  return voted
}
