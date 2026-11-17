import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { create } from 'zustand'
import { Camera, MousePointer2, Pause, Pin, Play, Radio, Shovel, Sparkles, Sprout, TreeDeciduous, Wallet, Leaf } from 'lucide-react'
import { ForestScene } from '../../forest/ForestScene'
import type { ForestView } from '../../forest/view'
import { requestOverlay, useSite } from '../../forest/forestData'
import { stressGradientCss } from '../../forest/stressColor'
import { areaIds, areaStep, siteAreas, useApp, type AreaStep, type ReplantArea } from '../../state/store'
import { healthyReading } from '../../sim/engine'
import { postReadings } from '../../sim/field'
import { SENSORS, SENSOR_BY_ID, bandOf, formatReading, levelOf, type Reading, type SensorId } from '../../sim/ranges'
import { suggestionReasons } from '../../sim/species'
import { mudCheck, mudSentences, soilSurveyAt, suggestSoil } from '../../sim/soil'
import { GROWTH_YEARS, growthCaption } from '../../sim/growth'
import { SPECIES_PHOTO, formatRM, plantingCost, plantingPlan } from '../../sim/planting'
import { co2At, formatTonnes, type CarbonArea } from '../../sim/carbon'
import { formatLat, formatLng, type SiteFrame } from '../../geo/geo'
import { liveName, POST_RADIUS_M, type ReplantPatch, type SensorPost } from '../../site/catalogue'
import { BandIcon, StatusChip } from '../../ui/components'
import { formatMYTDateTime } from '../../ui/time'
import { SourceButton } from '../../knowledge/SourceButton'
import type { SourceId } from '../../knowledge/sources'
import { SOIL_LOOK, SPECIES_LOOK } from '../../forest/look'

type Layer = SensorId | 'natural' | 'growth'

/**
 * The layer, the one pinned item (a sensor post or a Replant Area) and the Growth Year survive page changes.
 * The Growth Year is memory only: a reload starts at Year 0.
 */
const useTwin = create<{ layer: Layer; pinned: string | null; growthYear: number }>(() => ({ layer: 'natural', pinned: null, growthYear: 0 }))

const RANGE_TEXT: Record<SensorId, [string, string, string]> = {
  salinity: ['35 or less', '35 to 45', 'above 45'],
  turbidity: ['25 or less', '25 to 100', 'above 100'],
  water_temp: ['20 to 32', '15–20 or 32–36', 'below 15 or above 36'],
  wave_height: ['0.50 or less', '0.50 to 1.00', 'above 1.00'],
  water_level: ['1.80 or less', '1.80 to 2.20', 'above 2.20'],
  wave_velocity: ['0.50 or less', '0.50 to 1.00', 'above 1.00'],
  mud_ph: ['6.0 to 8.0', '5.0–6.0 or 8.0–9.0', 'below 5.0 or above 9.0'],
  mud_ec: ['45 or less', '45 to 55', 'above 55'],
  mud_temp: ['20 to 32', '15–20 or 32–36', 'below 15 or above 36'],
  mud_redox: ['-100 or above', '-200 to -100', 'below -200'],
}

const STEP_LABEL: Record<AreaStep, { word: string; Icon: typeof Sprout }> = {
  suitable: { word: 'Suitable to Plant', Icon: Sprout },
  planted: { word: 'Planted, growing', Icon: Shovel },
  grown: { word: 'Grown', Icon: TreeDeciduous },
}

/** Play runs 1.5 Growth Years per second: the full range in about 10 seconds. */
const PLAY_YEARS_PER_S = 1.5

const NO_POSTS: readonly SensorPost[] = []
const NO_PATCHES: readonly ReplantPatch[] = []

function AreaKey({ any }: { any: boolean }) {
  return <div className="legend-key"><span className="key-area" /> {any ? 'Replant area' : 'Replant areas appear here after PlantLah!'}</div>
}

