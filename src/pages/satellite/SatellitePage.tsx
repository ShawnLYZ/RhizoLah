import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Navigation2, Satellite, Scan } from 'lucide-react'
import { FootprintMap } from '../../maps/FootprintMap'
import { ForestScene } from '../../forest/ForestScene'
import { takeHandover } from '../../app/handover'
import { navigate } from '../../app/router'
import { currentSite, useApp } from '../../state/store'
import { useSite } from '../../forest/forestData'
import { formatLatLng, siteFrame } from '../../geo/geo'
import { liveName, type SensorPost } from '../../site/catalogue'
import { BAND_WORD } from '../../ui/components'
import { prefersReducedMotion } from '../../ui/hooks'
import type { ForestView } from '../../forest/view'

const NO_POSTS: readonly SensorPost[] = []

/** Every post is labelled "Post N" over the 3D forest, live or not. */
const postLabel = (p: SensorPost) => p.name.replace('Sensor post', 'Post')

export function SatellitePage() {
  const [handover] = useState(() => takeHandover())
  const year = useApp((s) => s.year)
  const level = useApp((s) => s.level)
  const site = useApp(currentSite)
  const frame = useMemo(() => siteFrame(site.centre), [site])
  const layout = useSite((s) => s.bundle?.layout ?? null)
  const posts = layout?.posts ?? NO_POSTS
  const [view, setView] = useState<ForestView | null>(null)
  const [touched, setTouched] = useState(false)
  const [diving, setDiving] = useState(false)
  const postRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Sensor posts float over the 3D forest, a little above each pole.
  useEffect(() => {
    if (!view) return
    const els: HTMLElement[] = []
    for (const p of posts) {
      const el = postRefs.current[p.id]
      if (!el) continue
      view.addAnchor(el, p.x, view.groundHeight(p.x, p.z) + 5.4, p.z)
      els.push(el)
    }
    return () => els.forEach((e) => view.removeAnchor(e))
  }, [view, posts])

  // Only the live post (Sensor post 9) is live: clicking it dives down to the post, then opens Sentinel Network.
  const dive = () => {
    if (diving) return
    if (!view || !layout || prefersReducedMotion()) {
      navigate('network', 'slow-fade')
      return
    }
    setDiving(true)
    view.diveTo(layout.station.x, layout.station.z).then(() => navigate('network', 'dive'))
  }

  return (
    <div className="split">
      <section className="panel" aria-label="Real satellite image">
        <div className="panel-view satellite">
          <FootprintMap key={site.id} frame={frame} handover={handover} padding={28} />
          <div className="north" aria-label="North is up"><Navigation2 size={16} fill="currentColor" strokeWidth={0} />N</div>
        </div>
        <div className="panel-cap">
          <span><Satellite size={19} /> Real satellite image · {site.shortName.trim() || formatLatLng(site.centre, 4)}</span>
          <span className="muted num">500 × 500 m · north up</span>
        </div>
      </section>
      <section className="panel" aria-label="3D model of the same forest">
        <div className={`panel-view forest-dive ${diving ? 'diving posts-hidden' : ''}`} onPointerDown={() => setTouched(true)} onWheel={() => setTouched(true)}>
          <ForestScene mode="natural" onView={setView}>
            {year > 1 && <span className="pill growth-chip">Includes simulated growth</span>}
            <button className="icon-btn view-reset" title="Back to the whole forest" aria-label="Back to the whole forest" onClick={() => view?.frameAll(true)}>
              <Scan size={19} />
            </button>
            <div className={`view-hint ${touched ? 'gone' : ''}`}>Drag to turn · Scroll to zoom · Click {liveName(posts)} for live readings</div>

            {posts.map((p) => (
              <div key={p.id} className="anchor post-anchor" ref={(el) => { postRefs.current[p.id] = el }} style={p.live ? { zIndex: 5 } : undefined}>
                <div className="anchor-inner">
                  {p.live ? (
                    <button
                      className={`post-live ${level}`}
                      aria-label={`${p.name}: ${BAND_WORD[level]}. Open Sentinel Network`}
                      onClick={dive}
                      onPointerDown={(e) => e.stopPropagation()}
                      data-testid="post-live"
                    >
                      <span className="pin-dot" />
                      <span className="pin-label">{postLabel(p)}<small>Live · open readings</small></span>
                    </button>
                  ) : (
                    <span className="post-idle-pin" title={`${p.name} (not live)`}>
                      <span className="post-idle" />
                      <span className="pin-label">{postLabel(p)}</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </ForestScene>
        </div>
        <div className="panel-cap">
          <span><Box size={19} /> 3D model of the same forest</span>
          <span className="muted">{layout ? `${posts.length} sensor post${posts.length === 1 ? '' : 's'}` : ''}</span>
        </div>
      </section>
    </div>
  )
}
