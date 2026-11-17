import { defineConfig, loadEnv, type Connect, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

const IMAGE = /\.(jpe?g|png|webp)$/i
const OWN_DIR = path.resolve(__dirname, 'camera-photos')
const SAMPLE_DIR = path.resolve(__dirname, 'public/sample-photos')
const VIRTUAL_ID = 'virtual:camera-photos'
const RESOLVED_ID = '\0' + VIRTUAL_ID

function listImages(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter((f) => IMAGE.test(f)).sort()
  } catch {
    return []
  }
}

function readCredits(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(path.join(SAMPLE_DIR, 'credits.json'), 'utf8'))
  } catch {
    return {}
  }
}

/**
 * Lists the photos the simulated camera can "take".
 * The owner's own ESP32-CAM photos in ./camera-photos win; otherwise the shipped samples are used.
 */
function cameraPhotos(): Plugin {
  return {
    name: 'camera-photos',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null
    },
    load(id) {
      if (id !== RESOLVED_ID) return null
      const own = listImages(OWN_DIR)
      if (own.length > 0) {
        const photos = own.map((f) => ({ src: `/camera-photos/${encodeURIComponent(f)}`, credit: null }))
        return `export default ${JSON.stringify({ source: 'own', photos })}`
      }
      const credits = readCredits()
      const photos = listImages(SAMPLE_DIR).map((f) => ({
        src: `/sample-photos/${encodeURIComponent(f)}`,
        credit: credits[f] ?? null,
      }))
      return `export default ${JSON.stringify({ source: 'sample', photos })}`
    },
    configureServer(server: ViteDevServer) {
      // Serve the owner's folder and reload the page when a photo is added or removed.
      server.middlewares.use('/camera-photos', (req, res, next) => {
        const name = decodeURIComponent((req.url ?? '/').split('?')[0].replace(/^\//, ''))
        const file = path.join(OWN_DIR, name)
        if (!file.startsWith(OWN_DIR) || !IMAGE.test(file) || !fs.existsSync(file)) return next()
        const ext = path.extname(file).toLowerCase()
        res.setHeader('Content-Type', ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg')
        fs.createReadStream(file).pipe(res)
      })
      server.watcher.add(OWN_DIR)
      const refresh = (file: string) => {
        if (!file.startsWith(OWN_DIR) || !IMAGE.test(file)) return
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID)
        if (mod) server.moduleGraph.invalidateModule(mod)
        server.ws.send({ type: 'full-reload' })
      }
      server.watcher.on('add', refresh)
      server.watcher.on('unlink', refresh)
    },
    generateBundle() {
      for (const f of listImages(OWN_DIR)) {
        this.emitFile({ type: 'asset', fileName: `camera-photos/${f}`, source: fs.readFileSync(path.join(OWN_DIR, f)) })
      }
    },
  }
}

const SEALION_URL = 'https://api.sea-lion.ai/v1/chat/completions'
const SEALION_DEFAULT_MODEL = 'aisingapore/Gemma-SEA-LION-v4-27B-IT'
/** Request limits for the chat relay, so a stray page cannot send huge prompts on the owner's key. */
const CHAT_MAX_BODY = 200_000
const CHAT_MAX_TOKENS = 900

/**
 * The Ask RhizoLah! chat relay: POST /api/chat on the dev and preview servers. It adds the SEA-LION key from
 * .env.local (SEALION_API_KEY, never VITE_-prefixed, so it is not built into the page) and streams the reply back.
 * The page sends only `messages`; the model, token limit and temperature are fixed here.
 */
function sealionChat(mode: string): Plugin {
  const env = loadEnv(mode, __dirname, '')
  const key = (env.SEALION_API_KEY ?? '').trim()
  const model = (env.SEALION_MODEL ?? '').trim() || SEALION_DEFAULT_MODEL

  const handler: Connect.NextHandleFunction = (req, res) => {
    const send = (status: number, error: string) => {
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error }))
    }
    if (req.method !== 'POST') return send(405, 'Use POST.')
    if (!key) return send(503, 'No SEA-LION key. Add SEALION_API_KEY to .env.local and restart the app.')
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size <= CHAT_MAX_BODY) chunks.push(c)
    })
    req.on('end', async () => {
      if (size > CHAT_MAX_BODY) return send(413, 'The question and its context are too long.')
      let messages: unknown
      try {
        messages = JSON.parse(Buffer.concat(chunks).toString('utf8')).messages
      } catch {
        return send(400, 'Bad request.')
      }
      const ok = Array.isArray(messages) && messages.length > 0 && messages.every((m) =>
        m && typeof m === 'object' && ['system', 'user', 'assistant'].includes((m as { role?: unknown }).role as string)
        && typeof (m as { content?: unknown }).content === 'string')
      if (!ok) return send(400, 'Bad request.')
      const abort = new AbortController()
      res.on('close', () => abort.abort())
      try {
        const up = await fetch(SEALION_URL, {
          method: 'POST',
          signal: abort.signal,
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages, stream: true, max_tokens: CHAT_MAX_TOKENS, temperature: 0.2 }),
        })
        if (!up.ok || !up.body) {
          const detail = up.status === 401 ? 'The SEA-LION key was refused.' : up.status === 429 ? 'SEA-LION is busy (rate limit). Try again in a minute.' : `SEA-LION answered ${up.status}.`
          return send(502, detail)
        }
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        const reader = up.body.getReader()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          res.write(value)
        }
        res.end()
      } catch {
        if (abort.signal.aborted) return
        if (!res.headersSent) send(502, 'Could not reach SEA-LION. Check the internet connection.')
        else res.end()
      }
    })
  }

  return {
    name: 'sealion-chat',
    configureServer(server) { server.middlewares.use('/api/chat', handler) },
    configurePreviewServer(server) { server.middlewares.use('/api/chat', handler) },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), cameraPhotos(), sealionChat(mode)],
  server: { port: 5173, strictPort: true },
  build: { chunkSizeWarningLimit: 3000, target: 'es2022' },
  worker: { format: 'es' },
}))
