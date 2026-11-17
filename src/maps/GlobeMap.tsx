import { useEffect, useRef, useState, type ReactNode } from 'react'
import mapboxgl from 'mapbox-gl'
import { MAPBOX_TOKEN, MAP_STYLES, MapUnavailable, transformRequest, watchMapFailure } from './mapbox'
import { MALAYSIA_VIEW } from '../site/catalogue'

/** The zoom that frames all of Malaysia in the space beside the Sites panel, whatever the screen width. */
export function malaysiaZoom(width: number): number {
  return MALAYSIA_VIEW.zoom + Math.log2(Math.min(1.15, Math.max(0.45, (width - 420) / 1020)))
}

interface LabelState {
  hidden: string[]
  countries: { id: string; filter: mapboxgl.FilterSpecification | null | undefined }[]
}
const labels = new WeakMap<mapboxgl.Map, LabelState>()

/**
 * Place names on the globe. The Command Center hides town and state names and every country but Malaysia,
 * because its pins sit on top of them; the Location Picker shows them all so a place can be found.
 */
export function setPlaceLabels(map: mapboxgl.Map, show: boolean) {
  const st = labels.get(map)
  if (!st) return
  const onlyMalaysia = ['==', ['get', 'name_en'], 'Malaysia']
  for (const id of st.hidden) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', show ? 'visible' : 'none')
  for (const c of st.countries) {
    if (!map.getLayer(c.id)) continue
    map.setFilter(c.id, show ? c.filter ?? null : ((c.filter ? ['all', c.filter, onlyMalaysia] : onlyMalaysia) as mapboxgl.FilterSpecification))
  }
}

export function GlobeMap({ onReady, onFailed, padding, children }: {
  onReady(map: mapboxgl.Map | null): void
  onFailed?(): void
  padding: mapboxgl.PaddingOptions
  children?: ReactNode
}) {
  const host = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(!MAPBOX_TOKEN)

  useEffect(() => {
    if (!host.current || !MAPBOX_TOKEN) {
      onFailed?.()
      return
    }
    const fail = () => { setFailed(true); onFailed?.() }
    let map: mapboxgl.Map
    try {
      map = new mapboxgl.Map({
        container: host.current,
        style: MAP_STYLES.globe,
        transformRequest,
        projection: 'globe',
        center: MALAYSIA_VIEW.center,
        zoom: malaysiaZoom(host.current.clientWidth),
        attributionControl: false,
        logoPosition: 'bottom-right',
        preserveDrawingBuffer: true,
        dragRotate: false,
        pitchWithRotate: false,
        maxPitch: 0,
        cooperativeGestures: false,
      })
    } catch {
      fail()
      return
    }
    map.setPadding(padding)
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
    map.touchZoomRotate.disableRotation()
    map.on('style.load', () => {
      const st: LabelState = { hidden: [], countries: [] }
      for (const layer of map.getStyle().layers ?? []) {
        // Our pins sit on top of city names; hide settlement labels so none are half covered.
        if (layer.type === 'symbol' && /settlement|place-label|poi|state-label/.test(layer.id)) st.hidden.push(layer.id)
        // Only Malaysia is named: other country names would sit under the tiles or the pins.
        if (layer.type === 'symbol' && /country-label/.test(layer.id)) st.countries.push({ id: layer.id, filter: map.getFilter(layer.id) })
      }
      labels.set(map, st)
      setPlaceLabels(map, false)
      map.setFog({
        range: [0.8, 8],
        color: '#F4F8F6',
        'high-color': '#BFD7E3',
        'horizon-blend': 0.06,
        'space-color': '#EAF0ED',
        'star-intensity': 0,
      })
    })
    watchMapFailure(map, fail)
    map.once('load', () => onReady(map))
    if (import.meta.env.DEV) (window as unknown as { __globe: mapboxgl.Map }).__globe = map
    return () => {
      onReady(null)
      map.remove()
    }
    // The map is created once; padding changes are applied by the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="globe" data-testid="globe-map">
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      {failed && <MapUnavailable />}
      {children}
    </div>
  )
}
