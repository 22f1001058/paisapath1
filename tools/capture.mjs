// Full-page screenshots of every PaisaPath screen, plus a PDF contact sheet.
//   node tools/capture.mjs [baseUrl]
//
// Drives the Chrome already on this Mac over the DevTools Protocol — Node 22+
// ships a global WebSocket, so this needs no Puppeteer and no npm install.
// CDP (rather than `chrome --screenshot`) because two of these shots need a
// click first, and captureBeyondViewport gives true full-page height without
// hardcoding a pixel count per route.

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { buildSheet } from './sheet-pdf.mjs'

const args = process.argv.slice(2)
const SET = (args.find((a) => a.startsWith('--set=')) || '--set=full').slice(6)
const BASE = args.find((a) => a.startsWith('http')) || 'http://localhost:5173'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, SET === 'full' ? 'screenshots' : `screenshots-${SET}`)
const profile = join(tmpdir(), `pp-shots-${process.pid}`)

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
].find(existsSync)

/* ------------------------------------------------------------------ the shots */

// click(selector, text) → false when nothing matches, so evaluate() can fail loudly
const click = (sel, text) =>
  `(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})]` +
  `.find(x => x.textContent.includes(${JSON.stringify(text)})); if (!b) return false; b.click(); return true })()`

// "Smaller version" only renders once the AI priorities have actually arrived.
// Without this guard the Today shots silently capture a loading skeleton.
const PRIORITIES_READY = `document.body.textContent.includes('Smaller version')`

const FULL_SHOTS = [
  { file: '01-today', route: 'today', wait: PRIORITIES_READY, timeout: 240_000 },
  {
    file: '02-today-arithmetic', route: 'today',
    prep: click('.why', 'arithmetic'),
    wait: `document.body.textContent.includes('Bills still due') && ${PRIORITIES_READY}`,
    timeout: 240_000,
  },
  {
    file: '03-explain', route: 'today',
    prep: click('.why', 'Why am I seeing'),
    wait: `document.querySelector('.drawer') && document.body.textContent.includes('The honest downside')`,
    settle: 2000, timeout: 240_000,
  },
  { file: '04-money', route: 'money' },
  { file: '05-spending', route: 'spending' },
  { file: '06-budget', route: 'budget' },
  { file: '07-goals', route: 'goals' },
  {
    file: '08-simulate', route: 'simulate',
    prep: click('.chip', '₹45,000 phone'),
    wait: `document.body.textContent.includes('Two years from now') && document.body.textContent.includes('What this actually means')`,
    timeout: 240_000,
  },
  { file: '09-mentor', route: 'mentor' },
  { file: '10-learn', route: 'learn' },
  {
    file: '11-lesson', route: 'learn',
    prep: click('.term', 'SIP'),
    wait: `document.querySelector('.drawer') && document.body.textContent.includes('In India specifically')`,
    settle: 2000, timeout: 240_000,
  },
  { file: '12-trust', route: 'trust' },
  { file: '13-questions', route: 'start', settle: 1200 },
  {
    file: '14-awareness', route: 'start',
    prep: `(() => {
      const set=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};
      const pick=t=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes(t)); if(b)b.click()};
      const cont=()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Continue');
      const step=(fn,ms)=>new Promise(r=>setTimeout(()=>{fn();r()},ms));
      (async()=>{
        let i=document.querySelectorAll('input.input');
        set(i[0],'Rahul'); set(i[1],'2001-04-12'); set(i[2],'Pune');
        await step(()=>pick('First job, under two years in'),300);
        await step(()=>pick('I contribute at home'),250);
        await step(()=>cont().click(),400);
        await step(()=>{ i=document.querySelectorAll('input.input');
          ['48000','12000','4000','25000','3000'].forEach((v,n)=>i[n]&&set(i[n],v)) },700);
        await step(()=>pick('Same amount, same date'),300);
        await step(()=>pick('Once or twice a year'),250);
        await step(()=>cont().click(),400);
        await step(()=>pick('Add more while it is cheaper'),700);
        await step(()=>pick('More than seven years'),250);
        await step(()=>pick('Likely 12%'),250);
        await step(()=>pick('Less than a month'),250);
        await step(()=>cont().click(),400);
      })();
      return true })()`,
    wait: `document.body.textContent.includes('What you already know') && document.body.textContent.includes('minimum amount due')`,
    settle: 1200, timeout: 120_000,
  },
  {
    file: '15-swap', route: 'simulate',
    prep: `(() => { const b=[...document.querySelectorAll('.chip')].find(x=>x.textContent.includes('a month instead of spending it')); if(!b) return false; b.click(); return true })()`,
    wait: `document.body.textContent.includes('If you do neither') && document.body.textContent.includes('What this actually means')`,
    settle: 900, timeout: 240_000,
  },
]

