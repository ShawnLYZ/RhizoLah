// The Site Survey, part 1: reading live Mapbox Satellite pixels for a Footprint.
// Runs in the forest Web Worker. The pixels live in memory only while a site is surveyed and built:
// nothing here is ever written to localStorage, IndexedDB or a file.

import { HALF, M_PER_DEG_LAT, type LatLng } from '../geo/geo'

const TILE_PX = 512 // a 256 px tile at double density
const EQUATOR_M_PER_PX = 156_543.033_928 / 2 // at zoom 0, for a 512 px tile
const OUT = HALF * 2 // 500 output pixels, 1 m each

/** The lowest zoom at which the double-density imagery is 1.0 m per pixel or finer (0.5 to 1.0 m). */
export function surveyZoom(lat: number): number {
  const res0 = EQUATOR_M_PER_PX * Math.cos((lat * Math.PI) / 180)
  return Math.max(0, Math.ceil(Math.log2(res0)))
}

/** The same imagery the maps show, from the Static Tiles route that works without a payment method. */
function tileUrl(z: number, x: number, y: number, token: string): string {
  return `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/256/${z}/${x}/${y}@2x?access_token=${token}`
}

async function fetchTile(url: string): Promise<ImageBitmap> {
  const res = await fetch(url, { mode: 'cors' })
  if (!res.ok) throw new Error(`tile ${res.status}`)
  return createImageBitmap(await res.blob())
}

/**
 * Fetches the tiles under the Footprint (at most 3 x 3) and resamples them into one 500 x 500 RGBA image
 * at exactly 1 m per pixel: north up, row 0 in the north, aligned to the Site's local frame.
 * Each output pixel is the area average of the source pixels under it. Throws when the imagery cannot be read.
 */
export async function fetchFootprintPixels(centre: LatLng, token: string): Promise<Uint8ClampedArray> {
  const z = surveyZoom(centre.lat)
  const world = TILE_PX * 2 ** z
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((centre.lat * Math.PI) / 180)
  const px = (lng: number) => ((lng + 180) / 360) * world
  const py = (lat: number) => {
    const s = Math.sin((lat * Math.PI) / 180)
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * world
  }

  // Source pixel position of every output column and row edge.
  const ex = new Float64Array(OUT + 1)
  const ey = new Float64Array(OUT + 1)
  for (let i = 0; i <= OUT; i++) {
    ex[i] = px(centre.lng + (i - HALF) / mPerDegLng)
    ey[i] = py(centre.lat - (i - HALF) / M_PER_DEG_LAT)
  }

  const tx0 = Math.floor(ex[0] / TILE_PX), tx1 = Math.floor((ex[OUT] - 1e-6) / TILE_PX)
  const ty0 = Math.floor(ey[0] / TILE_PX), ty1 = Math.floor((ey[OUT] - 1e-6) / TILE_PX)
  const nx = tx1 - tx0 + 1, ny = ty1 - ty0 + 1
  const perRow = 2 ** z
  const jobs: Promise<ImageBitmap>[] = []
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const wrapped = ((tx % perRow) + perRow) % perRow
      jobs.push(fetchTile(tileUrl(z, wrapped, Math.min(perRow - 1, Math.max(0, ty)), token)))
    }
  }
  const tiles = await Promise.all(jobs)

  const W = nx * TILE_PX, H = ny * TILE_PX
  const canvas = new OffscreenCanvas(W, H)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('no 2d context')
  tiles.forEach((bmp, k) => {
    ctx.drawImage(bmp, (k % nx) * TILE_PX, Math.floor(k / nx) * TILE_PX, TILE_PX, TILE_PX)
    bmp.close()
  })
  const src = ctx.getImageData(0, 0, W, H).data
  const ox = tx0 * TILE_PX, oy = ty0 * TILE_PX

  const out = new Uint8ClampedArray(OUT * OUT * 4)
  for (let j = 0; j < OUT; j++) {
    const y0 = ey[j] - oy, y1 = ey[j + 1] - oy
    const ya = Math.max(0, Math.floor(y0)), yb = Math.min(H - 1, Math.ceil(y1) - 1)
    for (let i = 0; i < OUT; i++) {
      const x0 = ex[i] - ox, x1 = ex[i + 1] - ox
      const xa = Math.max(0, Math.floor(x0)), xb = Math.min(W - 1, Math.ceil(x1) - 1)
      let r = 0, g = 0, b = 0, wsum = 0
      for (let y = ya; y <= yb; y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0)
        if (wy <= 0) continue
        for (let x = xa; x <= xb; x++) {
          const w = (Math.min(x + 1, x1) - Math.max(x, x0)) * wy
          if (w <= 0) continue
          const p = (y * W + x) * 4
          r += src[p] * w; g += src[p + 1] * w; b += src[p + 2] * w
          wsum += w
        }
      }
      const o = (j * OUT + i) * 4
      if (wsum > 0) { out[o] = r / wsum; out[o + 1] = g / wsum; out[o + 2] = b / wsum }
      out[o + 3] = 255
    }
  }
  return out
}
