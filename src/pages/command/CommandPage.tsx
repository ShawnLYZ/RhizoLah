import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Check, HeartPulse, MapPinPlus, Navigation, Trash2, Trees, X } from 'lucide-react'
import { GlobeMap, malaysiaZoom, setPlaceLabels } from '../../maps/GlobeMap'
import { MapMarker } from '../../maps/mapbox'
import { comingSoonSites, liveSites, MALAYSIA_VIEW, type Site } from '../../site/catalogue'
import { cameraOnline, currentSite, lastHeard, useApp } from '../../state/store'
import { retrySite, useSite } from '../../forest/forestData'
import { BandIcon, BAND_WORD, StatusChip, Toast } from '../../ui/components'
import { formatArea, timeAgo } from '../../ui/time'
import { navigate } from '../../app/router'
import { prefersReducedMotion } from '../../ui/hooks'
import { flyZoom, handOver } from './flight'
import { LocationPicker } from './LocationPicker'

const FLY_MS = 3000
const PADDING: mapboxgl.PaddingOptions = { top: 150, left: 420, right: 20, bottom: 20 }
const SOON = comingSoonSites()

/** Mangrove area per Site: from the built forest when the Site is current, otherwise from saved site facts. */
function useAreas() {
  const bundle = useSite((s) => s.bundle)
  const facts = useApp((s) => s.siteFacts)
  return (id: string) => {
    const m2 = bundle?.site.id === id ? bundle.areaM2 : facts[id]?.areaM2
    return m2 == null ? null : formatArea(m2)
  }
}

