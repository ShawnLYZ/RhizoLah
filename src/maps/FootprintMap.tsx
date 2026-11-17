import { useEffect, useRef, useState, type ReactNode } from 'react'
import mapboxgl from 'mapbox-gl'
import { Camera } from 'lucide-react'
import { MAPBOX_TOKEN, MAP_STYLES, MapMarker, MapUnavailable, transformRequest, watchMapFailure } from './mapbox'
import type { SiteFrame } from '../geo/geo'
import { liveName, type PatchId, type ReplantPatch, type SiteLayout } from '../site/catalogue'
import type { Handover } from '../app/handover'
import { prefersReducedMotion } from '../ui/hooks'

const MARGIN = 0.004
/** Scan Glow: the scan's colour, and the colour of the Replant Areas it found. */
const SCAN_GLOW = '#7CF2D8'

export interface FootprintMapProps {
  /** The Site's coordinate frame. The map is created for it once: give the map a `key` per Site. */
  frame: SiteFrame
  /** The Site's layout, once its forest is built: the station marker and the patches come from it. */
  layout?: SiteLayout | null
  padding?: number
  interactive?: boolean
  handover?: Handover | null
  showStation?: boolean
  stationDanger?: boolean
  /** The Site's Replant Areas, drawn in mint. */
  planted?: PatchId[]
  highlight?: PatchId | null
  onReady?(map: mapboxgl.Map): void
  children?: ReactNode
}

const NO_PATCHES: readonly ReplantPatch[] = []

function patchFeatures(frame: SiteFrame, patches: readonly ReplantPatch[], ids: PatchId[]) {
  return {
    type: 'FeatureCollection' as const,
    features: patches.filter((p) => ids.includes(p.id)).map((p) => ({
      type: 'Feature' as const,
      properties: { id: p.id },
      geometry: { type: 'Polygon' as const, coordinates: [frame.ringToLngLat(p.ring)] },
    })),
  }
}

/** The real satellite image of the Site's 500 x 500 m Footprint: north-up, no tilt, thin white outline. */
export function FootprintMap({
  frame, layout, padding = 24, interactive = true, handover, showStation, stationDanger, planted = [], highlight = null, onReady, children,
}: FootprintMapProps) {
  const host = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<mapboxgl.Map | null>(null)
  const [failed, setFailed] = useState(!MAPBOX_TOKEN)
  const [imgGone, setImgGone] = useState(false)
  const [image] = useState(handover?.image ?? null)
  const patches = layout?.patches ?? NO_PATCHES
  const station = showStation && layout ? frame.toLatLng(layout.station.x, layout.station.z) : null

  useEffect(() => {
    if (!host.current || !MAPBOX_TOKEN) return
    const el = host.current
    const [w, s, e, n] = frame.bounds
    let start: Partial<mapboxgl.MapOptions> = { bounds: [w, s, e, n], fitBoundsOptions: { padding } }
    if (handover) {
      const scale = Math.max(el.clientWidth / handover.width, el.clientHeight / handover.height)
      start = { center: handover.center, zoom: handover.zoom + Math.log2(scale) }
    }
    let m: mapboxgl.Map
    try {
      m = new mapboxgl.Map({
        container: el,
        style: MAP_STYLES.satellite,
        transformRequest,
        ...start,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        maxPitch: 0,
        bearing: 0,
        interactive,
        ...(interactive ? { maxBounds: [w - MARGIN, s - MARGIN, e + MARGIN, n + MARGIN] as [number, number, number, number] } : {}),
      })
    } catch {
      setFailed(true)
      return
    }
    m.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
    m.addControl(new mapboxgl.ScaleControl({ unit: 'metric', maxWidth: 120 }), 'bottom-left')
    m.touchZoomRotate.disableRotation()
    m.keyboard.disableRotation()
    watchMapFailure(m, () => setFailed(true))
    m.on('load', () => {
      m.addSource('footprint', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: frame.ring } },
      })
      m.addLayer({ id: 'footprint', type: 'line', source: 'footprint', paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-opacity': 0.95 } })
      m.addSource('patches', { type: 'geojson', data: patchFeatures(frame, patches, []) })
      // Replant Areas: Scan Glow mint, a solid outline and a fill, so they read from across the room.
      m.addLayer({ id: 'patches-fill', type: 'fill', source: 'patches', paint: { 'fill-color': SCAN_GLOW, 'fill-opacity': 0.35 } })
      m.addLayer({ id: 'patches-line', type: 'line', source: 'patches', paint: { 'line-color': SCAN_GLOW, 'line-width': 3 } })
      m.addSource('target', { type: 'geojson', data: patchFeatures(frame, patches, []) })
      m.addLayer({ id: 'target-fill', type: 'fill', source: 'target', paint: { 'fill-color': SCAN_GLOW, 'fill-opacity': 0.28 } })
      m.addLayer({ id: 'target-line', type: 'line', source: 'target', paint: { 'line-color': SCAN_GLOW, 'line-width': 3 } })
      setMap(m)
      onReady?.(m)
      if (handover) {
        const reveal = () => {
          setImgGone(true)
          m.fitBounds([w, s, e, n], { padding, duration: prefersReducedMotion() ? 0 : 1400, essential: true })
        }
        const t = setTimeout(reveal, 2500)
        m.once('idle', () => { clearTimeout(t); reveal() })
      }
    })
    // Keep the Footprint framed when the panel changes size, until the visitor moves the map.
    let moved = false
    m.on('dragstart', () => { moved = true })
    m.on('zoomstart', (ev) => { if ((ev as { originalEvent?: Event }).originalEvent) moved = true })
    const ro = new ResizeObserver(() => {
      m.resize()
      if (!moved && !handover) m.fitBounds([w, s, e, n], { padding, duration: 0 })
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      m.remove()
      setMap(null)
    }
    // Created once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Replant Areas, in mint.
  const plantedKey = planted.join(',')
  useEffect(() => {
    const src = map?.getSource('patches') as mapboxgl.GeoJSONSource | undefined
    src?.setData(patchFeatures(frame, patches, planted))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, patches, plantedKey])

  // The scan target pulses.
  useEffect(() => {
    if (!map) return
    const src = map.getSource('target') as mapboxgl.GeoJSONSource | undefined
    src?.setData(patchFeatures(frame, patches, highlight ? [highlight] : []))
    if (!highlight) return
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = (Math.sin(((now - t0) / 1000) * Math.PI * 1.6) + 1) / 2
      if (map.getLayer('target-line')) {
        map.setPaintProperty('target-line', 'line-width', 2.5 + p * 3.5)
        map.setPaintProperty('target-fill', 'fill-opacity', 0.18 + p * 0.22)
      }
      raf = requestAnimationFrame(tick)
    }
    if (!prefersReducedMotion()) raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, patches, highlight])

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      {image && <img className={`handover-img ${imgGone ? 'gone' : ''}`} src={image} alt="" />}
      {failed && <MapUnavailable />}
      {map && station && (
        <MapMarker map={map} lngLat={[station.lng, station.lat]}>
          <div className={`marker-station ${stationDanger ? 'danger' : ''}`} title={layout ? liveName(layout.posts) : undefined}>
            <Camera size={16} strokeWidth={2.4} />
          </div>
        </MapMarker>
      )}
      {map && children}
    </div>
  )
}
