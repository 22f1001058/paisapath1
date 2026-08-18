// Which inference providers exist, how each one is configured, and how each one
// wants its request shaped. Everything here is data and pure functions — the
// spawning, fetching, queueing and logging lives in ai.js.
//
// Two families:
//   cli   — an agent CLI already installed on this machine, driven as a
//           subprocess. No API key, nothing leaves the machine except the
//           prompt the CLI itself sends onward.
//   http  — any inference API. Three wire formats cover essentially all of
//           them: `openai` (OpenAI and every OpenAI-compatible server —
//           OpenRouter, Groq, DeepSeek, Mistral, Together, xAI, vLLM, Ollama,
//           LM Studio, llama.cpp), `anthropic` (Messages API) and `google`
//           (Gemini generateContent).
//
// Keys are read from the environment (see .env.example) and never leave this
// process: publicView() is the only thing the API layer is allowed to serialise.

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const envFile = join(root, '.env')
// Real environment variables win over the file — same precedence as `node --env-file`.
if (existsSync(envFile)) process.loadEnvFile(envFile)

/* ------------------------------------------------------------------ presets */

const CLI = (name, label, vendor, bin, argv, extra = {}) =>
  ({ name, label, vendor, api: 'cli', bin, argv, streams: false, ...extra })

const HTTP = (name, label, vendor, api, baseUrl, model, keyEnv, extra = {}) =>
  ({ name, label, vendor, api, baseUrl, model, keyEnv, keyRequired: true, streams: true, ...extra })

export const PRESETS = [
  CLI('claude', 'Claude Code', 'Anthropic', 'claude', () => ['-p'], { streams: true }),
  // --ephemeral keeps session files off disk; read-only sandbox means the agent
  // physically cannot touch the user's filesystem while answering.
  CLI('codex', 'Codex', 'OpenAI', 'codex',
    (outFile) => ['exec', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '-o', outFile, '-'],
    { usesOutFile: true }),
  CLI('gemini', 'Gemini CLI', 'Google', 'gemini', () => ['--approval-mode', 'plan', '-o', 'text']),

  HTTP('openai', 'OpenAI API', 'OpenAI', 'openai', 'https://api.openai.com/v1', 'gpt-4o-mini', ['OPENAI_API_KEY']),
  HTTP('anthropic', 'Anthropic API', 'Anthropic', 'anthropic', 'https://api.anthropic.com/v1', 'claude-3-5-sonnet-latest', ['ANTHROPIC_API_KEY']),
  HTTP('google', 'Gemini API', 'Google', 'google', 'https://generativelanguage.googleapis.com/v1beta', 'gemini-2.0-flash', ['GOOGLE_API_KEY', 'GEMINI_API_KEY']),
  HTTP('openrouter', 'OpenRouter', 'OpenRouter', 'openai', 'https://openrouter.ai/api/v1', 'openai/gpt-4o-mini', ['OPENROUTER_API_KEY']),
  HTTP('groq', 'Groq', 'Groq', 'openai', 'https://api.groq.com/openai/v1', 'llama-3.3-70b-versatile', ['GROQ_API_KEY']),
  HTTP('deepseek', 'DeepSeek', 'DeepSeek', 'openai', 'https://api.deepseek.com/v1', 'deepseek-chat', ['DEEPSEEK_API_KEY']),
  HTTP('mistral', 'Mistral', 'Mistral AI', 'openai', 'https://api.mistral.ai/v1', 'mistral-small-latest', ['MISTRAL_API_KEY']),
  HTTP('together', 'Together AI', 'Together', 'openai', 'https://api.together.xyz/v1', 'meta-llama/Llama-3.3-70B-Instruct-Turbo', ['TOGETHER_API_KEY']),
  HTTP('xai', 'xAI', 'xAI', 'openai', 'https://api.x.ai/v1', 'grok-2-latest', ['XAI_API_KEY']),
  // Local model servers: same wire format, no key, nothing leaves the machine.
  HTTP('ollama', 'Ollama', 'local', 'openai', 'http://localhost:11434/v1', 'llama3.1', ['OLLAMA_API_KEY'], { keyRequired: false }),
]

