import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { create } from 'zustand'
import { ArrowUp, CircleAlert, Radio, RotateCcw, Sparkles, Square, X } from 'lucide-react'
import { askRhizoLah, citedSources, type ChatTurn } from './ask'
import { SourceButton } from '../knowledge/SourceButton'
import { openKnowledgebase } from '../knowledge/Knowledgebase'
import type { SourceId } from '../knowledge/sources'
import { navigate } from '../app/router'
import { currentSite, siteAreas, useApp } from '../state/store'

interface Message extends ChatTurn {
  id: number
  /** Set when the answer failed; the text is then the error message. */
  error?: boolean
}

interface ChatState {
  open: boolean
  messages: Message[]
  busy: boolean
}

/** Ask RhizoLah!'s conversation. Memory only: it survives page changes but not a reload, and Demo Reset leaves it. */
const useChat = create<ChatState>(() => ({ open: false, messages: [], busy: false }))

let nextId = 1
let controller: AbortController | null = null

function send(question: string) {
  const q = question.trim()
  const { busy, messages } = useChat.getState()
  if (!q || busy) return
  const history: ChatTurn[] = messages.filter((m) => !m.error).map(({ role, content }) => ({ role, content }))
  const answerId = nextId + 1
  useChat.setState({
    busy: true,
    messages: [...messages, { id: nextId, role: 'user', content: q }, { id: answerId, role: 'assistant', content: '' }],
  })
  nextId += 2
  const update = (patch: Partial<Message>) =>
    useChat.setState((s) => ({ messages: s.messages.map((m) => (m.id === answerId ? { ...m, ...patch } : m)) }))
  controller = new AbortController()
  const signal = controller.signal
  askRhizoLah(history, q, (text) => update({ content: text }), signal)
    .then((text) => update({ content: text }))
    .catch((e: unknown) => {
      if (signal.aborted) {
        // Stopped by the visitor: keep what arrived, or drop the empty answer.
        useChat.setState((s) => ({ messages: s.messages.filter((m) => m.id !== answerId || m.content) }))
        return
      }
      update({ content: e instanceof Error ? e.message : 'Something went wrong. Please ask again.', error: true })
    })
    .finally(() => {
      if (controller?.signal === signal) controller = null
      useChat.setState({ busy: false })
    })
}

function stop() {
  controller?.abort()
}

function clearChat() {
  stop()
  useChat.setState({ messages: [] })
}

/** "[K1, K2]" and "[k1][LIVE]" become "[K1][K2]" and "[K1][Live]", so every tag is one source link. */
function tidyTags(text: string): string {
  return text.replace(/\[\s*((?:K[1-7]|Live)(?:\s*[,;/]\s*(?:K[1-7]|Live))*)\s*\]/gi, (_, inner: string) =>
    inner.split(/\s*[,;/]\s*/).map((t) => (t.toLowerCase() === 'live' ? '[Live]' : `[${t.toUpperCase()}]`)).join(''))
}

/** A [Live] tag: the fact came from the live, simulated readings. A click opens the Sentinel Network. */
function LiveTag() {
  return (
    <span className="cite-wrap">
      <button className="cite cite-live" onClick={() => navigate('network')} aria-label="From the live situation. Open the Sentinel Network">
        <Radio size={12} aria-hidden="true" />Live
      </button>
      <span className="cite-pop" role="tooltip">
        <span className="cite-pop-name">Live situation</span>
        <span className="cite-pop-title">The simulated readings, Replant Areas and tasks at the moment of the question.</span>
        <span className="cite-pop-hint">Click to open the Sentinel Network</span>
      </span>
    </span>
  )
}

/** Bold, italic and source tags inside one line. */
function inline(text: string, key: string): ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*|\[(?:K[1-7]|Live)\])/g).map((part, i) => {
    const k = `${key}-${i}`
    if (/^\[K[1-7]\]$/.test(part)) return <SourceButton key={k} id={part.slice(1, -1) as SourceId} />
    if (part === '[Live]') return <LiveTag key={k} />
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={k}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <i key={k}>{part.slice(1, -1)}</i>
    return <Fragment key={k}>{part}</Fragment>
  })
}

