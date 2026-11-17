// The Knowledgebase's Built-in Sources: real, public documents shipped as a title and a link only.
// Nothing from them is copied into the project. All seven were read on 16 November 2026.

export type SourceId = 'K1' | 'K2' | 'K3' | 'K4' | 'K5' | 'K6' | 'K7'

export interface BuiltInSource {
  id: SourceId
  title: string
  /** Authors or publisher. */
  by: string
  year: number
  kind: 'pdf' | 'link'
  url: string
  /** A short name used in source lines ("Chan & Baba 2009"). */
  cite: string
}

export const BUILT_IN_SOURCES: readonly BuiltInSource[] = [
  {
    id: 'K1',
    title: 'Manual on Guidelines for Rehabilitation of Coastal Forests damaged by Natural Hazards in the Asia-Pacific Region',
    by: 'Chan & Baba, ISME / ITTO', year: 2009, kind: 'pdf', cite: 'Chan & Baba 2009',
    url: 'https://library.sprep.org/sites/default/files/628.pdf',
  },
  {
    id: 'K2',
    title: 'Ecological Mangrove Rehabilitation: A Field Manual for Practitioners',
    by: 'Lewis & Brown', year: 2014, kind: 'pdf', cite: 'Lewis & Brown 2014',
    url: 'https://mangroveactionproject.org/wp-content/uploads/2025/11/Ecological-Mangrove-Rehabilitation-Field-Manual.pdf',
  },
  {
    id: 'K3',
    title: 'Management Practices and Aboveground Biomass Production Patterns of Rhizophora apiculata Plantation: Study from a Mangrove Area in Samut Songkram Province, Thailand',
    by: 'Hassan et al., BioResources 13(4)', year: 2018, kind: 'pdf', cite: 'Hassan et al. 2018',
    url: 'https://bioresources.cnr.ncsu.edu/wp-content/uploads/2018/08/BioRes_13_4_7826_Hassan_JKP_Aboveground_Biomass_Prodn_Mgmt_Pract_Mangrove_13820-VipakJintana.pdf',
  },
  {
    id: 'K4',
    title: 'Is Matang Mangrove Forest in Malaysia Sustainably Rejuvenating after More than a Century of Conservation and Harvesting Management?',
    by: 'Goessens et al., PLoS ONE 9(8)', year: 2014, kind: 'link', cite: 'Goessens et al. 2014',
    url: 'https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0105069',
  },
  {
    id: 'K5',
    title: 'Long-Term Assessment of an Innovative Mangrove Rehabilitation Project: Case Study on Carey Island, Malaysia',
    by: 'Motamedi et al., The Scientific World Journal', year: 2014, kind: 'link', cite: 'Motamedi et al. 2014',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4109262/',
  },
  {
    id: 'K6',
    title: 'Best practice guidelines for mangrove restoration',
    by: 'Beeston et al. (eds), Global Mangrove Alliance', year: 2023, kind: 'link', cite: 'Global Mangrove Alliance 2023',
    url: 'https://mangrovealliance.org/best-practice-guidelines-for-mangrove-restoration',
  },
  {
    id: 'K7',
    title: 'Mangrove restoration: to plant or not to plant?',
    by: 'Wetlands International', year: 2016, kind: 'link', cite: 'Wetlands International 2016',
    url: 'https://www.wetlands.org/publications/mangrove-restoration-to-plant-or-not-to-plant/',
  },
]

export const SOURCE_BY_ID = Object.fromEntries(BUILT_IN_SOURCES.map((s) => [s.id, s])) as Record<SourceId, BuiltInSource>
