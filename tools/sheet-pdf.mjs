// Build the walkthrough PDF from the captured PNGs.
//   node tools/sheet-pdf.mjs [screenshotsDir]
//
// Writes the PDF bytes directly rather than going through Chrome's printToPDF,
// which wedges indefinitely (no error, no return) on a page holding twelve
// 2880px-wide bitmaps. A one-image-per-page PDF is a few hundred lines of
// well-specified syntax, so this is both faster and something that cannot hang.

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const A4 = { w: 595.28, h: 841.89 }
const MARGIN = 38
const CAPTION_BAND = 58

export const TITLES = {
  '01-today': 'Today — Safe-to-Spend, the next three moves, financial health',
  '02-today-arithmetic': 'Today — "Show me the arithmetic": the Safe-to-Spend ledger, line by line',
  '03-explain': 'Why am I seeing this? — reasoning, benefit, honest risk, alternatives',
  '04-money': 'Money — every account, commitment and goal on one page',
  '05-spending': 'Spending — auto-categorisation, month-on-month movers, the AI monthly review',
  '06-budget': 'Budget — generated from three months of your own averages, every line editable',
  '07-goals': 'Goals — emergency fund first, and a warning when goals stop fitting the income',
  '08-simulate': 'What if... — a 24-month projection with its assumptions stated on the chart',
  '09-mentor': 'Mentor — answers written from your computed figures, streamed from the active provider',
  '10-learn': 'Learn — grouped by the moment each idea becomes relevant, not alphabetically',
  '11-lesson': 'A contextual lesson — the drawer any dashed underline in the app opens',
  '12-trust': 'Trust centre — every AI call ever made, what was sent, and what it cost',
  '13-questions': 'Onboarding questionnaire — 22 questions across four sections',
  '14-awareness': 'The knowledge section — real answers, and "Not sure" costs nothing',
  '15-swap': 'A vs B — "invest ₹5,000 a month instead of spending it", three lines, one gap',

  // the onboarding-only set (node tools/capture.mjs --set=onboarding)
  'q1-about': 'Section 1 of 4: About you. Name, date of birth, city, stage, dependants',
  'q2-money': 'Section 2 of 4: Your money. Income, rent, EMIs, cash, saving rate, bill habit',
  'q3-risk': 'Section 3 of 4: How you handle risk. No right answers here, only useful ones',
  'q4-awareness': 'Section 4 of 4: What you already know. Six scored questions, "Not sure" costs nothing',
  'q5-profile': 'The result: 1 of 6 profiles, three scored axes, and why this profile and not another',
}

/* ---------------------------------------------------------------- PDF primitives */

// PDF text strings are Latin-1. Fold the typography down rather than ship mojibake.
const ascii = (s) => s
  .replace(/[₹]/g, 'Rs.').replace(/[—–]/g, '-').replace(/[…]/g, '...')
  .replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[·•]/g, '-')
  .replace(/[^\x20-\x7E]/g, '')

const esc = (s) => ascii(s).replace(/([\\()])/g, '\\$1')

/** Greedy wrap at an approximate Helvetica advance width. */
function wrap(text, maxWidth, size) {
  const words = ascii(text).split(' ')
  const lines = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (next.length * size * 0.5 > maxWidth && line) { lines.push(line); line = w } else line = next
  }
  if (line) lines.push(line)
  return lines
}

