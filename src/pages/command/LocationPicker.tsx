import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Info, LoaderCircle, Satellite } from 'lucide-react'
import { setPlaceLabels } from '../../maps/GlobeMap'
import { MAP_UNAVAILABLE } from '../../maps/mapbox'
import { formatLat, formatLatLng, formatLng, HALF } from '../../geo/geo'
import { surveySquare } from '../../forest/forestData'
import { useApp } from '../../state/store'
import { navigate } from '../../app/router'
import { prefersReducedMotion } from '../../ui/hooks'
import { handOver, metresPerPixel, zoomFor } from './flight'

const SIDE_M = HALF * 2
const MIN_SQUARE_PX = 80 // the Selection Square shows once it is at least this wide on screen
const MIN_CANOPY = 0.05 // under 5% tree cover there is no forest to model
const NAME_MAX = 40
const FLY_MS = 2500

/**
 * The Location Picker: the Command Center's globe, turned into a place chooser.
 * Click a place to fly down; a fixed 500 x 500 m square stays in the middle while the map slides under it.
 */
export function LocationPicker({ map, onCancel, onBusy }: { map: mapboxgl.Map; onCancel(): void; onBusy(busy: boolean): void }) {
  const [view, setView] = useState(() => ({ lat: map.getCenter().lat, lng: map.getCenter().wrap().lng, zoom: map.getZoom() }))
  const [name, setName] = useState('')
  const [typed, setTyped] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<'none' | 'unavailable' | null>(null)
  const hint = useRef<HTMLDivElement>(null)
  const alive = useRef(true)
  const cancel = useRef(onCancel)
  cancel.current = onCancel
  const nameId = useId()

  useEffect(() => {
    alive.current = true
    hint.current?.focus()
    setPlaceLabels(map, true)
    // The Sites panel is gone, so the globe sits in the middle of the screen.
    map.easeTo({ padding: { top: 0, left: 0, right: 0, bottom: 0 }, duration: prefersReducedMotion() ? 0 : 600 })
    const onMove = () => {
      const c = map.getCenter().wrap()
      setView({ lat: c.lat, lng: c.lng, zoom: map.getZoom() })
      setMessage(null)
    }
    const onClick = (e: mapboxgl.MapMouseEvent) => {
      const el = map.getContainer()
      // Down to where the square fills about 60% of the shorter side of the screen; never back out.
      // (and always leaves room below it for its label and the bar)
      const target = zoomFor(e.lngLat.lat, SIDE_M, Math.min(0.6 * Math.min(el.clientWidth, el.clientHeight), el.clientHeight - 280))
      const to = { center: e.lngLat, zoom: Math.min(map.getMaxZoom(), Math.max(map.getZoom(), target)), bearing: 0, pitch: 0 }
      if (prefersReducedMotion()) map.jumpTo(to)
      else map.flyTo({ ...to, duration: FLY_MS, essential: true })
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) cancel.current()
    }
    map.on('move', onMove)
    map.on('click', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      alive.current = false
      map.off('move', onMove)
      map.off('click', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [map])

  const sidePx = SIDE_M / metresPerPixel(view.lat, view.zoom)
  const square = sidePx >= MIN_SQUARE_PX
  const autoName = `Site at ${formatLat(view.lat, 2)}, ${formatLng(view.lng, 2)}`

  const use = async () => {
    if (busy) return
    const c = map.getCenter().wrap()
    const centre = { lat: c.lat, lng: c.lng }
    setBusy(true)
    onBusy(true)
    setMessage(null)
    const result = await surveySquare(centre)
    if (!alive.current) return
    if (!result.ok || result.canopyFraction < MIN_CANOPY) {
      setBusy(false)
      onBusy(false)
      setMessage(result.ok ? 'none' : 'unavailable')
      return
    }
    // Saved, made the Current Site, and built from the Canopy Map the worker already holds.
    useApp.getState().addLocation((typed && name.trim().slice(0, NAME_MAX).trim()) || autoName, centre, result.areaM2)
    if (prefersReducedMotion()) navigate('satellite', 'slow-fade')
    else handOver(map)
  }

  return (
    <>
      {createPortal(
        square && (
          <>
            <div className="pick-scrim" style={{ ['--half' as string]: `${sidePx / 2}px` }} />
            <div className="pick-square" style={{ width: sidePx, height: sidePx }} data-testid="picker-square">
              <span className="pick-chip num">500 × 500 m</span>
            </div>
          </>
        ),
        map.getCanvasContainer(),
      )}
      <div className="view-hint pick-hint" ref={hint} tabIndex={-1} role="status" data-testid="picker-hint">
        Drag to turn the globe · Click a place to zoom in
      </div>
      <div className="pick-bar float" role="group" aria-label="Add Location">
        {square && (
          <>
            <div className="pick-field">
              <label htmlFor={nameId}>Name</label>
              <input
                id={nameId}
                type="text"
                value={typed ? name : autoName}
                maxLength={NAME_MAX}
                disabled={busy}
                onChange={(e) => { setTyped(true); setName(e.target.value) }}
                onBlur={() => { if (!name.trim()) setTyped(false) }}
                onKeyDown={(e) => { if (e.key === 'Enter') void use() }}
                data-testid="picker-name"
              />
            </div>
            <div className="pick-coords num" aria-label="Centre of the square">{formatLatLng({ lat: view.lat, lng: view.lng }, 4)}</div>
            <button className="btn btn-primary" onClick={() => void use()} disabled={busy} aria-busy={busy} data-testid="picker-use">
              {busy ? <><LoaderCircle size={18} className="spin" /> Reading the satellite image…</> : <><Check size={18} /> Use this area</>}
            </button>
          </>
        )}
        <button className="btn" onClick={onCancel} disabled={busy} data-testid="picker-cancel">Cancel</button>
        <div className="pick-message" role="status" aria-live="polite" data-testid="picker-message">
          {message === 'none' && <><Info size={19} /> No forest found in this square. Move the map and try again.</>}
          {message === 'unavailable' && <><Satellite size={19} /> {MAP_UNAVAILABLE}</>}
        </div>
      </div>
    </>
  )
}