export function CommandPage() {
  const [map, setMap] = useState<mapboxgl.Map | null>(null)
  const [mapFailed, setMapFailed] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [flying, setFlying] = useState(false)
  const [picking, setPicking] = useState(false)
  const [surveying, setSurveying] = useState(false)
  const [removed, setRemoved] = useState<string | null>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const level = useApp((s) => s.level)
  const online = useApp(cameraOnline)
  const heard = useApp(lastHeard)
  const now = useApp((s) => s.now)
  const locations = useApp((s) => s.locations)
  const current = useApp(currentSite)
  const live = useMemo(() => liveSites(locations), [locations])
  const areaOf = useAreas()
  const area = areaOf(current.id)

  const onReady = useCallback((m: mapboxgl.Map | null) => setMap(m), [])
  const onFailed = useCallback(() => setMapFailed(true), [])
  const clearToast = useCallback(() => setRemoved(null), [])

  const fly = useCallback((site: Site) => {
    setSelected(null)
    // The forest starts building now, during the flight.
    useApp.getState().setCurrentSite(site.id)
    retrySite()
    if (!map || prefersReducedMotion()) {
      navigate('satellite', 'slow-fade')
      return
    }
    setFlying(true)
    map.flyTo({
      center: [site.centre.lng, site.centre.lat], zoom: flyZoom(site.centre.lat), bearing: 0, pitch: 0,
      padding: { top: 0, left: 0, right: 0, bottom: 0 }, duration: FLY_MS, curve: 1.5, essential: true,
    })
    // Hold the last frame so the satellite panel can start exactly where the flight ended.
    map.once('moveend', () => handOver(map))
  }, [map])

  const startPicking = () => {
    setSelected(null)
    setPicking(true)
  }

  /** Leaves the Location Picker and puts the Command Center back exactly as it was. */
  const stopPicking = useCallback(() => {
    setPicking(false)
    setSurveying(false)
    if (map) {
      setPlaceLabels(map, false)
      const back = { center: MALAYSIA_VIEW.center, zoom: malaysiaZoom(map.getContainer().clientWidth), bearing: 0, pitch: 0, padding: PADDING }
      if (prefersReducedMotion()) map.jumpTo(back)
      else map.flyTo({ ...back, duration: 1400, essential: true })
    }
    requestAnimationFrame(() => addRef.current?.focus())
  }, [map])

  const remove = (site: Site) => {
    useApp.getState().removeLocation(site.id)
    setRemoved(site.name)
  }

  // A popup never outlives its site (removed here, in another tab, or by a reset).
  useEffect(() => {
    if (selected && !live.some((s) => s.id === selected) && !SOON.some((s) => s.id === selected)) setSelected(null)
  }, [selected, live])

  const selectedLive = live.find((s) => s.id === selected) ?? null
  const selectedSoon = SOON.find((s) => s.id === selected) ?? null
  const flyLabel = (s: Site) => `Fly to ${s.shortName}`
  const hidden = flying || picking

  return (
    <div className={`command ${picking ? 'is-picking' : ''} ${surveying ? 'is-surveying' : ''}`}>
      <GlobeMap onReady={onReady} onFailed={onFailed} padding={PADDING}>
        {map && (
          <>
            {SOON.map((s) => (
              <MapMarker key={s.id} map={map} lngLat={[s.centre.lng, s.centre.lat]} zIndex={1}>
                <button
                  className="pin pin-soon"
                  aria-label={`${s.name}, ${s.region}: Coming Soon`}
                  onClick={() => setSelected(selected === s.id ? null : s.id)}
                >
                  <span className="pin-dot" />
                </button>
              </MapMarker>
            ))}
            {live.map((s) => (
              <MapMarker key={s.id} map={map} lngLat={[s.centre.lng, s.centre.lat]} zIndex={2}>
                <button
                  className={`pin pin-live ${level} ${level === 'danger' ? 'pin-pulse' : ''}`}
                  aria-label={`${s.name}: ${BAND_WORD[level]}`}
                  onClick={() => setSelected(selected === s.id ? null : s.id)}
                >
                  <span className="pin-dot" />
                  {!flying && <span className="pin-label">{s.shortName}</span>}
                </button>
              </MapMarker>
            ))}
            {selectedLive && !hidden && (
              <MapMarker map={map} lngLat={[selectedLive.centre.lng, selectedLive.centre.lat]} anchor="bottom" offset={[0, -24]} zIndex={5}>
                <div className="popup float" role="dialog" aria-label={selectedLive.name} data-testid="site-popup">
                  <button className="icon-btn x" aria-label="Close" onClick={() => setSelected(null)}><X size={18} /></button>
                  <div>
                    <div className="site-name" style={selectedLive.origin === "added" ? { paddingRight: 28 } : undefined}>{selectedLive.name}</div>
                    <div className="site-region">{selectedLive.region}{selectedLive.origin === 'catalogue' ? ', Malaysia' : ''}</div>
                  </div>
                  <div className="popup-facts">
                    <StatusChip band={level} />
                    <span>Mangrove area <strong className="num">{areaOf(selectedLive.id) ?? '—'}</strong></span>
                  </div>
                  <button className="btn btn-primary btn-block" onClick={() => fly(selectedLive)} title={flyLabel(selectedLive)} data-testid="popup-fly">
                    <Navigation size={18} /> <span className="ell">{flyLabel(selectedLive)}</span>
                  </button>
                </div>
              </MapMarker>
            )}
            {selectedSoon && !hidden && (
              <MapMarker map={map} lngLat={[selectedSoon.centre.lng, selectedSoon.centre.lat]} anchor="bottom" offset={[0, -16]} zIndex={5}>
                <div className="popup float" role="dialog" aria-label={selectedSoon.name} data-testid="site-popup">
                  <button className="icon-btn x" aria-label="Close" onClick={() => setSelected(null)}><X size={18} /></button>
                  <div>
                    <div className="site-name" style={{ paddingRight: 28 }}>{selectedSoon.name}</div>
                    <div className="site-region">{selectedSoon.region}, Malaysia</div>
                  </div>
                  <span className="soon" style={{ alignSelf: 'flex-start' }}>Coming Soon</span>
                </div>
              </MapMarker>
            )}
          </>
        )}
      </GlobeMap>

      {picking && map && <LocationPicker map={map} onCancel={stopPicking} onBusy={setSurveying} />}

      <div className={`command-ui ${hidden ? 'is-flying' : ''}`} inert={hidden}>
        <div className="tiles">
          <section className="tile float" data-testid="tile-mangrove-area" aria-label="Mangrove area">
            <div className="tile-label"><Trees size={18} /> Mangrove area</div>
            <div className="tile-value num">
              {area ? <>{area.replace(' ha', '')}<small>ha</small></> : '—'}
            </div>
            <div className="tile-sub" title={current.shortName}>{current.shortName}</div>
          </section>
          <section className="tile float" data-testid="tile-forest-health" aria-label="Forest health">
            <div className="tile-label"><HeartPulse size={18} /> Forest health</div>
            <div className={`tile-health ${level}`}><BandIcon band={level} size={30} />{BAND_WORD[level]}</div>
            <div className="tile-sub">From all ten sensors</div>
          </section>
          <section className="tile float" data-testid="tile-camera" aria-label="Camera">
            <div className="tile-label"><Camera size={18} /> Camera</div>
            <div className="tile-health" style={{ color: online ? 'var(--text)' : 'var(--muted)' }}>
              <span className={`dot ${online ? 'dot-on' : ''}`} style={{ width: 14, height: 14 }} />
              {online ? 'Online' : 'Offline'}
            </div>
            <div className="tile-sub num">Last heard {timeAgo(heard, now)}</div>
          </section>
        </div>

        <aside className="sites float" data-testid="sites-list" aria-label="Sites">
          <div className="sites-head">
            <h2>Sites</h2>
            <span>{live.length} live{SOON.length > 0 ? ` · ${SOON.length} coming soon` : ''}</span>
          </div>
          <ul className="sites-list">
            {live.map((s) => (
              <li className="site-live" data-testid={`site-card-${s.id}`} key={s.id}>
                <div className="site-live-top">
                  <div>
                    <div className="site-name">{s.name}</div>
                    <div className="site-region">{s.region}</div>
                  </div>
                  <StatusChip band={level} size="sm" />
                </div>
                <dl className="site-facts">
                  <div><dt>Mangrove area</dt><dd className="num">{areaOf(s.id) ?? '—'}</dd></div>
                  <div><dt>Monitored square</dt><dd className="num">500 × 500 m</dd></div>
                </dl>
                <button className="btn btn-primary btn-lg btn-block" onClick={() => fly(s)} title={flyLabel(s)} data-testid={`fly-${s.id}`}>
                  <Navigation size={19} /> <span className="ell">{flyLabel(s)}</span>
                </button>
                {s.origin === 'added' && (
                  <button className="btn btn-sm site-remove" onClick={() => remove(s)} aria-label={`Remove ${s.name}`} data-testid={`remove-${s.id}`}>
                    <Trash2 size={15} /> Remove
                  </button>
                )}
              </li>
            ))}
            {SOON.map((s) => (
              <li key={s.id}>
                <button
                  className="site-soon"
                  data-testid={`site-card-${s.id}`}
                  aria-pressed={selected === s.id}
                  onClick={() => {
                    setSelected(selected === s.id ? null : s.id)
                    if (map && selected !== s.id) map.easeTo({ center: MALAYSIA_VIEW.center, zoom: MALAYSIA_VIEW.zoom, duration: 600 })
                  }}
                >
                  <span>
                    <span className="site-name" style={{ display: 'block' }}>{s.name}</span>
                    <span className="site-region">{s.region}</span>
                  </span>
                  <span className="soon">Coming Soon</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="sites-foot">
            <button
              ref={addRef}
              className="btn btn-block"
              onClick={startPicking}
              disabled={!map || mapFailed}
              title={!map || mapFailed ? 'Needs the satellite map' : undefined}
              data-testid="add-location"
            >
              <MapPinPlus size={18} /> Add Location
            </button>
          </div>
        </aside>
      </div>
      {removed && <Toast onDone={clearToast}><Check size={18} /> Removed {removed}</Toast>}
    </div>
  )
}
