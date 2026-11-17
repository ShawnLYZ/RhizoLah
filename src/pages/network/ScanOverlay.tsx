import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Camera, Info, LoaderCircle, Sparkles, Sprout, X } from 'lucide-react'
import { create } from 'zustand'
import { useRoute } from '../../app/router'
import { FootprintMap } from '../../maps/FootprintMap'
import { areaIds, currentSite, nextPatch, openEvent, siteAreas, useApp } from '../../state/store'
import { useSite } from '../../forest/forestData'
import { siteFrame } from '../../geo/geo'
import { sensorsAt } from '../../sim/field'
import { healthyReading } from '../../sim/engine'
import { replantSuggestion } from '../../sim/insights'
import { isNearWater, suggestSpecies } from '../../sim/species'
import { mudCheck, soilSurveyAt } from '../../sim/soil'
import { SENSORS, bandOf, formatReading } from '../../sim/ranges'
import { Lightbox, StatusChip } from '../../ui/components'
import { usePrefersReducedMotion } from '../../ui/hooks'
import type { ReplantPatch, SensorPost } from '../../site/catalogue'

const SWEEP_MS = 4000
// After the sweep, the camera photographs the spot to show it is still bare mud.
const SHOT_MS = 2200
const EMPTY_PHOTO = {
  src: '/scan-photos/empty-area.jpg',
  alt: 'A bare mudflat at low tide with mangroves only at its edge',
  credit: 'Bernard DUPONT · CC BY-SA 2.0 · Wikimedia Commons (resized)',
}

/** The Sensor post closest to a point. */
function nearestPost(posts: readonly SensorPost[], p: { x: number; z: number }): SensorPost | null {
  let best: SensorPost | null = null, d = Infinity
  for (const q of posts) {
    const dq = (q.x - p.x) ** 2 + (q.z - p.z) ** 2
    if (dq < d) { d = dq; best = q }
  }
  return best
}

// Opened from the top bar's "More" menu, shown by the network page.
export const useScanOverlay = create<{ open: boolean }>(() => ({ open: false }))
useRoute.subscribe((s) => { if (s.route !== 'network') useScanOverlay.setState({ open: false }) })

