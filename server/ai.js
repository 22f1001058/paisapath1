// The AI brain: talks to whichever inference provider is configured — an agent
// CLI running as a subprocess (claude | codex | gemini …), or any HTTP
// inference API (OpenAI-compatible, Anthropic Messages, Google Gemini),
// including self-hosted and local ones. providers.js owns the catalogue and the
// per-vendor wire formats; this file owns process/socket plumbing, queueing,
// JSON repair, fallbacks and the audit log.
//
// Three hard rules this file enforces, because the whole trust story depends on them:
//   1. The model never produces a rupee figure. finance.js does the maths; the
//      model receives the already-computed numbers and writes prose about them.
//   2. Every invocation is written to ai_log before it returns, success or not,
//      so the Trust Centre can show a complete history with nothing hidden.
//   3. An API key is read from the environment, used to sign one request, and
//      never logged, never cached and never sent to the browser.

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { run } from './db.js'
import { PROVIDERS, DEFAULT_PROVIDER, publicView, buildRequest, readDelta, readError, readText } from './providers.js'

export { PROVIDERS, DEFAULT_PROVIDER, publicView }

const PATH_EXTRA = [
  `${process.env.HOME}/.local/bin`,
  '/opt/homebrew/bin',
  '/usr/local/bin',
].join(':')

const env = { ...process.env, PATH: `${PATH_EXTRA}:${process.env.PATH}`, NO_COLOR: '1' }
const workdir = tmpdir()

/** The provider record for a name, falling back to the default rather than throwing. */
export const providerOf = (name) => PROVIDERS[name] || PROVIDERS[DEFAULT_PROVIDER]

/* -------------------------------------------------------------- concurrency */

// A CLI invocation is a whole agent runtime; more than a couple in parallel just
// thrashes. HTTP calls are only sockets, so they get a wider lane.
function limiter(max) {
  let inFlight = 0
  const queue = []
  return {
    acquire: () =>
      inFlight < max
        ? ((inFlight += 1), Promise.resolve())
        : new Promise((res) => queue.push(res)).then(() => { inFlight += 1 }),
    release: () => { inFlight -= 1; queue.shift()?.() },
  }
}

const lanes = {
  cli: limiter(Number(process.env.AI_CLI_CONCURRENCY) || 2),
  http: limiter(Number(process.env.AI_HTTP_CONCURRENCY) || 6),
}
const laneFor = (p) => (p.api === 'cli' ? lanes.cli : lanes.http)

/* -------------------------------------------------------------- cli transport */

function callCli(p, { system, user }, { timeoutMs, onChunk }) {
  const prompt = `${system}\n\n${user}`
  const outFile = p.usesOutFile ? join(workdir, `pp-${randomUUID()}.txt`) : null

  return new Promise((resolve, reject) => {
    const child = spawn(p.bin, p.argv(outFile), { env, cwd: workdir, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = '', err = '', settled = false

    const timer = setTimeout(() => {
      settled = true
      child.kill('SIGKILL')
      reject(new Error(`${p.bin} timed out after ${Math.round(timeoutMs / 1000)}s`))
    }, timeoutMs)

    const finish = (fn, v) => { if (!settled) { settled = true; clearTimeout(timer); fn(v) } }

    child.stdout.on('data', (b) => {
      const s = b.toString()
      out += s
      if (onChunk && p.streams) onChunk(s)
    })
    child.stderr.on('data', (b) => { err += b.toString() })
    child.on('error', (e) => finish(reject, new Error(`could not start ${p.bin}: ${e.message}`)))

    child.on('close', async (code) => {
      let text = out
      if (outFile) {
        text = await readFile(outFile, 'utf8').catch(() => '')
        unlink(outFile).catch(() => {})
      }
      // Agent CLIs love to exit 0 while printing an auth/model error. Treat an
      // empty answer as a failure regardless of the exit code.
      const combined = `${out}\n${err}`
      const apiError = combined.match(/"message":"([^"]{10,300})"/)?.[1]
      if (!text.trim() || apiError) {
        return finish(reject, new Error(apiError || err.trim().slice(0, 300) || `${p.bin} exited ${code} with no output`))
      }
      finish(resolve, text.trim())
    })

    child.stdin.end(prompt)
  })
}

/* -------------------------------------------------------------- http transport */

/** Feed each `data:` payload of an SSE response to onEvent, already parsed. */
async function readSse(res, onEvent) {
  const decoder = new TextDecoder()
  let buf = ''
  for await (const chunk of res.body) {
    buf = `${buf}${decoder.decode(chunk, { stream: true })}`.replace(/\r\n/g, '\n')
    let cut
    while ((cut = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, cut)
      buf = buf.slice(cut + 2)
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data || data === '[DONE]') continue
        try { onEvent(JSON.parse(data)) } catch { /* keep-alive or partial frame */ }
      }
    }
  }
}

