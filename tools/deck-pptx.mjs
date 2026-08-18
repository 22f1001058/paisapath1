// Build the slide deck as a .pptx, for Google Slides / PowerPoint.
//   node tools/deck-pptx.mjs
//
// A port of presentation/paisapath-progress.html, kept in the same palette. The
// web fonts (Fraunces, Inter, JetBrains Mono) are not on anyone else's machine,
// so this substitutes fonts Google Slides actually ships: Georgia for display,
// Arial for body, Courier New for the small caps labels.

import PptxGenJS from 'pptxgenjs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'presentation', 'PaisaPath-progress.pptx')

/* PaisaPath "The Ledger" */
const C = {
  paper: 'F4F0E8', card: 'FFFCF6',
  ink: '1B1815', ink2: '4E483E', ink3: '857D6E',
  rule: 'DFD7C6',
  forest: '14493C', marigold: 'C8891F', terracotta: 'AB4326',
}
const DISPLAY = 'Georgia'
const BODY = 'Arial'
const MONO = 'Courier New'

const W = 13.333, H = 7.5
const M = 0.72                 // side margin
const CW = W - M * 2           // content width

const pres = new PptxGenJS()
pres.layout = 'LAYOUT_WIDE'    // must be set before any slide is added
pres.author = 'PaisaPath · Team 20'
pres.title = 'PaisaPath'

const newSlide = () => {
  const s = pres.addSlide()
  s.background = { color: C.paper }
  return s
}

/** Small caps label above a title. */
const eyebrow = (s, text, y = 0.5) =>
  s.addText(text.toUpperCase(), {
    x: M, y, w: CW, h: 0.26, fontFace: MONO, fontSize: 10.5, color: C.ink3,
    charSpacing: 1.6, margin: 0, valign: 'middle',
  })

// Two lines' worth of height, top-aligned. The longest title wraps at this size,
// and a middle-aligned box would then drop one-line titles to a different baseline.
const title = (s, text, y = 0.8, size = 30) =>
  s.addText(text, {
    x: M, y, w: CW, h: 0.95, fontFace: DISPLAY, fontSize: size, bold: true,
    color: C.ink, margin: 0, valign: 'top', lineSpacingMultiple: 1.06,
  })

const sub = (s, text, y = 1.68, w = CW) =>
  s.addText(text, {
    x: M, y, w, h: 0.36, fontFace: BODY, fontSize: 13.5, color: C.ink2,
    margin: 0, valign: 'top', lineSpacingMultiple: 1.15,
  })

const footer = (s, left, n) => {
  s.addShape(pres.ShapeType.line, {
    x: M, y: H - 0.62, w: CW, h: 0, line: { color: C.rule, width: 0.75 },
  })
  s.addText(left.toUpperCase(), {
    x: M, y: H - 0.55, w: CW * 0.75, h: 0.26, fontFace: MONO, fontSize: 8.5,
    color: C.ink3, charSpacing: 1.2, margin: 0, valign: 'middle',
  })
  s.addText(`${String(n).padStart(2, '0')} / 07`, {
    x: M + CW * 0.75, y: H - 0.55, w: CW * 0.25, h: 0.26, fontFace: MONO, fontSize: 8.5,
    color: C.ink3, charSpacing: 1.2, margin: 0, align: 'right', valign: 'middle',
  })
}

/** A card. Fresh option object each call: pptxgenjs mutates them in place. */
const card = (s, { x, y, w, h, fill = C.card, border = C.rule }) =>
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.04,
    fill: { color: fill }, line: { color: border, width: 0.75 },
  })

/* ================================================================== 1 · title */
{
  const s = newSlide()
  eyebrow(s, 'BSMS4002 · Design Thinking for Data-Driven App Development · IIT Madras BS Degree', 2.05)
  s.addText('PaisaPath', {
    x: M, y: 2.4, w: CW, h: 1.15, fontFace: DISPLAY, fontSize: 60, bold: true,
    color: C.ink, margin: 0, valign: 'middle',
  })
  s.addText([
    { text: 'A beginner-friendly personal finance mentor for young adults entering financial independence. ', options: { color: C.ink2 } },
    { text: 'What nine interviews taught us, and what we built because of it.', options: { bold: true, color: C.ink } },
  ], { x: M, y: 3.62, w: 8.4, h: 0.9, fontFace: BODY, fontSize: 15, margin: 0, valign: 'top', lineSpacingMultiple: 1.2 })

  s.addText('Harsh Patel     ·     Arvind S     ·     Soham Ghosh     ·     Team 20', {
    x: M, y: 4.75, w: CW, h: 0.3, fontFace: BODY, fontSize: 12.5, color: C.ink2, margin: 0,
  })
  footer(s, 'Empathize → Define → Ideate → Build', 1)
  s.addNotes('We are Team 20, and this is PaisaPath. I will cover what we learned from our interviews, and what we built because of it.')
}

