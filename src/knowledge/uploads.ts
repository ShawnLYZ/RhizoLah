// Knowledgebase Uploads: files the user added, kept in this browser only (IndexedDB, because localStorage is too
// small for files). Nothing reads an Upload's contents and no Upload is ever cited. Demo Reset does not touch them.

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

export interface Upload {
  id: string
  name: string
  /** The browser's media type; may be empty. */
  type: string
  size: number
  addedAt: number
  blob: Blob
}

const DB = 'rhizolah-knowledgebase'
const STORE = 'uploads'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no IndexedDB')); return }
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      let result: T
      req.onsuccess = () => { result = req.result }
      tx.oncomplete = () => resolve(result)
      tx.onerror = () => reject(tx.error ?? req.error)
      tx.onabort = () => reject(tx.error ?? new Error('aborted'))
    })
  } finally {
    db.close()
  }
}

/** All Uploads, newest first. */
export async function listUploads(): Promise<Upload[]> {
  const all = await run<Upload[]>('readonly', (s) => s.getAll() as IDBRequest<Upload[]>)
  return all.sort((a, b) => b.addedAt - a.addedAt)
}

export async function addUpload(file: File): Promise<Upload> {
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const u: Upload = { id, name: file.name, type: file.type, size: file.size, addedAt: Date.now(), blob: file }
  await run('readwrite', (s) => s.put(u))
  return u
}

export async function removeUpload(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id))
}

export type FileKind = 'pdf' | 'word' | 'excel' | 'powerpoint' | 'image' | 'text' | 'other'

const ext = (name: string) => (name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '')

export function fileKind(name: string, type: string): FileKind {
  const e = ext(name)
  if (type === 'application/pdf' || e === 'pdf') return 'pdf'
  if (['doc', 'docx', 'odt', 'rtf'].includes(e) || type.includes('wordprocessingml') || type === 'application/msword') return 'word'
  if (['xls', 'xlsx', 'xlsm', 'ods', 'csv'].includes(e) || type.includes('spreadsheetml') || type === 'application/vnd.ms-excel') return 'excel'
  if (['ppt', 'pptx', 'odp'].includes(e) || type.includes('presentationml') || type === 'application/vnd.ms-powerpoint') return 'powerpoint'
  if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'].includes(e)) return 'image'
  if (type === 'text/plain' || ['txt', 'md'].includes(e)) return 'text'
  return 'other'
}

export const KIND_WORD: Record<FileKind, string> = {
  pdf: 'PDF', word: 'Word', excel: 'Excel', powerpoint: 'PowerPoint', image: 'Image', text: 'Text', other: 'File',
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('en-MY')} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString('en-MY', { maximumFractionDigits: 1 })} MB`
}

/** The media type a file may be shown with inside a browser tab, or null: it is then downloaded, never displayed. */
function viewableType(u: Upload): string | null {
  const t = u.type.toLowerCase()
  const e = ext(u.name)
  if (t === 'application/pdf' || (!t && e === 'pdf')) return 'application/pdf'
  if (/^image\/(png|jpeg|gif|webp|bmp|avif)$/.test(t)) return t
  if (t === 'text/plain') return 'text/plain'
  return null
}

/**
 * PDFs, images (not SVG) and plain text open in a new tab. Everything else, including HTML and SVG, is handed to the
 * browser as a download, so an uploaded web page never runs at the app's own address.
 */
export function openUpload(u: Upload) {
  const type = viewableType(u)
  const url = URL.createObjectURL(new Blob([u.blob], { type: type ?? 'application/octet-stream' }))
  if (type) {
    window.open(url, '_blank', 'noopener')
  } else {
    const a = document.createElement('a')
    a.href = url
    a.download = u.name
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
