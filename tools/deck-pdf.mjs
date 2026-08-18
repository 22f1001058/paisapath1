// Export a slide deck to a 16:9 PDF, one slide per page.
//   node tools/deck-pdf.mjs [src.html] [out.pdf]
//
// Chrome's `--print-to-pdf` CLI flag ignores the stylesheet's @page size and
// falls back to Letter, which leaves a white band under every slide. The
// DevTools printToPDF call takes an explicit paper size in inches, so drive
// that instead: 13.333in x 7.5in is exactly 1280x720 at 96dpi.

import { spawn } from 'node:child_process'
import { existsSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = process.argv[2] ? resolve(process.argv[2]) : join(root, 'presentation', 'paisapath-progress.html')
const out = process.argv[3] ? resolve(process.argv[3]) : join(root, 'presentation', 'PaisaPath-progress.pdf')
const profile = join(tmpdir(), `pp-deck-${process.pid}`)

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
].find(existsSync)
if (!CHROME) { console.error('No Chrome found in /Applications.'); process.exit(1) }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=9444', '--disable-gpu',
  '--no-first-run', '--no-default-browser-check', '--force-color-profile=srgb',
  `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' })
// Chrome may still be flushing the profile when SIGKILL lands; a leftover tmp dir is harmless.
const cleanup = () => { chrome.kill('SIGKILL'); try { rmSync(profile, { recursive: true, force: true }) } catch { /* leave it */ } }
process.on('exit', cleanup)

let wsUrl
for (let i = 0; i < 60 && !wsUrl; i++) {
  try {
    const r = await fetch('http://127.0.0.1:9444/json/new?about:blank', { method: 'PUT' })
    if (r.ok) wsUrl = (await r.json()).webSocketDebuggerUrl
  } catch { /* not up yet */ }
  if (!wsUrl) await sleep(250)
}
if (!wsUrl) throw new Error('Chrome DevTools endpoint never came up on :9444')

const ws = new WebSocket(wsUrl)
let id = 1
const pending = new Map()
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id); pending.delete(m.id)
    m.error ? rej(new Error(m.error.message)) : res(m.result)
  }
}
const send = (method, params = {}) =>
  new Promise((res, rej) => { const i = id++; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })) })

await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
await send('Page.enable')
await send('Page.navigate', { url: `file://${src}` })
await sleep(2500)
await send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true }).catch(() => {})
await sleep(600)

const pdf = await send('Page.printToPDF', {
  printBackground: true,
  paperWidth: 13.333, paperHeight: 7.5,     // 1280x720 at 96dpi
  marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
  scale: 1,
})
writeFileSync(out, Buffer.from(pdf.data, 'base64'))
console.log(`deck → ${out}`)
process.exit(0)
