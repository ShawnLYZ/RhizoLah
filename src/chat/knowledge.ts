// What Ask RhizoLah! may say from each Built-in Source. The chat is told to answer only from these lines and the live
// situation, and to cite the id after every sentence that uses one. K1 to K3 hold the figures the app's own rules
// already cite (species.ts, growth.ts); K4 to K7 were read from the linked pages on 17 November 2026.
// Short paraphrased facts only: nothing is copied from the documents beyond figures and names.

import { BUILT_IN_SOURCES, type SourceId } from '../knowledge/sources'

export const SOURCE_FACTS: Record<SourceId, readonly string[]> = {
  K1: [
    'Salinity table (p. 26): where salinity is above 25 PSU, plant Avicennia marina or Sonneratia alba.',
    'Salinity table (p. 26): where salinity is 15 to 25 PSU, plant Rhizophora (R. mucronata, R. apiculata) or Bruguiera (B. gymnorhiza).',
    'Zones (p. 3): Rhizophora mucronata grows on creek banks; Rhizophora apiculata and Bruguiera grow in the central zone of the forest.',
    'The manual guides rehabilitation of coastal forests damaged by natural hazards (such as tsunamis and storms) in the Asia-Pacific region.',
  ],
  K2: [
    'Most mangrove soils have a pH between 6 and 7; some are as low as 5.',
    'A tree is counted as a tree when it is at least 1.3 m tall with a stem of at least 2.5 cm (the definition shared with K4).',
    'Ecological Mangrove Rehabilitation: first understand why mangroves were lost and fix the cause, especially the normal tidal flooding (hydrology), so seedlings can arrive and settle naturally; plant only where natural recruitment does not happen.',
  ],
  K3: [
    'Measured Rhizophora apiculata plantation in Samut Songkram, Thailand, planted at 25,000 per hectare.',
    'Mean height (p. 7839): 0.51 m at year 1, 1.27 m at year 2, 1.83 m at year 3, 3.78 m at year 5, 7.93 m at year 10, 11.5 m at year 15.',
    'Stem diameter (pp. 7838 to 7839): 1.16 cm at year 3, 2.23 cm at year 5, 4.36 cm at year 10, 6.54 cm at year 15.',
    'Survival (p. 7838): 94.4% still standing at year 1, 84.4% at year 2 and 34.8% at year 15.',
  ],
  K4: [
    'Matang Mangrove Forest Reserve (Perak, Malaysia) has been managed systematically since 1902: first thinning at 15 years, second at 20 years, clear-felling of 30-year-old blocks.',
    'After clear-felling, Matang is replanted with Rhizophora apiculata at 1.2 m spacing and Rhizophora mucronata at 1.8 m spacing.',
    'Rhizophora apiculata density was 4,331, 2,753 and 1,767 stems per hectare at 15, 20 and 30 years.',
    'Above-ground biomass was about 216 to 217 t/ha at 15 and 20 years, 372 t/ha at 30 years and 415 t/ha in the untouched (virgin) reserve.',
    'The authors suggest artificial regeneration (planting) only if natural recruitment is below 50%, rather than the current 90% threshold.',
  ],
  K5: [
    'Carey Island, Selangor, Malaysia: Rhizophora apiculata mangroves were lost to wave erosion before 2008.',
    'A submerged detached breakwater was built (finished early 2009) to calm waves and trap sediment; the seabed rose and silt and clay increased behind it.',
    'Nursery-raised 20 cm seedlings of Rhizophora apiculata and Avicennia marina were planted in a grid with coir logs; almost all died within a year, toppled by high tides and waves (5% survival).',
    'Natural recruits of Avicennia marina and Rhizophora apiculata later grew behind the breakwater to more than 1 m tall.',
    'Avicennia marina is the pioneer species of Peninsular Malaysia; it takes root where water is calm and the ground is high enough relative to mean sea level, and dies under constant flooding.',
  ],
  K6: [
    'About 1.1 million ha of mangroves have been lost since 1996; about 818,300 ha have high potential to be restored.',
    'Some regions still see restoration failure rates of up to 80%, which good practice can prevent.',
    'Best practice moves away from single-species mass tree-planting towards inclusive, ecological restoration.',
    'Six guiding principles apply across the project cycle, including "safeguard nature and maximise biodiversity" and "design for sustainability".',
    'Restoration can strengthen coastal resilience, fisheries, biodiversity and carbon storage (blue carbon).',
  ],
  K7: [
    'Mangrove planting is very popular, but most planting efforts fail to restore a functional mangrove forest.',
    'Restore the right physical and social conditions first (Ecological Mangrove Restoration); then nature does the rest.',
    'Done this way, restoration gives better survival, faster growth and a more diverse forest, when species are matched to the site.',
    'Planting can help or enrich natural regeneration, but avoid planting where mangroves never grew or where natural recruitment already happens.',
  ],
}

/** The Knowledgebase block of the system prompt. */
export function knowledgeText(): string {
  return BUILT_IN_SOURCES.map((s) => [
    `[${s.id}] ${s.cite}: "${s.title}" (${s.by}, ${s.year})`,
    ...SOURCE_FACTS[s.id].map((f) => `  - ${f}`),
  ].join('\n')).join('\n\n')
}
