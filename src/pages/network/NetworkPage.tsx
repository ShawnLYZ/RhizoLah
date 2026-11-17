import { useEffect, useMemo, useRef, useState } from 'react'
import { SENSORS, SENSOR_BY_ID, bandOf, formatReading, listSensors, lowerName, sensorsIn, type Band, type SensorId, type SensorSpec } from '../../sim/ranges'
import { TICK_MS } from '../../sim/engine'
import { SPECIES_LIST } from '../../sim/species'
import { SOIL_TEXTURES } from '../../sim/soil'
import { areaIds, currentSite, siteAreas, useApp } from '../../state/store'
import { useSite } from '../../forest/forestData'
import { siteFrame } from '../../geo/geo'
import { liveName } from '../../site/catalogue'
import { AnimatedNumber, BandIcon, BAND_WORD, Sparkline, StatusChip } from '../../ui/components'
import { FootprintMap } from '../../maps/FootprintMap'
import { CameraPanel } from './CameraPanel'
import { ScanOverlay, useScanOverlay } from './ScanOverlay'

const HEALTHY_RANGE: Record<string, [number | null, number | null]> = {
  salinity: [null, 35], turbidity: [null, 25], water_temp: [20, 32],
  wave_height: [null, 0.5], water_level: [null, 1.8], wave_velocity: [null, 0.5],
  mud_ph: [6, 8], mud_ec: [null, 45], mud_temp: [20, 32], mud_redox: [-100, null],
}

function bannerSentence(level: Band, warning: string[], danger: SensorId[]) {
  if (level === 'healthy') return 'All readings are in the healthy range. The mangroves are doing well.'
  if (level === 'warning') return `Some readings are outside the healthy range: ${warning.join(', ')}. Keep an eye on them.`
  return `${listSensors(danger)} ${danger.length > 1 ? 'are' : 'is'} in the danger range. The camera has been asked to photograph the trees.`
}

function Banner() {
  const level = useApp((s) => s.level)
  const reading = useApp((s) => s.reading)
  const warn = sensorsIn(reading, 'warning').concat(sensorsIn(reading, 'danger'))
  const danger = sensorsIn(reading, 'danger')
  const warnNames = warn.map(lowerName)
  // The readings come from the live post, so the banner names it ("Post 9", as on the maps).
  const posts = useSite((s) => s.bundle?.layout.posts ?? null)
  const post = posts ? liveName(posts).replace('Sensor post', 'Post') : null
  return (
    <section className={`banner ${level}`} role="status" aria-live="polite" data-testid="level-banner">
      {post && <div className="banner-post" title={`Readings from ${liveName(posts!)}`}>{post}</div>}
      <div className="banner-icon"><BandIcon band={level} size={32} /></div>
      <div className="banner-text">
        <div className="banner-word">{BAND_WORD[level]}</div>
        <p className="banner-sentence">{bannerSentence(level, warnNames, danger)}</p>
      </div>
      <div className="banner-live"><span className="live-dot" /> Live · every 2 s</div>
    </section>
  )
}

function SensorCard({ spec }: { spec: SensorSpec }) {
  const value = useApp((s) => s.reading[spec.id])
  const history = useApp((s) => s.history[spec.id])
  const band = bandOf(spec.id, value)
  const prev = useRef<Band>(band)
  const [flash, setFlash] = useState(false)
  useEffect(() => {
    if (band === 'danger' && prev.current !== 'danger') {
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 1000)
      prev.current = band
      return () => clearTimeout(t)
    }
    prev.current = band
  }, [band])
  return (
    <article className={`sensor ${spec.group} ${band} ${flash ? 'just-danger' : ''}`} data-testid={`sensor-${spec.id}`}>
      <div className="sensor-top">
        <h3 className="sensor-name">{spec.name}</h3>
        <StatusChip band={band} size="sm" />
      </div>
      <p className="sensor-hint">{spec.hint}</p>
      <div className="sensor-foot">
      <div className="sensor-value">
        <strong className="num"><AnimatedNumber value={value} decimals={spec.decimals} /></strong>
        {spec.unit && <span>{spec.unit}</span>}
      </div>
      <Sparkline
        values={history}
        healthy={HEALTHY_RANGE[spec.id]}
        minSpan={spec.wobble * 3}
        band={band}
        stepSeconds={TICK_MS / 1000}
        label={spec.name}
        format={(v) => `${formatReading(spec.id, v)}${spec.unit ? ` ${spec.unit}` : ''}`}
      />
      </div>
    </article>
  )
}