export function ScanOverlay({ onClose }: { onClose(): void }) {
  const reduced = usePrefersReducedMotion()
  const site = useApp(currentSite)
  const frame = useMemo(() => siteFrame(site.centre), [site])
  const layout = useSite((s) => s.bundle?.layout ?? null)
  // The Current Site's next patch with no Replant Area, fixed when the scan opens.
  const [target] = useState<ReplantPatch | null>(() => {
    const b = useSite.getState().bundle
    return b ? nextPatch(b.layout.patches, siteAreas(useApp.getState(), b.site.id)) : null
  })
  // Whether water lies within 10 m of the area, from the Site's Canopy Map (fixed for the scan).
  const [nearWater] = useState(() => {
    const b = useSite.getState().bundle
    return !!(b && target && isNearWater(target.ring, b.model.classes))
  })
  const [phase, setPhase] = useState<'scanning' | 'found' | 'none'>('scanning')
  const [progress, setProgress] = useState(0)
  const [shot, setShot] = useState(false)
  const [zoom, setZoom] = useState(false)
  const [mapH, setMapH] = useState(600)
  const mapRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const areas = useApp((s) => siteAreas(s, site.id))
  const dangerOpen = useApp((s) => !!openEvent(s))
  const reading = useApp((s) => s.reading)
  const tickTime = useApp((s) => s.tickTime)

  useLayoutEffect(() => {
    if (mapRef.current) setMapH(mapRef.current.clientHeight)
  }, [])

  useEffect(() => {
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / SWEEP_MS)
      setProgress(p)
      if (p < 1) raf = requestAnimationFrame(tick)
      else {
        // Nothing is saved here: the area is saved only when PlantLah! is clicked.
        if (target) {
          setPhase('found')
          timer = window.setTimeout(() => setShot(true), SHOT_MS)
        } else setPhase('none')
      }
    }
    let timer = 0
    raf = requestAnimationFrame(tick)
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) closeRef.current() }
    window.addEventListener('keydown', esc)
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); window.removeEventListener('keydown', esc) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  const planted = layout ? areaIds(layout.patches, areas) : []
  const values = target && layout ? sensorsAt(target.centroid.x, target.centroid.z, layout.station, reading, healthyReading(tickTime)) : null
  // The same rule on the same Readings as the click, so the species named here is the species saved.
  const suggestion = values ? suggestSpecies(values.salinity, nearWater) : null
  // The Mud Check: the simulated soil survey of this spot with the mud redox Reading shown below.
  const survey = target ? soilSurveyAt(target.centroid.x, target.centroid.z) : null
  const mud = survey && values ? mudCheck(survey, values.mud_redox) : null
  const ai = values && suggestion && survey && mud ? replantSuggestion(values, suggestion, survey, mud) : null
  // The Sensor post nearest the area ("Post 6" for the first patch at Kuala Selangor), named beside the title.
  const post = target && layout ? nearestPost(layout.posts, target.centroid) : null
  const canPlant = shot && !dangerOpen
  const area = target ? Math.round(target.areaM2 / 10) * 10 : 0

  return (
    <div className="scan-wrap" role="dialog" aria-modal="true" aria-label="Satellite scan">
      <div className="scan float">
        <div className="scan-head">
          <div>
            <div className="scan-title">
              <h2>Satellite scan</h2>
              {post && <span className="scan-post" title={`The area is beside ${post.name}`}>{post.name.replace('Sensor post', 'Post')}</span>}
            </div>
            <p>Looking for an empty area where conditions are healthy</p>
          </div>
          {phase === 'none' ? (
            <button className="btn" onClick={onClose}><X size={18} /> Close</button>
          ) : (
            <button
              className={`btn btn-plant ${phase === 'found' ? 'btn-primary' : ''}`}
              disabled={!canPlant}
              title={canPlant ? undefined : phase !== 'found' ? 'Available when the scan is done' : !shot ? 'Available when the camera’s photo arrives' : 'Available when all readings are Healthy'}
              data-testid="plant-lah"
              onClick={() => {
                if (!target || !values || !suggestion) return
                if (useApp.getState().confirmReplantArea(site.id, target, values, suggestion)) onClose()
              }}
            >
              <Sprout size={18} /> PlantLah!
            </button>
          )}
        </div>
        <div className="scan-map" ref={mapRef} style={{ ['--h' as string]: `${mapH}px`, ['--sweep' as string]: `${SWEEP_MS}ms` }}>
          <FootprintMap key={site.id} frame={frame} layout={layout} padding={18} interactive={false} showStation planted={planted} highlight={phase === 'found' ? target?.id ?? null : null} />
          {phase === 'scanning' && (reduced
            ? <div className="scan-fade" />
            : <><div className="scan-trail" /><div className="scan-line" /></>)}
        </div>
        <div className="scan-side">
          {phase === 'scanning' && (
            <div className="scan-progress" aria-live="polite">
              <span>Predicting Habitat Success, Powering Coastal Resilience! <b className="num">{Math.round(progress * 100)}%</b></span>
              <div className="bar"><i style={{ width: `${progress * 100}%` }} /></div>
            </div>
          )}
          {phase === 'none' && (
            <div className="none-left" role="status">
              <Info size={20} style={{ flex: 'none', marginTop: 2 }} />
              <span>No empty area suitable for replanting found right now.</span>
            </div>
          )}
          {phase === 'found' && (
            <div className="scan-photo">
              {shot ? (
                <button className="photo" onClick={() => setZoom(true)} aria-label="Open the empty area photo full size">
                  <img src={EMPTY_PHOTO.src} alt={EMPTY_PHOTO.alt} className="photo-new" />
                  <span className="photo-time">Empty area · no mangrove planted yet</span>
                </button>
              ) : (
                <div className="photo">
                  <div className="photo-empty">
                    <div>
                      <Camera size={30} />
                      <span>Waiting for the camera’s photo…</span>
                    </div>
                  </div>
                </div>
              )}
              <div className="cam-line" aria-live="polite">
                {shot
                  ? <><Camera size={20} style={{ color: 'var(--healthy)' }} /><span>Camera photo shows bare mud with no seedlings, ready for new mangrove seeds.</span></>
                  : <><LoaderCircle size={20} style={{ animation: 'spin 0.9s linear infinite', color: 'var(--primary)' }} /><span>Asking the camera to photograph this spot…</span></>}
              </div>
            </div>
          )}
          {phase === 'found' && target && values && suggestion && mud && ai && (
            <>
              <div className="result" role="status">
                <h3><Sprout size={20} /> Suitable for replanting</h3>
                <div className="result-big">
                  <div><strong className="num">{area.toLocaleString('en-MY')} m²</strong><span>Empty area</span></div>
                  <div><strong className="num">{area.toLocaleString('en-MY')}</strong><span>Seedlings that fit, about (1 m apart)</span></div>
                </div>
                <div className="ai-note">
                  <div className="ai-tag"><Sparkles size={15} /> AI Suggestion</div>
                  <p>{ai.intro}</p>
                  <p><b>Mangrove Species.</b> {ai.species}</p>
                  <p><b>Soil Type.</b> {ai.soil}</p>
                </div>
              </div>
              <div className="readings">
                <h3>Readings at this spot</h3>
                {SENSORS.map((s) => (
                  <div className="reading-row" key={s.id}>
                    <span>{s.name}</span>
                    <span className="v num">{formatReading(s.id, values[s.id])}{s.unit && <small>{s.unit}</small>}</span>
                    <StatusChip band={bandOf(s.id, values[s.id])} size="sm" />
                  </div>
                ))}
              </div>
              <div className="readings" data-testid="mud-check">
                <h3>Mud check at this spot <StatusChip band={mud.band} size="sm" /></h3>
                {mud.rows.filter((r) => r.id !== 'redox').map((r) => (
                  <div className="reading-row" key={r.id}>
                    <span>{r.label}</span>
                    <span className="v">{r.value}</span>
                    <StatusChip band={r.band} size="sm" />
                  </div>
                ))}
                <p className="mud-note">Soil facts from the wave gauge’s log and a lab sample. Mud redox is in the readings above.</p>
              </div>
            </>
          )}
        </div>
      </div>
      <Lightbox
        src={zoom ? EMPTY_PHOTO.src : null}
        alt={EMPTY_PHOTO.alt}
        caption="Empty area · no mangrove planted yet"
        credit={EMPTY_PHOTO.credit}
        onClose={() => setZoom(false)}
      />
    </div>
  )
}