/* Fills the questionnaire up to (but not into) section `upto`, then stops.
   Each shot loads the page fresh, so every step has to be replayed from the top. */
const fillTo = (upto) => `(() => {
  const set=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};
  const pick=t=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes(t)); if(b)b.click()};
  const cont=()=>[...document.querySelectorAll('button')].find(b=>['Continue','See my profile'].includes(b.textContent.trim()));
  const at=(fn,ms)=>new Promise(r=>setTimeout(()=>{fn();r()},ms));
  (async()=>{
    let i=document.querySelectorAll('input.input');
    set(i[0],'Rahul'); set(i[1],'2001-04-12'); set(i[2],'Pune');
    await at(()=>pick('First job, under two years in'),300);
    await at(()=>pick('I contribute at home'),250);
    if(${upto} < 2) return;
    await at(()=>cont().click(),400);
    await at(()=>{ i=document.querySelectorAll('input.input');
      ['48000','12000','4000','25000','3000'].forEach((v,n)=>i[n]&&set(i[n],v)) },700);
    await at(()=>pick('Same amount, same date'),300);
    await at(()=>pick('Once or twice a year'),250);
    if(${upto} < 3) return;
    await at(()=>cont().click(),400);
    await at(()=>pick('Add more while it is cheaper'),700);
    await at(()=>pick('More than seven years'),250);
    await at(()=>pick('Likely 12%'),250);
    await at(()=>pick('Less than a month'),250);
    if(${upto} < 4) return;
    await at(()=>cont().click(),400);
    await at(()=>pick('About \u20b911,664'),800);
    await at(()=>pick('Buys less than it did before'),250);
    await at(()=>pick('It holds a whole market'),250);
    await at(()=>pick('The rest carries interest'),250);
    await at(()=>pick('It pays out only on death'),250);
    await at(()=>pick('A separate savings account or liquid fund'),250);
    if(${upto} < 5) return;
    await at(()=>cont().click(),600);
  })();
  return true })()`

const ONBOARDING = [
  { file: 'q1-about',     route: 'start', settle: 1200 },
  { file: 'q2-money',     route: 'start', prep: fillTo(2), wait: `document.body.textContent.includes('Monthly take-home')`, settle: 1000, timeout: 90_000 },
  { file: 'q3-risk',      route: 'start', prep: fillTo(3), wait: `document.body.textContent.includes('How you handle risk')`, settle: 1000, timeout: 90_000 },
  { file: 'q4-awareness', route: 'start', prep: fillTo(4), wait: `document.body.textContent.includes('What you already know')`, settle: 1000, timeout: 90_000 },
  { file: 'q5-profile',   route: 'start', prep: fillTo(5), wait: `document.body.textContent.includes('Why this profile and not another')`, settle: 2500, timeout: 240_000 },
]

const SHOTS = SET === 'onboarding' ? ONBOARDING : FULL_SHOTS

/* ------------------------------------------------------------------ CDP client */

let nextId = 1
function connect(url) {
  const ws = new WebSocket(url)
  const pending = new Map()
  const ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id)
      m.error ? rej(new Error(`${m.error.message} (${m.error.code})`)) : res(m.result)
    }
  }
  const send = (method, params = {}) =>
    new Promise((res, rej) => { const id = nextId++; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })) })
  return { ws, ready, send }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// CDP calls can wedge silently (an over-sized raster just never answers). Fail loud.
const deadline = (p, ms, what) =>
  Promise.race([p, sleep(ms).then(() => { throw new Error(`${what} did not return within ${ms / 1000}s`) })])