/** A chooser in the sensor grid. "None" is the empty choice. Its only effect is the Digital Twin's colour. */
function ChoiceCard<T extends string>({ id, title, hint, value, options, onChange }: {
  id: string; title: string; hint: string; value: T | null; options: readonly T[]; onChange(v: T | null): void
}) {
  return (
    <article className="sensor choice" data-testid={`choice-${id}`}>
      <div className="sensor-top">
        <h3 className="sensor-name" id={`choice-${id}-name`}>{title}</h3>
      </div>
      <p className="sensor-hint">{hint}</p>
      <div className="sensor-foot">
        <select
          className="choice-select"
          aria-labelledby={`choice-${id}-name`}
          value={value ?? ''}
          onChange={(e) => onChange(options.find((o) => o === e.target.value) ?? null)}
        >
          <option value="">None</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    </article>
  )
}

function Choices() {
  const species = useApp((s) => s.chosenSpecies)
  const soil = useApp((s) => s.chosenSoil)
  return (
    <>
      <ChoiceCard
        id="species" title="Mangrove Species" hint="Select for Calibration"
        value={species} options={SPECIES_LIST} onChange={(v) => useApp.getState().setChosenSpecies(v)}
      />
      <ChoiceCard
        id="soil" title="Soil Type" hint="Select for Calibration"
        value={soil} options={SOIL_TEXTURES} onChange={(v) => useApp.getState().setChosenSoil(v)}
      />
    </>
  )
}

function StationCard() {
  const level = useApp((s) => s.level)
  const site = useApp(currentSite)
  const frame = useMemo(() => siteFrame(site.centre), [site])
  const layout = useSite((s) => s.bundle?.layout ?? null)
  const areas = useApp((s) => siteAreas(s, site.id))
  const planted = layout ? areaIds(layout.patches, areas) : []
  // Kuala Selangor's live post (Sensor post 9) was placed by hand on the bank of the river channel in the
  // south-east, about 10 m from the water. A generated station stands beside water when the square has any,
  // otherwise in the forest.
  const where = site.source === 'traced' ? 'Beside the river' : layout ? (layout.hasWater ? 'Beside the water' : 'In the forest') : null
  return (
    <section className="card station-card" aria-label="Station map">
      <div className="card-head">
        <h2>Station</h2>
        <span className="cam-status">{where ? `${where}, ${site.shortName}` : site.shortName}</span>
      </div>
      <div className="station-map">
        <FootprintMap key={site.id} frame={frame} layout={layout} padding={10} interactive={false} showStation stationDanger={level === 'danger'} planted={planted} />
      </div>
    </section>
  )
}

export function NetworkPage() {
  const scanning = useScanOverlay((s) => s.open)
  return (
    <div className="network">
      <Banner />
      <div className="sensors" aria-label="Sensor readings">
        {/* First row: the two choosers, then mud redox at the right. The other nine follow in catalogue order. */}
        <Choices />
        <SensorCard spec={SENSOR_BY_ID.mud_redox} />
        {SENSORS.filter((s) => s.id !== 'mud_redox').map((s) => <SensorCard key={s.id} spec={s} />)}
      </div>
      <div className="side">
        <CameraPanel />
        <StationCard />
      </div>
      {scanning && <ScanOverlay onClose={() => useScanOverlay.setState({ open: false })} />}
    </div>
  )
}
