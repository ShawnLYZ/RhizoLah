import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import {
  BookOpen, File, FileImage, FilePen, FileSpreadsheet, FileText, FileType, Link, Presentation, SquareArrowOutUpRight, Trash2, Upload as UploadIcon, X,
} from 'lucide-react'
import { Modal } from '../ui/components'
import { formatMYTDateTime } from '../ui/time'
import { BUILT_IN_SOURCES, type SourceId } from './sources'
import {
  addUpload, fileKind, formatSize, KIND_WORD, listUploads, MAX_UPLOAD_BYTES, openUpload, removeUpload, type FileKind, type Upload,
} from './uploads'

/** One Knowledgebase for the whole app. `focus` scrolls a Built-in Source into view and highlights it. */
export const useKnowledgebase = create<{ open: boolean; focus: SourceId | null }>(() => ({ open: false, focus: null }))

export function openKnowledgebase(focus: SourceId | null = null) {
  useKnowledgebase.setState({ open: true, focus })
}

const KIND_ICON: Record<FileKind, typeof File> = {
  pdf: FileText, word: FilePen, excel: FileSpreadsheet, powerpoint: Presentation, image: FileImage, text: FileType, other: File,
}

/** The top-bar button: white, a book icon and the word; the word hides on narrow screens. */
export function KnowledgebaseButton() {
  return (
    <button className="btn btn-sm kb-btn" onClick={() => openKnowledgebase()} title="Knowledgebase" aria-label="Knowledgebase" data-testid="knowledgebase-button">
      <BookOpen size={18} /> <span className="kb-btn-word">Knowledgebase</span>
    </button>
  )
}

export function KnowledgebaseDialog() {
  const open = useKnowledgebase((s) => s.open)
  const focus = useKnowledgebase((s) => s.focus)
  const [uploads, setUploads] = useState<Upload[]>([])
  const [messages, setMessages] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const body = useRef<HTMLDivElement>(null)

  const refresh = () => listUploads().then(setUploads, () => setUploads([]))

  // Other tabs' uploads show the next time the dialog opens.
  useEffect(() => {
    if (!open) return
    setMessages([])
    refresh()
  }, [open])

  useEffect(() => {
    if (!open || !focus) return
    const raf = requestAnimationFrame(() => {
      body.current?.querySelector(`[data-source="${focus}"]`)?.scrollIntoView({ block: 'center' })
    })
    return () => cancelAnimationFrame(raf)
  }, [open, focus])

  const close = () => useKnowledgebase.setState({ open: false, focus: null })

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    const notes: string[] = []
    for (const f of Array.from(files)) {
      if (f.size > MAX_UPLOAD_BYTES) { notes.push(`${f.name} is larger than 25 MB.`); continue }
      try {
        await addUpload(f)
      } catch {
        notes.push('This browser could not store the file.')
      }
    }
    setMessages([...new Set(notes)])
    await refresh()
    setBusy(false)
    if (input.current) input.current.value = ''
  }

  return (
    <Modal open={open} onClose={close} label="Knowledgebase" className="kb-modal">
      <div className="kb" data-testid="knowledgebase-dialog">
        <div className="kb-head">
          <h2><BookOpen size={22} /> Knowledgebase</h2>
          <button className="icon-btn" onClick={close} aria-label="Close"><X size={22} /></button>
        </div>
        <div className="kb-body" ref={body}>
          <h3 className="kb-sub">Built-in sources</h3>
          <ul className="kb-list">
            {BUILT_IN_SOURCES.map((s) => (
              <li key={s.id} className={`kb-row ${focus === s.id ? 'kb-focus' : ''}`} data-source={s.id}>
                <span className="kb-icon" aria-hidden="true">{s.kind === 'pdf' ? <FileText size={20} /> : <Link size={20} />}</span>
                <div className="kb-text">
                  <span className="kb-title">{s.title}</span>
                  <span className="kb-meta">{s.kind === 'pdf' ? 'PDF' : 'Link'} · {s.by} · <span className="num">{s.year}</span></span>
                </div>
                <a className="btn btn-sm" href={s.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${s.title}`}>
                  <SquareArrowOutUpRight size={15} /> Open
                </a>
              </li>
            ))}
          </ul>
          <h3 className="kb-sub">Your uploads</h3>
          {uploads.length ? (
            <ul className="kb-list">
              {uploads.map((u) => {
                const kind = fileKind(u.name, u.type)
                const Icon = KIND_ICON[kind]
                return (
                  <li key={u.id} className="kb-row">
                    <span className="kb-icon" aria-hidden="true"><Icon size={20} /></span>
                    <div className="kb-text">
                      <span className="kb-title kb-file">{u.name}</span>
                      <span className="kb-meta num">{KIND_WORD[kind]} · {formatSize(u.size)} · added {formatMYTDateTime(u.addedAt)}</span>
                    </div>
                    <div className="kb-actions">
                      <button className="btn btn-sm" onClick={() => openUpload(u)} aria-label={`Open ${u.name}`}><SquareArrowOutUpRight size={15} /> Open</button>
                      <button
                        className="btn btn-sm"
                        aria-label={`Remove ${u.name}`}
                        onClick={() => { removeUpload(u.id).then(refresh, refresh) }}
                      >
                        <Trash2 size={15} /> Remove
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : <p className="kb-none">No uploads yet.</p>}
        </div>
        <div className="kb-foot">
          {messages.length > 0 && <div className="kb-msg" role="alert">{messages.map((m) => <p key={m}>{m}</p>)}</div>}
          <div className="kb-foot-row">
            <button className="btn" onClick={() => input.current?.click()} disabled={busy} data-testid="kb-upload">
              <UploadIcon size={18} /> Upload
            </button>
            <p>Uploads stay in this browser. The Species Suggestion and Ask AI cite the built-in sources only.</p>
          </div>
          <input ref={input} type="file" multiple hidden onChange={(e) => onFiles(e.target.files)} />
        </div>
      </div>
    </Modal>
  )
}