/* ============================================================ 2 · the customer */
{
  const s = newSlide()
  eyebrow(s, 'The customer story · 9 interviews')
  title(s, 'The first paycheck arrives before the first financial skill')
  sub(s, 'Three stages of handling money. Experience changed what went wrong. It did not fix it.')

  const people = [
    { lvl: 'Level 1 · Pre-earner', who: 'Riya, 19', q: '“It is just a small payment… where did all my money go?”', ink: C.forest },
    { lvl: 'Level 2 · Cautious first earner', who: 'Samik, 23', q: '“I want to manage my money wisely, but I’m still unsure I’m making the right decisions.”', ink: C.marigold },
    { lvl: 'Level 3 · Early investor', who: 'Anuj, 23', q: '“I have started investing, but I still don’t know whether I’m allocating the right way.”', ink: C.terracotta },
  ]
  const pw = (CW - 0.6) / 3
  people.forEach((p, i) => {
    const x = M + i * (pw + 0.3)
    // the level colour reads as a marker for the maturity level, not decoration
    s.addShape(pres.ShapeType.rect, { x, y: 2.15, w: 0.035, h: 1.42, fill: { color: p.ink }, line: { color: p.ink, width: 0 } })
    s.addText(p.lvl.toUpperCase(), { x: x + 0.16, y: 2.15, w: pw - 0.16, h: 0.22, fontFace: MONO, fontSize: 8, color: C.ink3, charSpacing: 1.1, margin: 0, valign: 'middle' })
    s.addText(p.who, { x: x + 0.16, y: 2.38, w: pw - 0.16, h: 0.32, fontFace: DISPLAY, fontSize: 17, bold: true, color: C.ink, margin: 0, valign: 'middle' })
    s.addText(p.q, { x: x + 0.16, y: 2.72, w: pw - 0.2, h: 0.8, fontFace: BODY, fontSize: 11.5, italic: true, color: C.ink2, margin: 0, valign: 'top', lineSpacingMultiple: 1.15 })
  })

  const stats = [
    { n: '9/9', ink: C.forest, l: 'had tried to track their spending and given up. Memory, UPI history, abandoned spreadsheets, even a self-built tracker' },
    { n: '9/9', ink: C.forest, l: 'brought up trust or privacy on their own, before we asked' },
    { n: '3/9', ink: C.terracotta, l: 'had already lost money on F&O, badly timed stocks or an over-invested stipend' },
    { n: '0/9', ink: C.terracotta, l: 'could explain how to divide up a salary' },
  ]
  const sw = (CW - 0.75) / 4
  stats.forEach((st, i) => {
    const x = M + i * (sw + 0.25)
    s.addText(st.n, { x, y: 3.95, w: sw, h: 0.78, fontFace: DISPLAY, fontSize: 42, bold: true, color: st.ink, margin: 0, valign: 'middle' })
    s.addText(st.l, { x, y: 4.78, w: sw, h: 1.1, fontFace: BODY, fontSize: 11, color: C.ink2, margin: 0, valign: 'top', lineSpacingMultiple: 1.15 })
  })
  footer(s, 'Canvas 1 · personas & journey maps', 2)
  s.addNotes('Nine interviews, three stages. What surprised us: the problem did not go away as people got more experienced, it just looked different.')
}

