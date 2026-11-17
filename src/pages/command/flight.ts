// Shared by "Fly to ..." and the Location Picker: view maths for a 500 m square, and the Hand-over capture.

import { navigate } from '../../app/router'
import { setHandover } from '../../app/handover'
import { KSL_SITE } from '../../site/catalogue'

const EQUATOR_M_PER_PX = 78_271.516_964 // Mapbox GL at zoom 0 (512 px world tile)
const rad = (deg: number) => (deg * Math.PI) / 180

/** Metres per screen pixel at a latitude and zoom. */
export const metresPerPixel = (lat: number, zoom: number) => (EQUATOR_M_PER_PX * Math.cos(rad(lat))) / 2 ** zoom

/** The zoom at which `metres` on the ground span `pixels` on screen. */
export const zoomFor = (lat: number, metres: number, pixels: number) => Math.log2((EQUATOR_M_PER_PX * Math.cos(rad(lat)) * pixels) / metres)

/** Where a fly-in ends: 16.25 at Kuala Selangor, and the same ground scale at any other latitude. */
export const flyZoom = (lat: number) => 16.25 + Math.log2(Math.cos(rad(lat)) / Math.cos(rad(KSL_SITE.centre.lat)))

/**
 * Holds the globe's next frame and opens Satellite Intelligence with it,
 * so the satellite panel starts exactly where the globe's view ended.
 */
export function handOver(map: mapboxgl.Map) {
  map.once('render', () => {
    try {
      const canvas = map.getCanvas()
      const c = map.getCenter()
      setHandover({
        image: canvas.toDataURL('image/jpeg', 0.9),
        center: [c.lng, c.lat],
        zoom: map.getZoom(),
        width: canvas.clientWidth,
        height: canvas.clientHeight,
      })
    } catch {
      setHandover(null)
    }
    navigate('satellite', 'handover')
  })
  map.triggerRepaint()
}