function buildPdf(pages) {
  const objects = ['']           // 1-indexed
  const add = (body) => { objects.push(body); return objects.length - 1 }

  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  const fontBoldId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')

  const pageIds = []
  const pagesId = objects.length + pages.reduce((n, p) => n + (p.jpeg ? 3 : 2), 0) + 1

  for (const p of pages) {
    let imageId = null
    if (p.jpeg) {
      imageId = add({
        dict: `<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB ` +
              `/BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>`,
        stream: p.jpeg,
      })
    }
    const content = Buffer.from(p.content(imageId ? 'Im0' : null), 'latin1')
    const contentId = add({ dict: `<< /Length ${content.length} >>`, stream: content })
    pageIds.push(add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] ` +
      `/Resources << /Font << /F1 ${fontId} 0 R /F2 ${fontBoldId} 0 R >>` +
      `${imageId ? ` /XObject << /Im0 ${imageId} 0 R >>` : ''} >> ` +
      `/Contents ${contentId} 0 R >>`,
    ))
  }

  const realPagesId = add(`<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`)
  const catalogId = add(`<< /Type /Catalog /Pages ${realPagesId} 0 R >>`)

  // pagesId was predicted so /Parent could be written before /Pages existed
  if (realPagesId !== pagesId) {
    for (const i of pageIds) objects[i] = objects[i].replace(`/Parent ${pagesId} 0 R`, `/Parent ${realPagesId} 0 R`)
  }

  const chunks = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')]
  let offset = chunks[0].length
  const offsets = [0]

  for (let i = 1; i < objects.length; i++) {
    const o = objects[i]
    offsets[i] = offset
    const head = Buffer.from(`${i} 0 obj\n${typeof o === 'string' ? o : o.dict}\n`, 'latin1')
    const parts = typeof o === 'string'
      ? [head, Buffer.from('endobj\n', 'latin1')]
      : [head, Buffer.from('stream\n', 'latin1'), o.stream, Buffer.from('\nendstream\nendobj\n', 'latin1')]
    for (const b of parts) { chunks.push(b); offset += b.length }
  }

  const xrefStart = offset
  let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (let i = 1; i < objects.length; i++) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  xref += `trailer\n<< /Size ${objects.length} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  chunks.push(Buffer.from(xref, 'latin1'))

  return Buffer.concat(chunks)
}

/* ---------------------------------------------------------------- page content */

const text = (x, y, size, font, s) => `BT /${font} ${size} Tf ${x} ${y} Td (${esc(s)}) Tj ET\n`

function coverPage(count, date) {
  return () => {
    let c = '0.106 0.094 0.082 rg\n'
    c += text(MARGIN, A4.h - 300, 42, 'F2', 'PaisaPath')
    c += '0.306 0.282 0.243 rg\n'
    for (const [i, line] of wrap(
      'A financial mentor for first-time earners in India. Every rupee on screen is computed locally and can be re-derived; the AI engine only ever explains those numbers in plain language.',
      A4.w - MARGIN * 2 - 90, 12).entries()) {
      c += text(MARGIN, A4.h - 336 - i * 17, 12, 'F1', line)
    }
    c += '0.522 0.490 0.431 rg\n'
    c += text(MARGIN, A4.h - 250, 9, 'F1', `PRODUCT WALKTHROUGH  ·  ${date}`)
    c += `0.875 0.843 0.776 RG 0.7 w ${MARGIN} ${A4.h - 430} m ${A4.w - MARGIN} ${A4.h - 430} l S\n`
    c += text(MARGIN, A4.h - 452, 9, 'F1', `${count} screens, captured at 1440 px wide at 2x density`)
    c += text(MARGIN, A4.h - 468, 9, 'F1', 'Decision support  ·  Automation & planning  ·  Trust & financial education')
    return c
  }
}

function shotPage(index, total, title, w, h) {
  return (imgName) => {
    const boxW = A4.w - MARGIN * 2
    const boxH = A4.h - MARGIN * 2 - CAPTION_BAND
    const scale = Math.min(boxW / w, boxH / h)
    const dw = w * scale, dh = h * scale
    const x = MARGIN + (boxW - dw) / 2
    const y = MARGIN + (boxH - dh)

    let c = '0.522 0.490 0.431 rg\n'
    c += text(MARGIN, A4.h - MARGIN - 10, 8, 'F1', `${String(index).padStart(2, '0')} / ${total}`)
    c += '0.106 0.094 0.082 rg\n'
    for (const [i, line] of wrap(title, boxW, 11).entries()) c += text(MARGIN, A4.h - MARGIN - 28 - i * 14, 11, 'F2', line)
    if (imgName) {
      c += `q ${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /${imgName} Do Q\n`
      c += `0.875 0.843 0.776 RG 0.5 w ${x.toFixed(2)} ${y.toFixed(2)} ${dw.toFixed(2)} ${dh.toFixed(2)} re S\n`
    }
    return c
  }
}

/* ---------------------------------------------------------------- run */

export function buildSheet(dir, out) {
  const tmp = join(tmpdir(), `pp-pdf-${process.pid}`)
  mkdirSync(tmp, { recursive: true })
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith('.png')).sort()
    if (!files.length) throw new Error(`no PNGs in ${dir}`)

    const pages = [{ content: coverPage(files.length, new Date().toISOString().slice(0, 10)) }]

    for (const [i, f] of files.entries()) {
      const jpgPath = join(tmp, f.replace('.png', '.jpg'))
      // Downscale on the way to JPEG: 1400px is beyond what an A4 page can show.
      execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82',
        '--resampleWidth', '1400', join(dir, f), '--out', jpgPath], { stdio: 'ignore' })
      const probe = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', jpgPath], { encoding: 'utf8' })
      const w = +probe.match(/pixelWidth:\s*(\d+)/)[1]
      const h = +probe.match(/pixelHeight:\s*(\d+)/)[1]
      const key = f.replace('.png', '')
      pages.push({ jpeg: readFileSync(jpgPath), w, h, content: shotPage(i + 1, files.length, TITLES[key] || key, w, h) })
    }

    writeFileSync(out, buildPdf(pages))
    return { pages: pages.length, out }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..', 'screenshots')
  const out = join(dir, 'PaisaPath-screens.pdf')
  const r = buildSheet(dir, out)
  console.log(`${r.pages} pages → ${r.out}`)
}