/** What the colours chosen on the Sentinel Network mean. Nothing is shown while both are None. */
function LookKeys() {
  const species = useApp((s) => s.chosenSpecies)
  const soil = useApp((s) => s.chosenSoil)
  return (
    <>
      {species && <div className="legend-key"><span className="key-look" style={{ background: SPECIES_LOOK[species].swatch }} /> <span>Trees coloured for <i>{species}</i></span></div>}
      {soil && <div className="legend-key"><span className="key-look" style={{ background: SOIL_LOOK[soil].swatch }} /> Ground coloured for {soil.toLowerCase()}</div>}
    </>
  )
}

function Legend({ layer, anyArea, others, live }: { layer: Layer; anyArea: boolean; others: number; live: string }) {
  const level = useApp((s) => s.level)
  if (layer === 'growth') {
    return (
      <section className="legend float" aria-label="Legend">
        <h3>Growth Simulation</h3>
        <dl className="stages">
          <dt>Seed</dt><dd>Year 0: a propagule standing in the mud</dd>
          <dt>Seedling</dt><dd>shorter than 1.3 m</dd>
          <dt>Sapling</dt><dd>1.3 m or taller, stem thinner than 2.5 cm</dd>
          <dt>Tree</dt><dd>1.3 m or taller, stem 2.5 cm or thicker</dd>
        </dl>
        <div className="legend-keys">
          <AreaKey any={anyArea} />
          <LookKeys />
        </div>
      </section>
    )
  }
  if (layer === 'natural') {
    return (
      <section className="legend float" aria-label="Legend">
        <h3>Natural colours</h3>
        <div className="legend-keys">
          <div className="legend-key"><span className="marker-station" style={{ width: 26, height: 26, borderWidth: 2 }}><Camera size={13} /></span> {live}, live with its camera</div>
          {others > 0 && <div className="legend-key"><span className="tp-key"><Radio size={12} /></span> {others} more sensor post{others === 1 ? '' : 's'} across the forest</div>}
          <AreaKey any={anyArea} />
          <LookKeys />
          <div className="legend-key"><span className="key-glow" /> {level === 'healthy' ? 'Red glow around any sensor whose readings turn dangerous' : 'Sensors with readings outside the healthy range'}</div>
        </div>
      </section>
    )
  }
  const spec = SENSOR_BY_ID[layer]
  const t = RANGE_TEXT[layer]
  return (
    <section className="legend float" aria-label="Legend">
      <h3>{spec.name} {spec.unit && <small>({spec.unit})</small>}</h3>
      <div className="ramp" style={{ background: stressGradientCss() }} />
      <div className="ramp-labels">
        <div><b style={{ color: 'var(--healthy-ink)' }}><BandIcon band="healthy" size={14} /> Healthy</b><span className="num">{t[0]}</span></div>
        <div><b style={{ color: 'var(--warning-ink)' }}><BandIcon band="warning" size={14} /> Warning</b><span className="num">{t[1]}</span></div>
        <div><b style={{ color: 'var(--danger-ink)' }}><BandIcon band="danger" size={14} /> Danger</b><span className="num">{t[2]}</span></div>
      </div>
      <div className="legend-keys">
        <div className="legend-key"><span className="tp-key"><Radio size={12} /></span> Each sensor colours the forest about {POST_RADIUS_M} m around it</div>
        <AreaKey any={anyArea} />
      </div>
    </section>
  )
}

function PostCard({ post, frame, values, pinned, layer }: { post: SensorPost; frame: SiteFrame; values: Reading; pinned: boolean; layer: Layer }) {
  const p = frame.toLatLng(post.x, post.z)
  return (
    <>
      <div className="hc-head">
        <div>
          <div className="hc-name">{post.name}{post.live && <span className="hc-live">Live</span>}</div>
          <div className="hc-coords num"><span>{formatLat(p.lat)}</span><span>{formatLng(p.lng)}</span></div>
        </div>
        {pinned && <span className="hc-pin"><Pin size={12} /> Pinned</span>}
      </div>
      {SENSORS.map((s) => {
        const b = bandOf(s.id, values[s.id])
        return (
          <div className={`hc-row ${layer === s.id ? 'active' : ''}`} key={s.id}>
            <span>{s.name}</span>
            <span className="v num">{formatReading(s.id, values[s.id])}{s.unit && <small>{s.unit}</small>}</span>
            <StatusChip band={b} size="sm" />
          </div>
        )
      })}
      <div className="hc-foot">{pinned ? 'Press Esc or click the forest to release' : 'Click the sensor to pin this card'}</div>
    </>
  )
}