async function waitUntil(send, expr, timeout = 60_000, label = expr) {
  const t0 = Date.now()
  for (;;) {
    const { result } = await send('Runtime.evaluate', { expression: `!!(${expr})`, returnByValue: true })
    if (result.value) return
    if (Date.now() - t0 > timeout) {
      const { result: dump } = await send('Runtime.evaluate', {
        expression: `document.body.textContent.replace(/\\s+/g,' ').slice(0, 400)`, returnByValue: true,
      })
      throw new Error(`timed out waiting for ${label}\n  condition: ${expr}\n  page said: ${dump.value}`)
    }
    await sleep(500)
  }
}

/** Run prep JS and fail loudly if it threw or found nothing to click. */
async function evaluate(send, expression, what) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: false })
  if (r.exceptionDetails) throw new Error(`${what}: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`)
  if (r.result?.value === false) throw new Error(`${what}: target element not found on the page`)
  return r.result?.value
}

/* ------------------------------------------------------------------ run */

if (!CHROME) {
  console.error('No Chrome/Chromium/Edge/Brave found in /Applications.')
  process.exit(1)
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=9333', '--hide-scrollbars',
  '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--force-color-profile=srgb', '--font-render-hinting=none',
  `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' })

const cleanup = () => { chrome.kill('SIGKILL'); rmSync(profile, { recursive: true, force: true }) }
process.on('exit', cleanup)
process.on('SIGINT', () => { cleanup(); process.exit(1) })

// wait for the debugger endpoint
let wsUrl
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })
    if (r.ok) { wsUrl = (await r.json()).webSocketDebuggerUrl; break }
  } catch { /* not up yet */ }
  await sleep(250)
}
if (!wsUrl) throw new Error('Chrome DevTools endpoint never came up on :9333')

const { ready, send } = connect(wsUrl)
await ready
await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] })
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })

const shots = []
for (const s of SHOTS) {
  process.stdout.write(`  ${s.file} … `)
  // The unique query forces a real document load. Navigating by hash alone is a
  // same-document change, so React would keep whatever state the previous shot
  // left open — two shots of the same route would contaminate each other.
  await send('Page.navigate', { url: `${BASE}/?shot=${s.file}#/${s.route}` })
  await waitUntil(send, `document.querySelector('.page-title')`, 30_000, `${s.file} to render`)
  await sleep(1500)   // let the first API round-trip land

  if (s.prep) {
    await evaluate(send, s.prep, `${s.file} prep`)
    if (s.wait) await waitUntil(send, s.wait, s.timeout ?? 60_000, s.file)
    await sleep(s.settle ?? 700)
  }
  // fonts and the last transition
  await deadline(send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true }), 20_000, 'fonts').catch(() => {})
  await sleep(500)

  const { cssContentSize } = await send('Page.getLayoutMetrics')

  // captureScreenshot does not fail on an over-large raster — it simply never
  // returns, exactly like printToPDF. Spending is over 3,500 CSS px tall, which
  // at 2x is a ~7,000 px bitmap and reliably wedges. Drop such pages to 1x for
  // the capture only: a tall page is scaled down in the PDF anyway, so the
  // sharpness is not visible, and every page stays capturable.
  const tall = cssContentSize.height > 2600
  if (tall) await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })

  const { data } = await deadline(send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 },
  }), 120_000, `capture ${s.file}`)

  if (tall) await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })

  const path = join(outDir, `${s.file}.png`)
  writeFileSync(path, Buffer.from(data, 'base64'))
  shots.push({ ...s, png: `${s.file}.png`, w: cssContentSize.width, h: cssContentSize.height })
  console.log(`${Math.round(cssContentSize.width)}×${Math.round(cssContentSize.height)}${tall ? ' (1x)' : ''}`)
}

/* ------------------------------------------------------------------ PDF */

// Chrome's own Page.printToPDF wedges forever on a page holding twelve
// 2880px-wide bitmaps — no error, no return. sheet-pdf.mjs writes the PDF bytes
// directly instead, which takes about two seconds and cannot hang.
const pdfPath = join(outDir, SET === 'full' ? 'PaisaPath-screens.pdf' : `PaisaPath-${SET}.pdf`)
const { pages } = buildSheet(outDir, pdfPath)

console.log(`\n${shots.length} screenshots → ${outDir}`)
console.log(`PDF → ${pdfPath} (${pages} pages)`)
process.exit(0)