const WIRE = new Set(['cli', 'openai', 'anthropic', 'google'])

/* ------------------------------------------------------------------ resolution */

const prefixOf = (name) => name.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
const listEnv = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean)
const isLocal = (url) => /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(url || '')

function resolve(preset, env) {
  const prefix = prefixOf(preset.name)
  const api = env[`${prefix}_API`] || preset.api
  if (!WIRE.has(api)) return { ...preset, prefix, api, configured: false, missing: `${prefix}_API must be one of: openai, anthropic, google` }

  if (api === 'cli') {
    const bin = env[`${prefix}_BIN`] || preset.bin
    return { ...preset, prefix, api, bin, endpoint: bin, transport: 'local-cli', configured: true, missing: null }
  }

  const canonicalKey = preset.keyEnv?.[0] || `${prefix}_API_KEY`
  const keyNames = [...new Set([`${prefix}_API_KEY`, ...(preset.keyEnv || [])])]
  const apiKey = keyNames.map((k) => env[k]).find((v) => v && v.trim()) || null
  const baseUrl = (env[`${prefix}_BASE_URL`] || preset.baseUrl || '').replace(/\/+$/, '')
  const model = env[`${prefix}_MODEL`] || preset.model || null
  const keyRequired = preset.keyRequired !== false && !isLocal(baseUrl)
  const maxTokens = Number(env[`${prefix}_MAX_TOKENS`] || env.AI_MAX_TOKENS) || 2000
  const temperature = env[`${prefix}_TEMPERATURE`] !== undefined ? Number(env[`${prefix}_TEMPERATURE`]) : null

  const missing =
    !baseUrl ? `Set ${prefix}_BASE_URL in .env`
      : !model ? `Set ${prefix}_MODEL in .env`
        : keyRequired && !apiKey ? `Set ${canonicalKey} in .env`
          : null

  return {
    ...preset, prefix, api, apiKey, baseUrl, model, keyRequired, maxTokens, temperature,
    keyEnv: canonicalKey,
    endpoint: baseUrl,
    transport: isLocal(baseUrl) ? 'local-server' : 'cloud-api',
    streams: true,
    configured: !missing,
    missing,
  }
}

/**
 * Build the provider table from an environment. Presets first, then anything
 * named in AI_PROVIDERS — that is the escape hatch for a provider this file has
 * never heard of:
 *
 *   AI_PROVIDERS=vllm
 *   VLLM_BASE_URL=http://10.0.0.4:8000/v1
 *   VLLM_MODEL=Qwen/Qwen2.5-32B-Instruct
 *   VLLM_API_KEY=...          # optional
 *   VLLM_API=openai           # optional: openai (default) | anthropic | google
 *   VLLM_LABEL=Our GPU box    # optional
 */
export function buildCatalog(env = process.env) {
  const out = {}
  for (const preset of PRESETS) out[preset.name] = resolve(preset, env)

  for (const raw of listEnv(env.AI_PROVIDERS)) {
    const name = raw.toLowerCase()
    if (out[name]) continue   // a preset already owns that name
    // A self-declared endpoint may be an unauthenticated box on your own LAN,
    // so a key is optional here; a 401 from the server says so plainly enough.
    out[name] = resolve({ name, label: name, vendor: 'Self-configured', api: 'openai', keyRequired: false, custom: true }, env)
  }

  for (const p of Object.values(out)) p.label = env[`${p.prefix}_LABEL`] || p.label
  return out
}

export const PROVIDERS = buildCatalog(process.env)

/**
 * Active provider when the user has never picked one: AI_PROVIDER wins, then a
 * provider you actually put a key in, then one you declared yourself. A stock
 * keyless local preset (ollama) is never assumed — it looks configured whether
 * or not anything is listening, so choosing it has to be deliberate.
 */
export function defaultProvider(catalog = PROVIDERS, env = process.env) {
  const wanted = env.AI_PROVIDER?.trim().toLowerCase()
  if (wanted && catalog[wanted]) return wanted
  const usable = Object.values(catalog).filter((p) => p.api !== 'cli' && p.configured)
  const ready = usable.find((p) => p.apiKey) || usable.find((p) => p.custom)
  return ready ? ready.name : 'claude'
}