/** The Mud Check of a Replant Area: the soil survey of its centre with the mud redox frozen at PlantLah!. */
const areaMud = (area: ReplantArea, patch: ReplantPatch) => mudCheck(soilSurveyAt(patch.centroid.x, patch.centroid.z), area.readings.mud_redox)

/** The Species Suggestion: fixed when PlantLah! was clicked, from the Readings shown then. Never recomputed. */
function SpeciesCard({ area, patch, pinned, growth }: { area: ReplantArea; patch: ReplantPatch; pinned: boolean; growth: boolean }) {
  const s = area.suggestion
  // The Mud Check has no Knowledgebase source: its sentences carry no citation.
  const check = areaMud(area, patch)
  const mud = mudSentences(check).map((text) => ({ text, sources: [] as SourceId[] }))
  // The Soil Type Suggestion: the soil the suggested species grows best in, against the soil found here. No citation.
  const soil = suggestSoil(s.species, s.alternative, soilSurveyAt(patch.centroid.x, patch.centroid.z))
  const reasons = [...suggestionReasons(s, area.readings), ...mud]
  // The Planting Plan: seedlings on a square grid over the empty area at the species' spacing.
  const plan = plantingPlan(s.species, patch.areaM2)
  const photo = SPECIES_PHOTO[s.species]
  const used = [...new Set([...reasons.flatMap((r) => r.sources), ...(plan.source ? [plan.source] : [])])]
  const spacing = `${plan.spacingM.toFixed(1)} m`
  // The Planting Cost: demo estimates only, so it carries no citation.
  const cost = plantingCost(s.species, plan.seedlings, { poorSoil: soil.fit === 'poor', mudIssues: check.issues.length > 0 })
  return (
    <div data-testid="species-card">
      <div className="hc-head">
        <div className="ai-tag"><Sparkles size={15} /> AI Suggestion</div>
        {pinned && <span className="hc-pin"><Pin size={12} /> Pinned</span>}
      </div>
      <div className="sp-main">
        <figure className="sp-photo">
          <img src={photo.src} alt={`${s.species}`} loading="lazy" />
          <figcaption>{photo.credit}</figcaption>
        </figure>
        <div className="sp-facts">
          <section className="sp-fact" aria-label="Mangrove Species">
            <h3>Mangrove Species</h3>
            <p className="sp-big"><i>{s.species}</i></p>
            <p className="sp-sub">Alternative: <i>{s.alternative}</i></p>
          </section>
          <section className="sp-fact" aria-label="Soil Type" data-testid="soil-suggestion">
            <h3>Soil Type</h3>
            <p className="sp-big sp-soil-type">
              <span className="key-look" style={{ background: SOIL_LOOK[soil.soil].swatch }} aria-hidden="true" />
              {soil.soil}
            </p>
            <p className={`sp-sub sp-soil-found ${soil.fit}`}>Found here: {soil.found} · {soil.fit === 'best' ? 'best fit' : soil.fit === 'ok' ? 'also suitable' : 'not a good fit'}</p>
          </section>
          <section className="sp-fact" aria-label="Number of Seedlings" data-testid="seedling-count">
            <h3>Number of Seedlings</h3>
            <p className="sp-big num">{plan.seedlings.toLocaleString('en-MY')}</p>
            <p className="sp-sub num">For about {Math.round(plan.areaM2).toLocaleString('en-MY')} m² of empty ground</p>
          </section>
          <section className="sp-fact" aria-label="Distance between seedlings" data-testid="seedling-spacing">
            <h3>Distance between seedlings</h3>
            <p className="sp-big num">{spacing}</p>
            <p className="sp-sub">In rows {spacing} apart {plan.source && <SourceButton id={plan.source} />}</p>
          </section>
        </div>
      </div>
      <details className="sp-more">
        <summary>Why this suggestion · sources and Readings</summary>
        <div className="sp-more-body">
          <p className="sp-when num">Readings when scanned · {formatMYTDateTime(area.confirmedAt)}</p>
          <h4 className="sp-title">Species</h4>
          <ul className="sp-reasons">
            {reasons.map((r) => (
              <li key={r.text}>{r.text} {r.sources.map((id) => <SourceButton key={id} id={id} />)}</li>
            ))}
          </ul>
          <h4 className="sp-title">Soil Type</h4>
          <ul className="sp-reasons">
            {soil.sentences.map((t) => <li key={t}>{t}</li>)}
          </ul>
          <h4 className="sp-title">Seedlings</h4>
          <ul className="sp-reasons">
            <li>
              One seedling every {spacing} on a square grid: {Math.round(plan.areaM2).toLocaleString('en-MY')} m² ÷ ({spacing} × {spacing}) ≈ {plan.seedlings.toLocaleString('en-MY')}.
              {plan.source
                ? <> Matang replants <i>{s.species}</i> at this spacing. <SourceButton id={plan.source} /></>
                : null}
            </li>
          </ul>
          <div className="sp-sources">
            <span>Sources</span>
            {used.map((id) => <SourceButton key={id} id={id} />)}
          </div>
          <h4 className="sp-title">Readings when scanned</h4>
          <div className="sp-readings">
            {SENSORS.map((r) => (
              <div className="hc-row" key={r.id}>
                <span>{r.name}</span>
                <span className="v num">{formatReading(r.id, area.readings[r.id])}{r.unit && <small>{r.unit}</small>}</span>
                <StatusChip band={bandOf(r.id, area.readings[r.id])} size="sm" />
              </div>
            ))}
          </div>
        </div>
      </details>
      <div className="hc-foot sp-foot">
        <span>{growth ? 'Click the label to fly to this area' : pinned ? 'Press Esc or click the forest to release' : 'Click the label to pin this card'}</span>
        <div className="cost-wrap" data-testid="planting-cost">
          <button type="button" className="cost-btn" aria-describedby="planting-cost-pop">
            <Wallet size={15} aria-hidden="true" /> Cost <b className="num">{formatRM(cost.totalRM)}</b>
          </button>
          <div className="cost-pop" id="planting-cost-pop" role="tooltip">
            <h4>Cost to finish all the planting</h4>
            <p className="cost-sub num">{plan.seedlings.toLocaleString('en-MY')} <i>{s.species}</i> over about {Math.round(plan.areaM2).toLocaleString('en-MY')} m²</p>
            <table>
              <tbody>
                {cost.lines.map((l) => (
                  <tr key={l.label}>
                    <th scope="row">{l.label}<small className="num">{l.detail}</small></th>
                    <td className="num">{formatRM(l.rm)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><th scope="row">Total</th><td className="num">{formatRM(cost.totalRM)}</td></tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

/** The Species card is 740 px wide; with its 12 px gap and a margin it needs this much room beside its label. */
const SPECIES_CARD_W = 764

/** Opens the card on the side with more room, clear of the layer bar and the page bottom. */
function cardStyle(place: { left: boolean; v: 'up' | 'mid' | 'down' } | undefined): CSSProperties {
  return {
    position: 'absolute',
    left: place?.left ? 'auto' : 'calc(100% + 12px)',
    right: place?.left ? 'calc(100% + 12px)' : 'auto',
    top: place?.v === 'down' ? -6 : place?.v === 'up' ? 'auto' : '50%',
    bottom: place?.v === 'up' ? -6 : 'auto',
    transform: !place || place.v === 'mid' ? 'translateY(-50%)' : 'none',
  }
}

/**
 * A hover or pinned card that stays inside the Digital Twin. It opens beside its label (cardStyle), then every frame
 * it is nudged back in if it would run past an edge, so a tall card near the bottom or a label moved by the camera
 * never leaves part of the card off screen. The nudge uses the CSS `translate` property, which adds to cardStyle's transform.
 */
function FloatingCard({ host, className, style, testId, children }: {
  host: React.RefObject<HTMLDivElement | null>; className: string; style: CSSProperties; testId?: string; children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    let dx = 0, dy = 0
    const M = 12
    const tick = () => {
      const el = ref.current, h = host.current?.getBoundingClientRect()
      if (el && h) {
        const r = el.getBoundingClientRect()
        // The position without the current nudge, then the smallest nudge that keeps it inside (top and left win).
        const top = r.top - dy, bottom = r.bottom - dy, left = r.left - dx, right = r.right - dx
        let ny = 0, nx = 0
        if (bottom > h.bottom - M) ny = h.bottom - M - bottom
        if (top + ny < h.top + M) ny = h.top + M - top
        if (right > h.right - M) nx = h.right - M - right
        if (left + nx < h.left + M) nx = h.left + M - left
        if (Math.abs(nx - dx) > 0.5 || Math.abs(ny - dy) > 0.5) {
          dx = nx; dy = ny
          el.style.translate = `${dx}px ${dy}px`
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [host])
  return <div ref={ref} className={className} style={style} data-testid={testId} {...stop}>{children}</div>
}

const stop = {
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onPointerUp: (e: React.PointerEvent) => e.stopPropagation(),
}

function GrowthControls({ enabled, carbon }: { enabled: boolean; carbon: readonly CarbonArea[] }) {
  const year = useTwin((s) => s.growthYear)
  const [playing, setPlaying] = useState(false)
  const caption = growthCaption(year)
  const co2 = co2At(year, carbon)
  const n = carbon.length

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const step = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const next = Math.min(GROWTH_YEARS, useTwin.getState().growthYear + dt * PLAY_YEARS_PER_S)
      useTwin.setState({ growthYear: next })
      if (next >= GROWTH_YEARS) setPlaying(false)
      else raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  useEffect(() => { if (!enabled) setPlaying(false) }, [enabled])

  return (
    <section className="growth float" aria-label="Growth Simulation" {...stop}>
      {!enabled && <p className="growth-empty" role="status">No replant area yet. Run Scan for replanting and click PlantLah! first.</p>}
      <div className="growth-row">
        <button
          className="btn btn-sm growth-play"
          disabled={!enabled}
          data-testid="growth-play"
          onClick={() => {
            if (playing) { setPlaying(false); return }
            if (useTwin.getState().growthYear >= GROWTH_YEARS) useTwin.setState({ growthYear: 0 })
            setPlaying(true)
          }}
        >
          {playing ? <><Pause size={16} /> Pause</> : <><Play size={16} /> Play</>}
        </button>
        <div className="growth-track">
          <input
            type="range"
            min={0}
            max={GROWTH_YEARS}
            step="any"
            value={year}
            disabled={!enabled}
            aria-label="Growth Year"
            aria-valuetext={caption}
            list="growth-ticks"
            data-testid="growth-slider"
            onChange={(e) => { setPlaying(false); useTwin.setState({ growthYear: Number(e.target.value) }) }}
            onKeyDown={(e) => {
              // Arrow keys move one year at a time (the slider itself is smooth).
              if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                e.preventDefault()
                setPlaying(false)
                const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : -1
                const y = useTwin.getState().growthYear
                const next = dir > 0 ? Math.floor(y + 1e-6) + 1 : Math.ceil(y - 1e-6) - 1
                useTwin.setState({ growthYear: Math.max(0, Math.min(GROWTH_YEARS, next)) })
              }
            }}
          />
          <datalist id="growth-ticks">
            {Array.from({ length: GROWTH_YEARS + 1 }, (_, i) => <option key={i} value={i} />)}
          </datalist>
          <div className="growth-ticks" aria-hidden="true">
            {Array.from({ length: GROWTH_YEARS + 1 }, (_, i) => (
              <span key={i} className={i % 5 === 0 ? 'major' : undefined} style={{ left: `${(i / GROWTH_YEARS) * 100}%` }} />
            ))}
            {[0, 5, 10, 15].map((i) => <b key={i} className="num" style={{ left: `${(i / GROWTH_YEARS) * 100}%` }}>{i}</b>)}
          </div>
        </div>
      </div>
      <div className="growth-foot">
        <div>
          <p className="growth-caption num" aria-live="off" data-testid="growth-caption">{caption}</p>
          <p className="growth-source">Growth figures: <i>Rhizophora apiculata</i> · <SourceButton id="K3" /></p>
        </div>
        {enabled && (
          <div className="growth-co2" data-testid="growth-co2">
            <span className="growth-co2-label"><Leaf size={15} aria-hidden="true" /> Estimated CO₂ reduced</span>
            <b className="num">{formatTonnes(co2.co2T)}</b>
            <span className="growth-co2-sub num">
              {co2.standing.toLocaleString('en-MY')} plants{n > 1 ? ` in ${n} areas` : ''} · above ground <SourceButton id="K4" />
            </span>
          </div>
        )}
      </div>
    </section>
  )
}

export function TwinPage() {
  const layer = useTwin((s) => s.layer)
  const pinned = useTwin((s) => s.pinned)
  const growthYear = useTwin((s) => s.growthYear)
  const [view, setView] = useState<ForestView | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [place, setPlace] = useState<Record<string, { left: boolean; v: 'up' | 'mid' | 'down' }>>({})
  const reading = useApp((s) => s.reading)
  const tickTime = useApp((s) => s.tickTime)
  const tasks = useApp((s) => s.tasks)
  const chosenSpecies = useApp((s) => s.chosenSpecies)
  const chosenSoil = useApp((s) => s.chosenSoil)
  const bundle = useSite((s) => s.bundle)
  const sitePosts = bundle?.layout.posts ?? NO_POSTS
  const patches = bundle?.layout.patches ?? NO_PATCHES
  const siteId = bundle?.site.id ?? ''
  const areas = useApp((s) => siteAreas(s, siteId))
  const planted = areaIds(patches, areas)
  const plantedKey = planted.join(',')
  const growth = layer === 'growth'
  const hostRef = useRef<HTMLDivElement>(null)
  const postRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const patchRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const down = useRef<{ x: number; y: number } | null>(null)

  // Data exists only at the sensor posts: one Reading each, the station's being the live one.
  const posts = useMemo(
    () => (bundle ? postReadings(bundle.layout.posts, bundle.layout.station, reading, healthyReading(tickTime)) : []),
    [bundle, reading, tickTime],
  )

  // Layer overlay: recomputed in the worker whenever the layer or the Readings change. Growth shows natural colours.
  const overlayLayer = growth ? 'natural' : layer
  useEffect(() => {
    if (!view) return
    let live = true
    requestOverlay(overlayLayer, posts, sitePosts).then((rgba) => {
      if (live) view.setOverlay(rgba, overlayLayer === 'natural' ? 1 : 0.86)
    })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, overlayLayer, posts])

  // The chosen Mangrove Species and Soil Type colour the forest in Natural colours and the Growth Simulation.
  // A sensor layer keeps its own colours, so its stress ramp reads true.
  useEffect(() => {
    const on = overlayLayer === 'natural'
    view?.setLook(on && chosenSpecies ? SPECIES_LOOK[chosenSpecies].tint : null, on && chosenSoil ? SOIL_LOOK[chosenSoil].tint : null)
  }, [view, overlayLayer, chosenSpecies, chosenSoil])

  useEffect(() => {
    view?.setReplantAreas(planted)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, plantedKey])

  useEffect(() => {
    view?.setGrowthMud(Object.fromEntries(planted.map((id) => [id, areaMud(areas[id]!, patches.find((p) => p.id === id)!).survival])))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, plantedKey])

  useEffect(() => {
    view?.setGrowth(growth ? growthYear : null)
  }, [view, growth, growthYear, plantedKey])

  // Estimated CO2 reduced: each area's seedlings (Planting Plan) and its Mud Check survival factor.
  const carbon = useMemo<CarbonArea[]>(() => planted.map((id) => {
    const p = patches.find((x) => x.id === id)!
    const a = areas[id]!
    return { seedlings: plantingPlan(a.suggestion.species, p.areaM2).seedlings, mud: areaMud(a, p).survival }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [plantedKey, patches])

  // The newest Replant Area (latest PlantLah!).
  const newest = planted.reduce<ReplantPatch | null>((best, id) => {
    const p = patches.find((x) => x.id === id)!
    return !best || areas[id]!.confirmedAt > areas[best.id]!.confirmedAt ? p : best
  }, null)

  // Opening the tab flies down to the newest area; leaving it for another layer flies back to the aerial view.
  const wasGrowth = useRef(false)
  useEffect(() => {
    if (!view) return
    if (growth && !wasGrowth.current && newest) view.flyToArea(newest.centroid.x, newest.centroid.z, newest.areaM2)
    if (!growth && wasGrowth.current) view.flyHome()
    wasGrowth.current = growth
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, growth])
  useEffect(() => { if (!view) wasGrowth.current = false }, [view])

  // 3D anchors: sensor posts and Replant Areas.
  useEffect(() => {
    if (!view) return
    const els: HTMLElement[] = []
    for (const p of sitePosts) {
      const el = postRefs.current[p.id]
      if (!el) continue
      view.addAnchor(el, p.x, view.groundHeight(p.x, p.z) + 5.4, p.z)
      els.push(el)
    }
    for (const p of patches) {
      const el = patchRefs.current[p.id]
      if (el && planted.includes(p.id)) {
        view.addAnchor(el, p.centroid.x, view.groundHeight(p.centroid.x, p.centroid.z) + 1, p.centroid.z)
        els.push(el)
      }
    }
    return () => els.forEach((e) => view.removeAnchor(e))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, plantedKey, growth])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) useTwin.setState({ pinned: null }) }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [])

  /** `width` is the card's width plus its gap: sensor post cards are 384 px, the Species card 740 px. */
  const measure = (id: string, el: HTMLElement, width = 400) => {
    const host = hostRef.current?.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    if (!host) return
    const cy = r.top + r.height / 2
    const v = cy - host.top < 360 ? 'down' : host.bottom - cy < 260 ? 'up' : 'mid'
    // Open on the right unless it does not fit there and there is more room on the left.
    const left = r.right + width > host.right && r.left - host.left > host.right - r.right
    setPlace((f) => ({ ...f, [id]: { left, v } }))
  }

  const chooseLayer = (id: Layer) => {
    // In the Growth Simulation a click on a label flies the camera and nothing is pinned, so any pin is released.
    useTwin.setState({ layer: id, ...(id === 'growth' ? { pinned: null } : {}) })
  }

  return (
    <div className="twin" ref={hostRef}
      onPointerDown={(e) => { down.current = { x: e.clientX, y: e.clientY } }}
      onPointerUp={(e) => {
        // A click on the forest (not a drag) releases the pinned card.
        const d = down.current
        down.current = null
        if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 5) useTwin.setState({ pinned: null })
      }}
    >
      <ForestScene mode="twin" onView={setView}>
        <div className="twin-top">
          <div className="layers float" role="group" aria-label="Colour layer">
            {(['natural', ...SENSORS.map((s) => s.id)] as Layer[]).map((id) => (
              <button
                key={id}
                className="layer"
                aria-pressed={layer === id}
                onClick={() => chooseLayer(id)}
                {...stop}
              >
                {id === 'natural' ? 'Natural' : SENSOR_BY_ID[id as SensorId].name}
              </button>
            ))}
            <span className="layer-sep" aria-hidden="true" />
            <button className="layer" aria-pressed={growth} onClick={() => chooseLayer('growth')} data-testid="layer-growth" {...stop}>
              Growth Simulation
            </button>
          </div>
        </div>
        <div {...stop}>
          <Legend layer={layer} anyArea={planted.length > 0} others={sitePosts.length - 1} live={liveName(sitePosts)} />
        </div>
        {!growth && !pinned && !hover && (
          <div className="twin-hint float"><MousePointer2 size={17} /> Point at a sensor to read it · Click to pin</div>
        )}
        {growth && <GrowthControls enabled={planted.length > 0} carbon={carbon} />}

        {bundle && !growth && sitePosts.map((p, k) => {
          const values = posts[k]
          if (!values) return null
          const band = layer === 'natural' ? levelOf(values) : bandOf(layer as SensorId, values[layer as SensorId])
          const open = pinned === p.id || (hover === p.id && !pinned)
          return (
            <div key={p.id} className={`anchor post-anchor ${open ? 'post-card-anchor' : ''}`} ref={(el) => { postRefs.current[p.id] = el }}>
              <div className="anchor-inner" style={{ position: 'relative' }}>
                <button
                  className="twin-post"
                  aria-pressed={pinned === p.id}
                  aria-label={`${p.name}: ${band}`}
                  data-testid={`twin-post-${p.id}`}
                  onPointerEnter={(e) => { measure(p.id, e.currentTarget); setHover(p.id) }}
                  onPointerLeave={() => setHover((h) => (h === p.id ? null : h))}
                  {...stop}
                  onClick={(e) => { measure(p.id, e.currentTarget); useTwin.setState({ pinned: pinned === p.id ? null : p.id }) }}
                >
                  <span className={`tp-dot ${band}`}>{p.live ? <Camera size={12} strokeWidth={2.4} /> : <Radio size={12} strokeWidth={2.4} />}</span>
                  {layer === 'natural'
                    ? p.name.replace('Sensor post', 'Post')
                    : <span className="num">{formatReading(layer as SensorId, values[layer as SensorId])}{SENSOR_BY_ID[layer as SensorId].unit && <small> {SENSOR_BY_ID[layer as SensorId].unit}</small>}</span>}
                </button>
                {open && (
                  <FloatingCard host={hostRef} className={`hover-card float ${pinned === p.id ? 'pinned' : ''}`} style={cardStyle(place[p.id])} testId="hover-card">
                    <PostCard post={p} frame={bundle.frame} values={values} pinned={pinned === p.id} layer={layer} />
                  </FloatingCard>
                )}
              </div>
            </div>
          )
        })}
        {patches.map((p) => {
          const area = areas[p.id]
          const step = areaStep(tasks.find((t) => t.id === area?.taskId))
          const { word, Icon } = STEP_LABEL[step]
          const isPinned = pinned === p.id
          const open = !!area && (isPinned || (hover === p.id && !pinned))
          return (
            <div
              key={p.id}
              className={`anchor anchor-patch ${open ? 'post-card-anchor' : ''}`}
              ref={(el) => { patchRefs.current[p.id] = el }}
              style={{ display: area ? undefined : 'none' }}
            >
              <div className="anchor-inner" style={{ position: 'relative' }}>
                <button
                  className="area-label"
                  aria-pressed={growth ? undefined : isPinned}
                  aria-label={`Replant area: ${word}. Species Suggestion`}
                  data-testid={`area-label-${p.id}`}
                  onPointerEnter={(e) => { measure(p.id, e.currentTarget, SPECIES_CARD_W); setHover(p.id) }}
                  onPointerLeave={() => setHover((h) => (h === p.id ? null : h))}
                  onFocus={(e) => { measure(p.id, e.currentTarget, SPECIES_CARD_W); setHover(p.id) }}
                  onBlur={() => setHover((h) => (h === p.id ? null : h))}
                  {...stop}
                  onClick={(e) => {
                    measure(p.id, e.currentTarget, SPECIES_CARD_W)
                    if (growth) view?.flyToArea(p.centroid.x, p.centroid.z, p.areaM2)
                    else useTwin.setState({ pinned: isPinned ? null : p.id })
                  }}
                >
                  <span className="key-area sm" aria-hidden="true" />
                  <Icon size={16} aria-hidden="true" />
                  {word}
                </button>
                {open && area && (
                  <FloatingCard host={hostRef} className={`hover-card float species-card ${isPinned ? 'pinned' : ''}`} style={cardStyle(place[p.id])}>
                    <SpeciesCard area={area} patch={p} pinned={isPinned} growth={growth} />
                  </FloatingCard>
                )}
              </div>
            </div>
          )
        })}
      </ForestScene>
    </div>
  )
}