/* ============================================================ 3 · where it breaks */
{
  const s = newSlide()
  eyebrow(s, 'Problems uncovered · where every journey map bends')
  title(s, 'Confidence collapses between researching and deciding')
  sub(s, 'All nine journey maps came out the same shape, and they hit bottom in the same place.')

  // The emotional curve, drawn as segments so it stays a vector, not a chart widget.
  const pts = [
    { x: 1.5, y: 2.42, label: 'Income arrives' },
    { x: 3.4, y: 2.60, label: 'Plans to save' },
    { x: 5.3, y: 2.96, label: 'Researches options' },
    { x: 7.2, y: 3.30, label: 'Evaluates trust' },
    { x: 9.1, y: 3.52, label: '“I’ll decide later”', low: true },
    { x: 11.0, y: 3.02, label: 'Plans ahead' },
  ]
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]
    const down = b.y >= a.y
    // the run into the low point is the one that matters, so it carries the colour
    const isDip = i === 3
    s.addShape(pres.ShapeType.line, {
      x: a.x, y: Math.min(a.y, b.y), w: b.x - a.x, h: Math.abs(b.y - a.y),
      line: { color: isDip ? C.terracotta : C.rule, width: isDip ? 2.25 : 1.75 },
      flipV: !down,
    })
  }
  pts.forEach((p) => {
    const r = p.low ? 0.1 : 0.07
    s.addShape(pres.ShapeType.ellipse, {
      x: p.x - r, y: p.y - r, w: r * 2, h: r * 2,
      fill: { color: p.low ? C.terracotta : C.forest }, line: { color: p.low ? C.terracotta : C.forest, width: 0 },
    })
    // points sit 1.9" apart, so the label boxes have to stay under that to not overlap
    s.addText(p.label, {
      x: p.x - 0.9, y: 3.82, w: 1.8, h: 0.28, fontFace: BODY, fontSize: 10.5,
      color: p.low ? C.terracotta : C.ink3, bold: !!p.low, align: 'center', margin: 0, valign: 'middle',
    })
  })

  const cards = [
    ['Everyone stalls at the same point', 'They could follow the concepts. Choosing between a PPF, a fixed deposit and a mutual fund is where they stopped.', C.rule],
    ['Uncertainty peaks when sources disagree', 'Parents, YouTube, ChatGPT, Gemini. “Different people give different advice. What do I do first?”', C.rule],
    ['The lowest point is doing nothing', 'The money sits in the account and the confidence never builds. More experience does not flatten the curve.', C.terracotta],
  ]
  const cw2 = (CW - 0.6) / 3
  cards.forEach(([h, b, border], i) => {
    const x = M + i * (cw2 + 0.3)
    card(s, { x, y: 4.4, w: cw2, h: 1.5, border })
    s.addText(h, { x: x + 0.22, y: 4.58, w: cw2 - 0.44, h: 0.5, fontFace: BODY, fontSize: 12.5, bold: true, color: C.ink, margin: 0, valign: 'top', lineSpacingMultiple: 1.1 })
    s.addText(b, { x: x + 0.22, y: 5.06, w: cw2 - 0.44, h: 0.76, fontFace: BODY, fontSize: 10.5, color: C.ink2, margin: 0, valign: 'top', lineSpacingMultiple: 1.15 })
  })
  footer(s, 'Canvas 1 · 9 customer journey maps', 3)
  s.addNotes('Everyone got stuck at the same point: comparing the options. The lowest point on every map was doing nothing at all.')
}

/* ============================================================ 4 · root causes */
{
  const s = newSlide()
  eyebrow(s, 'Problems uncovered · multi-why to root causes')
  title(s, 'Four gaps generate every symptom we observed')

  const rcs = [
    ['RC·1', 'Guidance gap', 'No beginner-friendly, contextual help at the transition to independence. Education is generic and jargon-first; professional advice is expensive.', C.forest, 'F4EEDE'],
    ['RC·2', 'Structure gap', 'No planning tuned to income, goals and life stage. Our nine users needed four different budgeting approaches between them.', C.marigold, '2B1D06'],
    ['RC·3', 'Confidence gap', 'No way to see the reasoning behind a suggestion, and no safe way to build judgement before real money is at stake. So the decision gets put off.', C.terracotta, 'FBEDE7'],
    ['RC·4', 'Trust gap', 'Data practices and commercial incentives are unclear. People cannot check whether the guidance is impartial, so they fall back on family advice.', C.ink, C.paper],
  ]
  const bw = (CW - 0.35) / 2, bh = 1.42
  rcs.forEach(([tag, head, body, tagBg, tagFg], i) => {
    const x = M + (i % 2) * (bw + 0.35)
    const y = 1.86 + Math.floor(i / 2) * (bh + 0.32)
    card(s, { x, y, w: bw, h: bh })
    s.addShape(pres.ShapeType.roundRect, {
      x: x + 0.24, y: y + 0.24, w: 0.62, h: 0.26, rectRadius: 0.03,
      fill: { color: tagBg }, line: { color: tagBg, width: 0 },
    })
    s.addText(tag, { x: x + 0.24, y: y + 0.24, w: 0.62, h: 0.26, fontFace: MONO, fontSize: 8.5, bold: true, color: tagFg, align: 'center', margin: 0, valign: 'middle' })
    s.addText(head, { x: x + 0.98, y: y + 0.2, w: bw - 1.22, h: 0.3, fontFace: BODY, fontSize: 13.5, bold: true, color: C.ink, margin: 0, valign: 'middle' })
    s.addText(body, { x: x + 0.98, y: y + 0.52, w: bw - 1.22, h: 0.78, fontFace: BODY, fontSize: 10.5, color: C.ink2, margin: 0, valign: 'top', lineSpacingMultiple: 1.18 })
  })

  s.addText([
    { text: 'What we kept coming back to: ', options: { color: C.ink2 } },
    { text: 'these users already have plenty of information. What they are short of is confidence.', options: { bold: true, color: C.ink } },
    { text: ' And trust decides whether they open the app at all.', options: { color: C.ink2 } },
  ], { x: M, y: 5.42, w: CW, h: 0.6, fontFace: BODY, fontSize: 13, margin: 0, valign: 'top', lineSpacingMultiple: 1.2 })

  footer(s, 'Canvas 2 · multi-why analysis', 4)
  s.addNotes('Four gaps: no beginner guidance, no structure that fits a life stage, no visible reasoning, and unclear data practices.')
}

