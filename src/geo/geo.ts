// Local metres <-> latitude/longitude for a Site's Footprint.
// x runs east and z runs south, in metres from the Footprint centre.

export interface LatLng {
  lat: number
  lng: number
}

export const M_PER_DEG_LAT = 111_320
export const HALF = 250

/** The coordinate frame of one Site: a simple equirectangular projection around its centre. */
export interface SiteFrame {
  centre: LatLng
  toLatLng(x: number, z: number): LatLng
  toLocal(p: LatLng): { x: number; z: number }
  /** The Footprint's bounding box as [west, south, east, north]. */
  bounds: [number, number, number, number]
  /** The Footprint outline as a closed GeoJSON ring of [lng, lat]. */
  ring: [number, number][]
  /** Converts a flat local ring [x0, z0, x1, z1, ...] into a closed GeoJSON ring. */
  ringToLngLat(ring: readonly number[]): [number, number][]
}

export function siteFrame(centre: LatLng): SiteFrame {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((centre.lat * Math.PI) / 180)
  const toLatLng = (x: number, z: number): LatLng => ({ lat: centre.lat - z / M_PER_DEG_LAT, lng: centre.lng + x / mPerDegLng })
  const toLocal = (p: LatLng) => ({ x: (p.lng - centre.lng) * mPerDegLng, z: (centre.lat - p.lat) * M_PER_DEG_LAT })
  const sw = toLatLng(-HALF, HALF)
  const ne = toLatLng(HALF, -HALF)
  return {
    centre,
    toLatLng,
    toLocal,
    bounds: [sw.lng, sw.lat, ne.lng, ne.lat],
    ring: [
      [sw.lng, ne.lat],
      [ne.lng, ne.lat],
      [ne.lng, sw.lat],
      [sw.lng, sw.lat],
      [sw.lng, ne.lat],
    ],
    ringToLngLat(ring) {
      const out: [number, number][] = []
      for (let i = 0; i < ring.length; i += 2) {
        const p = toLatLng(ring[i], ring[i + 1])
        out.push([p.lng, p.lat])
      }
      if (out.length) out.push(out[0])
      return out
    },
  }
}

export function formatLat(lat: number, digits = 6): string {
  return `${Math.abs(lat).toFixed(digits)}° ${lat >= 0 ? 'N' : 'S'}`
}

export function formatLng(lng: number, digits = 6): string {
  return `${Math.abs(lng).toFixed(digits)}° ${lng >= 0 ? 'E' : 'W'}`
}

export function formatLatLng(p: LatLng, digits = 6): string {
  return `${formatLat(p.lat, digits)}, ${formatLng(p.lng, digits)}`
}

/** Whether local point (x, z) lies inside a flat local ring [x0, z0, x1, z1, ...] (even-odd rule). */
export function pointInRing(ring: readonly number[], x: number, z: number): boolean {
  let inside = false
  const n = ring.length / 2
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i * 2], zi = ring[i * 2 + 1], xj = ring[j * 2], zj = ring[j * 2 + 1]
    if ((zi > z) !== (zj > z) && x < xi + ((z - zi) / (zj - zi)) * (xj - xi)) inside = !inside
  }
  return inside
}
