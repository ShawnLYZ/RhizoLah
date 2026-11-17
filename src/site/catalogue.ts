import { formatLatLng, type LatLng } from '../geo/geo'
import { PATCH_OUTLINES } from './canopyOutlines'

/**
 * One 500 x 500 m Footprint the app can show.
 * - `traced`: the Canopy Map comes from hand-traced Canopy Outlines (Kuala Selangor only).
 * - `generated`: the Canopy Map is computed from live Mapbox Satellite pixels each time the site is opened.
 */
export interface Site {
  id: string
  name: string
  /** Used in "Fly to ...", pin labels and captions. */
  shortName: string
  region: string
  centre: LatLng
  source: 'traced' | 'generated'
  /** false = "Coming Soon". */
  live: boolean
  origin: 'catalogue' | 'added'
}

export const KSL_ID = 'ksl'

/**
 * The site catalogue.
 * To turn a "Coming Soon" site into "Fly to ...", change its `live` from false to true: that is the whole change.
 * Its forest, sensor posts and Replant Patches are generated the first time it is opened.
 */
export const CATALOGUE_SITES: readonly Site[] = [
  { id: KSL_ID, name: 'Kuala Selangor Nature Park', shortName: 'Kuala Selangor', region: 'Selangor', centre: { lat: 3.33656, lng: 101.23674 }, source: 'traced', live: true, origin: 'catalogue' },
  { id: 'pulau-ketam', name: 'Pulau Ketam', shortName: 'Pulau Ketam', region: 'Selangor', centre: { lat: 3.0215, lng: 101.2565 }, source: 'generated', live: false, origin: 'catalogue' },
  { id: 'kukup', name: 'Kukup Island National Park', shortName: 'Kukup Island', region: 'Johor', centre: { lat: 1.325, lng: 103.4245 }, source: 'generated', live: false, origin: 'catalogue' },
  { id: 'kuching-wetlands', name: 'Kuching Wetlands National Park', shortName: 'Kuching Wetlands', region: 'Sarawak', centre: { lat: 1.7, lng: 110.405 }, source: 'generated', live: false, origin: 'catalogue' },
  { id: 'semporna', name: 'Semporna marine park fringes', shortName: 'Semporna', region: 'Sabah', centre: { lat: 4.483, lng: 118.615 }, source: 'generated', live: false, origin: 'catalogue' },
]

export const KSL_SITE = CATALOGUE_SITES[0]

/** A Generated Site the user created with "Add Location". Only this is saved: never pixels or a model. */
export interface AddedLocation {
  id: string
  name: string
  centre: LatLng
  addedAt: number
}

const asSite = new WeakMap<AddedLocation, Site>()

/** The Site for an Added Location (the same object every time, so it is safe in store selectors). */
export function addedSite(loc: AddedLocation): Site {
  let s = asSite.get(loc)
  if (!s) {
    s = {
      id: loc.id, name: loc.name, shortName: loc.name, region: formatLatLng(loc.centre, 4), centre: loc.centre,
      source: 'generated', live: true, origin: 'added',
    }
    asSite.set(loc, s)
  }
  return s
}

export function findSite(id: string, locations: readonly AddedLocation[]): Site | null {
  const c = CATALOGUE_SITES.find((s) => s.id === id)
  if (c) return c
  const l = locations.find((x) => x.id === id)
  return l ? addedSite(l) : null
}

/** Live sites in display order: Kuala Selangor, other live Catalogue Sites, then Added Locations oldest first. */
export function liveSites(locations: readonly AddedLocation[]): Site[] {
  return [
    ...CATALOGUE_SITES.filter((s) => s.live),
    ...[...locations].sort((a, b) => a.addedAt - b.addedAt).map(addedSite),
  ]
}

export const comingSoonSites = (): Site[] => CATALOGUE_SITES.filter((s) => !s.live)

/** The globe framing on Malaysia. */
export const MALAYSIA_VIEW = { center: [109.4, 3.9] as [number, number], zoom: 4.55 }

export interface SensorPost {
  id: string
  name: string
  x: number
  z: number
  /** Only Sensor post 9 streams live (the station, with the camera); the other posts are read from the Field Model. */
  live: boolean
}

/** The live post's name ("Sensor post 9"), for labels that point at it. */
export const liveName = (posts: readonly SensorPost[]): string => posts.find((p) => p.live)?.name ?? 'the live post'

/** How far each post's colour spreads in the Digital Twin, in metres. */
export const POST_RADIUS_M = 55

export type PatchId = 'patch-1' | 'patch-2' | 'patch-3'

export interface ReplantPatch {
  id: PatchId
  ring: readonly number[]
  areaM2: number
  centroid: { x: number; z: number }
}

/** The station (the live post), the other sensor posts and the Replant Patches of one Site. */
export interface SiteLayout {
  /** Where the live post stands. */
  station: { x: number; z: number }
  /** In number order; the one with `live` (Sensor post 9 when there are nine or more) is the only live one. */
  posts: SensorPost[]
  /** In the order the replanting scan offers them. */
  patches: ReplantPatch[]
  /** Whether the Footprint contains any water. */
  hasWater: boolean
}

/** Kuala Selangor's layout, picked by hand during tracing. Sensor post 9 is the live station. */
export const KSL_LAYOUT: SiteLayout = {
  station: { x: 76, z: 184 },
  posts: [
    { id: 'post-1', name: 'Sensor post 1', x: -212, z: -148, live: false },
    { id: 'post-2', name: 'Sensor post 2', x: -70, z: -200, live: false },
    { id: 'post-3', name: 'Sensor post 3', x: 60, z: -180, live: false },
    { id: 'post-4', name: 'Sensor post 4', x: 200, z: -150, live: false },
    { id: 'post-5', name: 'Sensor post 5', x: -170, z: -20, live: false },
    { id: 'post-6', name: 'Sensor post 6', x: 24, z: 4, live: false },
    { id: 'post-7', name: 'Sensor post 7', x: 200, z: 60, live: false },
    { id: 'post-8', name: 'Sensor post 8', x: -140, z: 140, live: false },
    { id: 'post-9', name: 'Sensor post 9', x: 76, z: 184, live: true },
    { id: 'post-10', name: 'Sensor post 10', x: 190, z: 210, live: false },
  ],
  // Real bare or gap areas of the image, in catalogue order.
  patches: PATCH_OUTLINES.map((p) => ({
    id: p.id as PatchId,
    ring: p.ring,
    areaM2: p.areaM2,
    centroid: { x: p.centroid[0], z: p.centroid[1] },
  })),
  hasWater: true,
}
