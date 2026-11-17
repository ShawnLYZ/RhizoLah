import { BookOpen } from 'lucide-react'
import { openKnowledgebase } from './Knowledgebase'
import { SOURCE_BY_ID, type SourceId } from './sources'

/**
 * A small numbered source box; the full reference shows on hover or keyboard focus, and a click opens the
 * Knowledgebase at that source. Used by the Species Suggestion, the Growth Simulation and the Ask RhizoLah! chat.
 */
export function SourceButton({ id }: { id: SourceId }) {
  const s = SOURCE_BY_ID[id]
  return (
    <span className="cite-wrap">
      <button className="cite" onClick={() => openKnowledgebase(id)} aria-label={`Source: ${s.cite}. Open in the Knowledgebase`}>
        <BookOpen size={12} aria-hidden="true" />{id.slice(1)}
      </button>
      <span className="cite-pop" role="tooltip">
        <span className="cite-pop-name">{s.cite}</span>
        <span className="cite-pop-title">{s.title}</span>
        <span className="cite-pop-by">{s.by} · {s.year}</span>
        <span className="cite-pop-hint">Click to open in the Knowledgebase</span>
      </span>
    </span>
  )
}
