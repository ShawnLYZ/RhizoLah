// The Digital Twin's colours for the Mangrove Species and the Soil Type chosen on the Sentinel Network.
// Illustrative colours picked so each choice is easy to tell apart on a projector. They are not measured leaf or
// soil colours, and they change nothing else in the demo.

import type { Species } from '../sim/species'
import type { SoilTexture } from '../sim/soil'

export type Rgb = readonly [number, number, number]

export interface Look {
  /** Multiplies the natural colour in the 3D forest (1, 1, 1 changes nothing). */
  tint: Rgb
  /** The same colour as a legend swatch. */
  swatch: string
}

export const SPECIES_LOOK: Record<Species, Look> = {
  'Avicennia marina': { tint: [1.5, 1.4, 1.05], swatch: '#A9AD7C' },
  'Sonneratia alba': { tint: [1.15, 1.75, 0.75], swatch: '#7DBB52' },
  'Rhizophora mucronata': { tint: [0.6, 0.95, 0.6], swatch: '#3E7A45' },
  'Rhizophora apiculata': { tint: [1.35, 1.2, 0.35], swatch: '#93902F' },
  'Bruguiera gymnorhiza': { tint: [0.55, 1.0, 1.2], swatch: '#3C8185' },
}

export const SOIL_LOOK: Record<SoilTexture, Look> = {
  'Sandy mud': { tint: [2.3, 1.95, 1.3], swatch: '#CDB587' },
  'Silty mud': { tint: [1.45, 1.1, 0.8], swatch: '#94765A' },
  'Clay mud': { tint: [0.6, 0.68, 0.85], swatch: '#5A6170' },
}