async function callHttp(p, parts, { timeoutMs, onChunk, maxTokens }) {
  const stream = !!onChunk
  const { url, init } = buildRequest(p, { ...parts, stream, maxTokens })
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)

  try {
    const res = await fetch(url, { ...init, signal: ac.signal })
    if (!res.ok) throw new Error(readError(p, res.status, await res.text().catch(() => '')))

    let text
    if (stream) {
      let acc = ''
      await readSse(res, (obj) => {
        const delta = readDelta(p, obj)
        if (delta) { acc += delta; onChunk(delta) }
      })
      text = acc
    } else {
      text = readText(p, await res.json())
    }

    if (!text.trim()) throw new Error(`${p.label} returned an empty answer`)
    return text.trim()
  } catch (e) {
    if (e.name === 'AbortError' || e.name === 'TimeoutError') {
      throw new Error(`${p.label} timed out after ${Math.round(timeoutMs / 1000)}s`)
    }
    // fetch collapses every network failure into "fetch failed"; the cause has the detail.
    if (e.cause?.code) throw new Error(`could not reach ${p.baseUrl} (${e.cause.code})`)
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/** Route one prompt to the configured transport, queued behind its own lane. */
async function call(p, parts, { timeoutMs, onChunk, maxTokens } = {}) {
  if (!p) throw new Error('no inference provider configured')
  if (!p.configured) throw new Error(`${p.label} is not configured — ${p.missing}`)

  const lane = laneFor(p)
  await lane.acquire()
  try {
    return p.api === 'cli'
      ? await callCli(p, parts, { timeoutMs, onChunk: p.streams ? onChunk : null })
      : await callHttp(p, parts, { timeoutMs, onChunk, maxTokens })
  } finally {
    lane.release()
  }
}

/* -------------------------------------------------------------- public API */

const SYSTEM_FLOOR = `You are the mentor voice inside PaisaPath, a personal finance app for young adults in India who are early in their earning life.

Absolute rules:
- Never invent, recalculate or adjust a number. Every figure you need is supplied to you already computed. Quote those and nothing else.
- Amounts are Indian rupees. Write them as ₹1,23,456 (Indian digit grouping).
- You are not a SEBI-registered adviser. Explain and teach; never name a specific stock, fund house or scheme to buy.
- Plain English, second person, calm and concrete. No hype, no emoji, no exclamation marks.
- Assume the reader has never been taught any of this and is slightly anxious about money. Do not condescend.
- Prefer the short true sentence over the long reassuring one. Name the risk when there is one.`

const userPrompt = (instruction, context, json) => [
  instruction,
  '',
  json ? 'Respond with JSON only. No prose before or after, no markdown fence.' : '',
  '',
  '--- DATA (already computed, treat as fact) ---',
  typeof context === 'string' ? context : JSON.stringify(context, null, 1),
].join('\n')

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fenced ? fenced[1] : text).trim()
  const start = body.search(/[[{]/)
  if (start < 0) throw new Error('no JSON found in model output')
  const open = body[start], close = open === '{' ? '}' : ']'
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < body.length; i++) {
    const ch = body[i]
    if (esc) { esc = false; continue }
    if (ch === '\\') { esc = true; continue }
    if (ch === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (ch === open) depth++
    else if (ch === close && --depth === 0) return JSON.parse(body.slice(start, i + 1))
  }
  throw new Error('unbalanced JSON in model output')
}

function record({ provider, model, task, ms, ok, fallback, shared, error }) {
  run(
    'INSERT INTO ai_log (ts, provider, model, task, ms, ok, fallback, shared, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    new Date().toISOString(), provider, model || null, task, ms, ok ? 1 : 0, fallback ? 1 : 0, shared, error || null,
  )
}

/**
 * Run one AI task.
 * @param shared human-readable description of exactly what data left the device — shown verbatim in the Trust Centre.
 * @param fallback () => value used when the provider is unavailable or misbehaves. The UI is told which one it got.
 */
export async function ask({ task, instruction, context, json = false, provider = DEFAULT_PROVIDER, shared, fallback, timeoutMs }) {
  const p = providerOf(provider)
  const parts = { system: SYSTEM_FLOOR, user: userPrompt(instruction, context, json) }
  const t0 = Date.now()

  try {
    const raw = await call(p, parts, { timeoutMs: timeoutMs ?? (json ? 150_000 : 180_000) })
    const value = json ? extractJson(raw) : raw
    record({ provider: p.name, model: p.model, task, ms: Date.now() - t0, ok: true, fallback: false, shared })
    return { value, source: p.label, fallback: false }
  } catch (e) {
    record({ provider: p.name, model: p.model, task, ms: Date.now() - t0, ok: false, fallback: !!fallback, shared, error: e.message })
    if (!fallback) throw e
    return { value: await fallback(), source: 'built-in rules', fallback: true, error: e.message }
  }
}

/** Streaming variant for the mentor chat. Calls onChunk as text arrives. */
export async function askStream({ task, instruction, context, provider = DEFAULT_PROVIDER, shared, onChunk }) {
  const p = providerOf(provider)
  const parts = { system: SYSTEM_FLOOR, user: userPrompt(instruction, context, false) }
  const t0 = Date.now()

  try {
    const raw = await call(p, parts, { timeoutMs: 180_000, onChunk })
    record({ provider: p.name, model: p.model, task, ms: Date.now() - t0, ok: true, fallback: false, shared })
    return { text: raw, streamed: !!p.streams }
  } catch (e) {
    record({ provider: p.name, model: p.model, task, ms: Date.now() - t0, ok: false, fallback: false, shared, error: e.message })
    throw e
  }
}

/* -------------------------------------------------------------- availability probe */

const probeCache = new Map()  // provider -> { at, status }
const PROBE_TTL = 10 * 60_000

export async function probe(name, { force = false } = {}) {
  const p = PROVIDERS[name]
  if (!p) return { ok: false, ms: 0, detail: `unknown provider: ${name}` }
  if (!p.configured) return { ok: false, ms: 0, detail: p.missing }

  const hit = probeCache.get(name)
  if (!force && hit && Date.now() - hit.at < PROBE_TTL) return hit.status

  const t0 = Date.now()
  let status
  try {
    const out = await call(
      p,
      { system: 'Answer with the single word asked for and nothing else.', user: 'Reply with exactly the five characters: READY' },
      { timeoutMs: p.api === 'cli' ? 60_000 : 30_000, maxTokens: 16 },
    )
    status = out.toUpperCase().includes('READY')
      ? { ok: true, ms: Date.now() - t0, detail: p.api === 'cli' ? 'Responding normally' : `Responding normally as ${p.model}` }
      : { ok: false, ms: Date.now() - t0, detail: `Unexpected reply: ${out.slice(0, 120)}` }
  } catch (e) {
    status = { ok: false, ms: Date.now() - t0, detail: e.message.slice(0, 200) }
  }
  probeCache.set(name, { at: Date.now(), status })
  return status
}

/** Every provider, its configuration and its live status — never any key material. */
export async function probeAll(opts) {
  const names = Object.keys(PROVIDERS)
  const results = await Promise.all(names.map((n) => probe(n, opts)))
  return names.map((name, i) => ({ ...publicView(PROVIDERS[name]), ...results[i] }))
}