export const DEFAULT_PROVIDER = defaultProvider()

/** The only shape allowed out of the process: no key, ever. */
export const publicView = (p) => ({
  name: p.name,
  label: p.label,
  vendor: p.vendor,
  api: p.api,
  transport: p.transport,
  streams: !!p.streams,
  model: p.model || null,
  endpoint: p.endpoint || null,
  bin: p.api === 'cli' ? p.bin : null,
  keyEnv: p.api === 'cli' ? null : p.keyEnv,
  hasKey: !!p.apiKey,
  custom: !!p.custom,
  configured: !!p.configured,
  missing: p.missing || null,
})

/* ------------------------------------------------------------------ wire formats */

/** One request, in whichever dialect this provider speaks. */
export function buildRequest(p, { system, user, stream = false, maxTokens }) {
  const cap = maxTokens || p.maxTokens || 2000
  const headers = { 'content-type': 'application/json' }

  if (p.api === 'anthropic') {
    if (p.apiKey) { headers['x-api-key'] = p.apiKey; headers['anthropic-version'] = '2023-06-01' }
    return {
      url: `${p.baseUrl}/messages`,
      init: {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: p.model,
          max_tokens: cap,
          system,
          messages: [{ role: 'user', content: user }],
          ...(p.temperature !== null && p.temperature !== undefined ? { temperature: p.temperature } : {}),
          ...(stream ? { stream: true } : {}),
        }),
      },
    }
  }

  if (p.api === 'google') {
    if (p.apiKey) headers['x-goog-api-key'] = p.apiKey
    const method = stream ? 'streamGenerateContent?alt=sse' : 'generateContent'
    return {
      url: `${p.baseUrl}/models/${p.model}:${method}`,
      init: {
        method: 'POST',
        headers,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: {
            maxOutputTokens: cap,
            ...(p.temperature !== null && p.temperature !== undefined ? { temperature: p.temperature } : {}),
          },
        }),
      },
    }
  }

  // openai and every server that speaks its dialect
  if (p.apiKey) headers.authorization = `Bearer ${p.apiKey}`
  return {
    url: `${p.baseUrl}/chat/completions`,
    init: {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: p.model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        ...(p.temperature !== null && p.temperature !== undefined ? { temperature: p.temperature } : {}),
        ...(stream ? { stream: true } : {}),
      }),
    },
  }
}

/** Whole-response payload → text. */
export function readText(p, payload) {
  if (p.api === 'anthropic') {
    return (payload?.content || []).filter((b) => b?.type === 'text').map((b) => b.text).join('')
  }
  if (p.api === 'google') {
    return (payload?.candidates?.[0]?.content?.parts || []).map((part) => part?.text || '').join('')
  }
  const choice = payload?.choices?.[0]
  // Some OpenAI-compatible servers answer /chat/completions with `text`.
  return choice?.message?.content ?? choice?.text ?? ''
}

/** One parsed SSE frame → the text it adds, or '' when it carries no text. */
export function readDelta(p, obj) {
  if (p.api === 'anthropic') {
    return obj?.type === 'content_block_delta' ? (obj.delta?.text || '') : ''
  }
  if (p.api === 'google') {
    return (obj?.candidates?.[0]?.content?.parts || []).map((part) => part?.text || '').join('')
  }
  const choice = obj?.choices?.[0]
  return choice?.delta?.content ?? choice?.text ?? ''
}

/** Turn an HTTP failure into one line a human can act on. */
export function readError(p, status, body) {
  let detail = ''
  try {
    const j = JSON.parse(body)
    detail = j?.error?.message || j?.error?.[0]?.message || j?.message || j?.error || ''
    if (typeof detail !== 'string') detail = JSON.stringify(detail)
  } catch { detail = String(body || '').replace(/\s+/g, ' ').trim() }
  const hint = status === 401 || status === 403
    ? ` — check ${p.keyEnv || 'the API key'} in .env`
    : status === 404 ? ` — check ${p.prefix}_MODEL and ${p.prefix}_BASE_URL` : ''
  return `${p.label} returned HTTP ${status}${detail ? `: ${detail.slice(0, 240)}` : ''}${hint}`
}
