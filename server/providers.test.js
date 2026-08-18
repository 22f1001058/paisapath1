// Self-check for the provider catalogue and the three wire formats.
// Run: node server/providers.test.js
// No framework on purpose — asserts over pure functions, no network, no keys.
import assert from 'node:assert/strict'
import { buildCatalog, buildRequest, defaultProvider, publicView, readDelta, readError, readText } from './providers.js'

const body = (init) => JSON.parse(init.body)
const parts = { system: 'SYS', user: 'USER' }

/* --- configuration ------------------------------------------------------- */
const bare = buildCatalog({})
assert.equal(bare.claude.api, 'cli', 'agent CLIs need no configuration')
assert.equal(bare.claude.configured, true)
assert.equal(bare.openai.configured, false, 'a hosted provider without a key is not usable')
assert.match(bare.openai.missing, /OPENAI_API_KEY/, 'the hint must name the exact env var')
assert.equal(bare.ollama.configured, true, 'a localhost server needs no key')
assert.equal(bare.ollama.transport, 'local-server')

const keyed = buildCatalog({ OPENAI_API_KEY: 'sk-test', OPENAI_MODEL: 'gpt-4.1-mini' })
assert.equal(keyed.openai.configured, true)
assert.equal(keyed.openai.model, 'gpt-4.1-mini', 'the model is overridable')
assert.equal(keyed.openai.transport, 'cloud-api')

// GEMINI_API_KEY is accepted as an alias for GOOGLE_API_KEY.
assert.equal(buildCatalog({ GEMINI_API_KEY: 'g' }).google.configured, true)

/* --- keys never leave the process ---------------------------------------- */
const view = publicView(keyed.openai)
assert.equal(view.hasKey, true)
assert.equal('apiKey' in view, false, 'publicView must never carry key material')
assert.equal(JSON.stringify(view).includes('sk-test'), false)

/* --- a provider this repo has never heard of ----------------------------- */
const custom = buildCatalog({
  AI_PROVIDERS: 'vllm',
  VLLM_BASE_URL: 'http://10.0.0.4:8000/v1/',
  VLLM_MODEL: 'Qwen/Qwen2.5-32B-Instruct',
  VLLM_LABEL: 'Lab GPU box',
})
assert.equal(custom.vllm.configured, true)
assert.equal(custom.vllm.api, 'openai', 'unknown providers default to the OpenAI dialect')
assert.equal(custom.vllm.label, 'Lab GPU box')
assert.equal(custom.vllm.keyRequired, false, 'a self-declared endpoint may legitimately have no auth')
assert.equal(buildCatalog({ AI_PROVIDERS: 'box', BOX_BASE_URL: 'http://localhost:9000/v1', BOX_MODEL: 'm' }).box.configured, true)
assert.equal(buildCatalog({ AI_PROVIDERS: 'x', X_BASE_URL: 'http://h/v1', X_MODEL: 'm', X_API: 'nope' }).x.configured, false)

/* --- default provider ---------------------------------------------------- */
assert.equal(defaultProvider(bare, {}), 'claude', 'with nothing configured, fall back to the CLI')
assert.equal(defaultProvider(keyed, {}), 'openai', 'a configured API wins over an unproven CLI')
assert.equal(defaultProvider(keyed, { AI_PROVIDER: 'gemini' }), 'gemini', 'AI_PROVIDER is explicit')
assert.equal(defaultProvider(keyed, { AI_PROVIDER: 'nonsense' }), 'openai', 'a bad name must not brick the app')
assert.equal(defaultProvider(bare, {}), 'claude', 'a keyless local preset is never assumed to be running')
assert.equal(defaultProvider(custom, {}), 'vllm', 'a provider you declared yourself is a deliberate choice')

/* --- openai dialect ------------------------------------------------------ */
const oa = buildRequest(keyed.openai, { ...parts, stream: true })
assert.equal(oa.url, 'https://api.openai.com/v1/chat/completions')
assert.equal(oa.init.headers.authorization, 'Bearer sk-test')
assert.deepEqual(body(oa.init).messages, [{ role: 'system', content: 'SYS' }, { role: 'user', content: 'USER' }])
assert.equal(body(oa.init).stream, true)
assert.equal('stream' in body(buildRequest(keyed.openai, parts).init), false)
assert.equal(readText(keyed.openai, { choices: [{ message: { content: 'hi' } }] }), 'hi')
assert.equal(readDelta(keyed.openai, { choices: [{ delta: { content: 'ab' } }] }), 'ab')
assert.equal(readDelta(keyed.openai, { choices: [{ delta: {} }] }), '')

/* --- anthropic dialect --------------------------------------------------- */
const an = buildRequest(buildCatalog({ ANTHROPIC_API_KEY: 'sk-ant' }).anthropic, { ...parts, maxTokens: 16 })
assert.equal(an.url, 'https://api.anthropic.com/v1/messages')
assert.equal(an.init.headers['x-api-key'], 'sk-ant')
assert.equal(an.init.headers['anthropic-version'], '2023-06-01')
assert.equal(body(an.init).system, 'SYS', 'the system floor is a first-class field, not glued to the prompt')
assert.equal(body(an.init).max_tokens, 16)
const anthropic = buildCatalog({ ANTHROPIC_API_KEY: 'k' }).anthropic
assert.equal(readText(anthropic, { content: [{ type: 'text', text: 'a' }, { type: 'thinking' }, { type: 'text', text: 'b' }] }), 'ab')
assert.equal(readDelta(anthropic, { type: 'content_block_delta', delta: { text: 'x' } }), 'x')
assert.equal(readDelta(anthropic, { type: 'message_start' }), '')

/* --- google dialect ------------------------------------------------------ */
const google = buildCatalog({ GOOGLE_API_KEY: 'g-key' }).google
const g = buildRequest(google, parts)
assert.equal(g.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent')
assert.equal(g.init.headers['x-goog-api-key'], 'g-key')
assert.equal(body(g.init).systemInstruction.parts[0].text, 'SYS')
assert.match(buildRequest(google, { ...parts, stream: true }).url, /:streamGenerateContent\?alt=sse$/)
assert.equal(readText(google, { candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] }), 'ab')
assert.equal(readDelta(google, { candidates: [{ content: { parts: [{ text: 'c' }] } }] }), 'c')

/* --- errors say what to do ----------------------------------------------- */
assert.match(readError(keyed.openai, 401, '{"error":{"message":"bad key"}}'), /bad key.*OPENAI_API_KEY/)
assert.match(readError(keyed.openai, 404, 'not found'), /OPENAI_MODEL/)
assert.match(readError(keyed.openai, 500, '<html>boom</html>'), /HTTP 500/)

console.log('providers.js — all checks pass')