/* ============================================================ 5 · what we built */
{
  const s = newSlide()
  eyebrow(s, 'Solutions generated · every feature closes a named gap')
  title(s, 'Five ideas, four root causes')

  const feats = [
    ['RC·2 · Structure gap', 'generic rules fit no one', 'Personalised budgeting and first-salary onboarding',
      'A questionnaire works out your profile, then splits your salary across essentials, an emergency fund, investments and spending. You drag it until it fits your life.'],
    ['RC·2 · Structure gap', 'tracking dies on effort', 'Unified dashboard and automatic expense tracking',
      'Every account on one page. Expenses sort themselves, hidden charges get flagged, and you never type one in.'],
    ['RC·3 · Confidence gap', '“I’ll decide later”', '“What if” decision simulator',
      'Type the question the way you would say it. “What if I invest ₹5,000 instead of spending it?” You see both futures side by side.'],
    ['RC·1 · Guidance gap', 'help never arrives in time', 'Context-aware smart nudges',
      'They turn up when they are useful. Move money on the day your salary lands. Check a subscription that has crept up.'],
    ['RC·1 · Guidance gap', 'learning never becomes action', 'Financial education, in context',
      'Every term gets explained inside the app, right where you are making the decision. A moderated peer community comes next.'],
  ]
  const rowH = 0.79
  feats.forEach(([rc, why, what, detail], i) => {
    const y = 1.86 + i * rowH
    if (i) s.addShape(pres.ShapeType.line, { x: M, y: y - 0.06, w: CW, h: 0, line: { color: C.rule, width: 0.5 } })
    s.addText([
      { text: rc, options: { bold: true, color: C.ink2 } },
      { text: `\n${why}`, options: { color: C.ink3 } },
    ], { x: M, y, w: 3.0, h: 0.62, fontFace: BODY, fontSize: 10.5, margin: 0, valign: 'middle', lineSpacingMultiple: 1.15 })
    s.addText('→', { x: M + 3.05, y, w: 0.3, h: 0.62, fontFace: BODY, fontSize: 12, color: C.rule, margin: 0, align: 'center', valign: 'middle' })
    s.addText(what, { x: M + 3.45, y: y - 0.02, w: CW - 3.45, h: 0.28, fontFace: BODY, fontSize: 12.5, bold: true, color: C.ink, margin: 0, valign: 'middle' })
    s.addText(detail, { x: M + 3.45, y: y + 0.24, w: CW - 3.45, h: 0.46, fontFace: BODY, fontSize: 10.5, color: C.ink2, margin: 0, valign: 'top', lineSpacingMultiple: 1.12 })
  })
  footer(s, 'Root causes to features · Canvas 2', 5)
  s.addNotes('Each feature answers one of the four gaps. The simulator is the one people react to: you type the question the way you would say it out loud.')
}