/** Paragraphs and "- " lists; nothing else of Markdown is needed. */
function Answer({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let list: string[] = []
  const flush = () => {
    if (!list.length) return
    const items = list
    blocks.push(<ul key={`ul-${blocks.length}`}>{items.map((t, i) => <li key={i}>{inline(t, `li-${blocks.length}-${i}`)}</li>)}</ul>)
    list = []
  }
  for (const raw of tidyTags(text).split('\n')) {
    const line = raw.trim().replace(/^#{1,6}\s+/, '')
    const item = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/)
    if (item) { list.push(item[1]); continue }
    flush()
    if (line) blocks.push(<p key={`p-${blocks.length}`}>{inline(line, `p-${blocks.length}`)}</p>)
  }
  flush()
  return <>{blocks}</>
}

function Sources({ text }: { text: string }) {
  const { ids, live } = citedSources(tidyTags(text))
  if (!ids.length) {
    return (
      <div className="chat-sources chat-nosource">
        <CircleAlert size={14} aria-hidden="true" /> No Knowledgebase source was cited. Check the
        <button className="chat-link" onClick={() => openKnowledgebase()}>Knowledgebase</button> before relying on this.
      </div>
    )
  }
  return (
    <div className="chat-sources">
      <span>Sources</span>
      {ids.map((id) => <SourceButton key={id} id={id} />)}
      {live && <LiveTag />}
    </div>
  )
}

/** Starter questions that fit what is on screen now. */
function useSuggestions(): string[] {
  const level = useApp((s) => s.level)
  const hasAreas = useApp((s) => Object.keys(siteAreas(s, currentSite(s).id)).length > 0)
  const out: string[] = []
  if (level !== 'healthy') {
    out.push(`Why is the forest in ${level === 'danger' ? 'Danger' : 'Warning'} and what should we do?`)
  } else {
    out.push('How is the forest doing right now?')
  }
  out.push(hasAreas ? 'Which species should we plant in Replant Area 1, and why?' : 'Which mangrove species suits the current salinity?')
  out.push('Should we plant mangroves or let them regrow naturally?')
  out.push('How tall will Rhizophora apiculata grow in 10 years?')
  return out
}

/** The top-bar launcher. It lives in the bar so it never covers a map, card or control on any page. */
export function ChatButton() {
  const open = useChat((s) => s.open)
  return (
    <button
      className="chat-fab"
      onClick={() => useChat.setState({ open: !open })}
      aria-expanded={open}
      aria-controls="chat-panel"
      title="Ask RhizoLah! (AI answers from the Knowledgebase)"
      data-testid="chat-button"
    >
      <Sparkles size={18} aria-hidden="true" /> <span className="chat-fab-word">RhizoAI</span>
    </button>
  )
}

/** The floating chat window. Not modal: the page under it keeps working. */
export function ChatPanel() {
  const { open, messages, busy } = useChat()
  const suggestions = useSuggestions()
  const [draft, setDraft] = useState('')
  const log = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const last = messages[messages.length - 1]

  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  // Follow the answer as it streams in.
  useEffect(() => {
    const el = log.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, last?.content])

  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return
      useChat.setState({ open: false })
      document.querySelector<HTMLButtonElement>('[data-testid="chat-button"]')?.focus()
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [open])

  if (!open) return null

  const submit = (q: string) => {
    if (!q.trim() || busy) return
    send(q)
    setDraft('')
  }

  return (
    <section id="chat-panel" className="chat" role="dialog" aria-modal="false" aria-label="Ask RhizoLah!" data-testid="chat-panel">
      <header className="chat-head">
        <div className="chat-title">
          <span className="chat-badge" aria-hidden="true"><Sparkles size={17} /></span>
          <div>
            <h2>Ask RhizoLah!</h2>
            <p>Answers from the <button className="chat-link" onClick={() => openKnowledgebase()}>Knowledgebase</button> and the live readings</p>
          </div>
        </div>
        <div className="chat-tools">
          {messages.length > 0 && (
            <button className="icon-btn" onClick={clearChat} aria-label="New chat" title="New chat"><RotateCcw size={18} /></button>
          )}
          <button className="icon-btn" onClick={() => useChat.setState({ open: false })} aria-label="Close chat" title="Close (Esc)"><X size={20} /></button>
        </div>
      </header>

      <div className="chat-log" ref={log} aria-live="polite" aria-busy={busy}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>Ask anything about this forest: the readings, what to plant, why something is in Danger, or what the sources say. Every answer links to its source.</p>
            <div className="chat-chips">
              {suggestions.map((q) => (
                <button key={q} className="chat-chip" onClick={() => submit(q)}>{q}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          m.role === 'user' ? (
            <div key={m.id} className="chat-msg chat-user"><p>{m.content}</p></div>
          ) : m.error ? (
            <div key={m.id} className="chat-msg chat-bot chat-error" role="alert">
              <p><CircleAlert size={16} aria-hidden="true" /> {m.content}</p>
            </div>
          ) : (
            <div key={m.id} className="chat-msg chat-bot">
              {m.content ? <Answer text={m.content} /> : <p className="chat-typing" aria-label="Thinking"><span /><span /><span /></p>}
              {m.content && !(busy && m === last) && <Sources text={m.content} />}
            </div>
          )
        ))}
      </div>

      <form className="chat-form" onSubmit={(e) => { e.preventDefault(); submit(draft) }}>
        <textarea
          ref={input}
          className="chat-input"
          rows={1}
          value={draft}
          maxLength={1000}
          placeholder="Ask about the forest…"
          aria-label="Your question"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(draft) }
          }}
        />
        {busy ? (
          <button type="button" className="chat-send" onClick={stop} aria-label="Stop answering" title="Stop"><Square size={14} fill="currentColor" /></button>
        ) : (
          <button type="submit" className="chat-send" disabled={!draft.trim()} aria-label="Send" title="Send (Enter)"><ArrowUp size={18} /></button>
        )}
      </form>
    </section>
  )
}
