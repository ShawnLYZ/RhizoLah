// Ask RhizoLah!: sends the question, the Knowledgebase and the live situation to SEA-LION through the app's own
// /api/chat relay (vite.config.ts holds the key) and streams the answer back.

import { knowledgeText } from './knowledge'
import { situationText } from './situation'
import type { SourceId } from '../knowledge/sources'

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

/** Earlier turns sent with each question; older ones are dropped to keep the request small. */
const HISTORY_TURNS = 8

function systemPrompt(): string {
  return `You are "Ask RhizoLah!", the assistant inside RhizoLah! (Blue Carbon Sentinel), a mangrove monitoring demo for Kuala Selangor Nature Park, Malaysia. Visitors are park staff, students and judges; write plain, friendly English (or the visitor's language if they write in Malay or another language).

RULES (follow every one):
1. Answer ONLY from the KNOWLEDGEBASE and the LIVE SITUATION below. Do not use outside knowledge, do not invent numbers, species, pages or studies.
2. Every sentence that uses a Knowledgebase fact ends with its source tag, e.g. [K1] or [K3][K4]. Every sentence that uses the live situation ends with [Live]. Use only the tags K1 to K7 and Live.
3. Every answer must contain at least one Knowledgebase tag (K1 to K7). For a question only about live readings, add one short sentence linking them to the Knowledgebase (for example what the source says about that factor) with its tag.
4. If the Knowledgebase does not cover the question, say plainly "The Knowledgebase does not cover that." and then give the closest related point it does cover, with its tag. Never guess.
5. The Mud Check, Soil Type Suggestion, seedling spacing without a source, Planting Cost, CO2 conversion factors and sensor Band limits have no Knowledgebase source: if you use them, tag them [Live]. Do not call them "demo" values.
6. All sensor readings, the camera and the forest model are simulated for this demo; do not present them as real field measurements if asked.
7. Keep answers short: 2 to 6 sentences, or a short list using "- " lines. Use **bold** sparingly. No headings, no tables, no links (the tags become source links).

KNOWLEDGEBASE (Built-in Sources):
${knowledgeText()}

LIVE SITUATION (at the moment of the question):
${situationText()}`
}

/** The source tags an answer cites, in first-use order, and whether it used the live situation. */
export function citedSources(text: string): { ids: SourceId[]; live: boolean } {
  const ids: SourceId[] = []
  let live = false
  for (const m of text.matchAll(/\[(K[1-7]|Live)\]/gi)) {
    const tag = m[1].toUpperCase()
    if (tag === 'LIVE') live = true
    else if (!ids.includes(tag as SourceId)) ids.push(tag as SourceId)
  }
  return { ids, live }
}

/** Streams the answer. `onText` receives the whole answer so far. Throws an Error with a readable message. */
export async function askRhizoLah(history: ChatTurn[], question: string, onText: (text: string) => void, signal: AbortSignal): Promise<string> {
  const messages = [
    { role: 'system', content: systemPrompt() },
    ...history.slice(-HISTORY_TURNS),
    { role: 'user', content: question },
  ]
  let res: Response
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
      signal,
    })
  } catch (e) {
    if (signal.aborted) throw e
    throw new Error('The app could not reach its chat service. Is it running with npm run dev?')
  }
  if (!res.ok || !res.body) {
    let msg = `The chat service answered ${res.status}.`
    try { msg = (await res.json()).error ?? msg } catch { /* not JSON */ }
    if (res.status === 404) msg = 'The chat service is only available when the app runs with npm run dev or npm run preview.'
    throw new Error(msg)
  }

  // OpenAI-style server-sent events: "data: {json}" lines, ending with "data: [DONE]".
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const data = line.trim()
      if (!data.startsWith('data:')) continue
      const payload = data.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const delta = JSON.parse(payload).choices?.[0]?.delta?.content
        if (typeof delta === 'string' && delta) {
          text += delta
          onText(text)
        }
      } catch { /* a partial or keep-alive line */ }
    }
  }
  text = text.trim()
  if (!text) throw new Error('SEA-LION sent an empty answer. Please ask again.')
  return text
}