/* ============================================================ 6 · the AI principle */
{
  const s = newSlide()
  eyebrow(s, 'RC·4 · Trust gap · the sharpest thing we have been asked')
  title(s, '“Won’t AI become one more conflicting advisor?”')
  sub(s, 'It cannot, because it never gets an opinion. That is built into the architecture.')

  const colW = (CW - 0.7) / 2
  const cols = [
    ['What we did not build', C.terracotta, [
      'Another voice competing with parents, YouTube and ChatGPT',
      'Product picks out of a black box the user cannot check',
      'Anything tuned for engagement or commission',
    ]],
    ['What we built instead', C.forest, [
      'Deterministic rules produce every rupee on screen',
      'The model gets the finished figures and puts them into plain English. It is never asked to work one out',
      'Every recommendation shows its reasoning, its risk and two alternatives',
    ]],
  ]
  cols.forEach(([head, ink, items], i) => {
    const x = M + i * (colW + 0.7)
    s.addText(head.toUpperCase(), { x, y: 2.15, w: colW, h: 0.26, fontFace: MONO, fontSize: 9, bold: true, color: ink, charSpacing: 1.2, margin: 0, valign: 'middle' })
    items.forEach((t, k) => {
      const y = 2.55 + k * 0.62
      s.addShape(pres.ShapeType.ellipse, { x, y: y + 0.09, w: 0.09, h: 0.09, fill: { color: ink }, line: { color: ink, width: 0 } })
      s.addText(t, { x: x + 0.24, y, w: colW - 0.24, h: 0.56, fontFace: BODY, fontSize: 11.5, color: C.ink2, margin: 0, valign: 'top', lineSpacingMultiple: 1.15 })
    })
  })

  card(s, { x: M, y: 4.62, w: CW, h: 1.28 })
  s.addText('WHY IT HOLDS', { x: M + 0.26, y: 4.8, w: CW - 0.52, h: 0.24, fontFace: MONO, fontSize: 9, color: C.ink3, charSpacing: 1.2, margin: 0, valign: 'middle' })
  s.addText('The maths lives in one file that contains no AI at all, so you can check any figure yourself. When the AI is unreachable every screen still works. A Trust Centre logs each AI call and what got sent. It weighs up the conflicting advice for the user, and has none of its own to add.', {
    x: M + 0.26, y: 5.08, w: CW - 0.52, h: 0.7, fontFace: BODY, fontSize: 12, color: C.ink2, margin: 0, valign: 'top', lineSpacingMultiple: 1.2,
  })
  footer(s, 'Design principle · answers the dissent we got', 6)
  s.addNotes('Our strongest slide. Slow down here. All the arithmetic is done by fixed rules; the model only gets handed finished figures.')
}

/* ============================================================ 7 · where we are */
{
  const s = newSlide()
  eyebrow(s, 'Where we are')
  s.addText('From “I’ll decide later”\nto one clear step,\nwith the reason shown.', {
    x: M, y: 1.55, w: 5.6, h: 1.9, fontFace: DISPLAY, fontSize: 26, color: C.ink,
    margin: 0, valign: 'top', lineSpacingMultiple: 1.25,
  })
  s.addText('Ten screens are built and running, including the questionnaire, the mentor, and the simulator you can ask in plain English.', {
    x: M, y: 3.62, w: 5.3, h: 0.95, fontFace: BODY, fontSize: 12.5, color: C.ink2, margin: 0, valign: 'top', lineSpacingMultiple: 1.2,
  })

  const nums = [
    ['10', 'screens, built and running'],
    ['6', 'financial profiles, from 22 questions'],
    ['9', 'nudge triggers, each carrying its evidence'],
    ['0', 'numbers written by an AI'],
  ]
  const gx = 7.0, gw = (W - gx - M - 0.3) / 2, gh = 1.5
  nums.forEach(([n, l], i) => {
    const x = gx + (i % 2) * (gw + 0.3)
    const y = 1.55 + Math.floor(i / 2) * (gh + 0.3)
    card(s, { x, y, w: gw, h: gh })
    s.addText(n, { x: x + 0.26, y: y + 0.2, w: gw - 0.52, h: 0.62, fontFace: DISPLAY, fontSize: 34, bold: true, color: C.forest, margin: 0, valign: 'middle' })
    s.addText(l, { x: x + 0.26, y: y + 0.84, w: gw - 0.52, h: 0.5, fontFace: BODY, fontSize: 11, color: C.ink2, margin: 0, valign: 'top', lineSpacingMultiple: 1.15 })
  })

  s.addText('FEEDBACK OVER APPLAUSE. PUSH HARDEST ON WHETHER THE EXPLANATIONS ACTUALLY EARN TRUST', {
    x: M, y: 5.05, w: 5.6, h: 0.7, fontFace: MONO, fontSize: 9.5, color: C.ink3,
    charSpacing: 1.2, margin: 0, valign: 'top', lineSpacingMultiple: 1.3,
  })
  footer(s, 'PaisaPath · Team 20', 7)
  s.addNotes('Ten screens built and working, and no number anywhere in the app was written by an AI. Tell us where the explanations still will not earn trust.')
}

await pres.writeFile({ fileName: out })
console.log(`deck → ${out}`)
