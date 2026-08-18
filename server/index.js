import express from 'express'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { all, one, run, db, getSetting, setSetting, logEvent } from './db.js'
import { seedIfEmpty, TODAY } from './seed.js'
import { ask, askStream, probeAll, providerOf, publicView, PROVIDERS, DEFAULT_PROVIDER } from './ai.js'
import * as fin from './finance.js'
import * as prof from './profile.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const app = express()
app.use(express.json({ limit: '1mb' }))

seedIfEmpty()

// A stored provider can vanish when the .env changes under a running install,
// so every read validates against the live catalogue rather than trusting it.
const provider = () => {
  const stored = getSetting('provider', DEFAULT_PROVIDER)
  return PROVIDERS[stored] ? stored : DEFAULT_PROVIDER
}
const engine = () => providerOf(provider())
const today = () => getSetting('today', TODAY)
const month = () => today().slice(0, 7)
const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`

/* ------------------------------------------------------------------ core state */

function snapshot(m = month()) {
  const profile = one('SELECT * FROM profile WHERE id = 1')
  const accounts = all('SELECT * FROM accounts ORDER BY kind, name')
  const bills = all('SELECT * FROM bills ORDER BY due_day')
  const goals = all('SELECT * FROM goals ORDER BY priority')
  const txns = all('SELECT * FROM txns ORDER BY date DESC')
  const budget = all('SELECT * FROM budget WHERE month = ?', m)

  const summary = fin.monthSummary(txns, m)

  // Two different "money for the future" figures, deliberately kept apart:
  //  goalContrib  = what every goal would need if all target dates held. Aspirational.
  //                 The Goals page uses it to warn when the goals stop fitting the income.
  //  plannedFuture = what is actually committed this month (budget, or a 15% floor).
  //                 Safe-to-Spend reserves this one — reserving the aspiration would
  //                 show ₹0 to anyone whose goals are ambitious, which helps nobody.
  const goalContrib = goals.reduce((x, g) => x + fin.goalPlan(g, today()).monthly, 0)
  const budgetFuture = budget.filter((b) => b.bucket === 'future').reduce((x, b) => x + b.amount, 0)
  const plannedFuture = budgetFuture || Math.round(profile.monthly_income * 0.15)

  const sts = fin.safeToSpend({ income: summary.income || profile.monthly_income, bills, goalContrib: plannedFuture, txns, month: m, today: today() })

  // Two ways to score the same five pillars. A brand-new account has nothing to
  // measure, so the questionnaire answers stand in — clearly labelled, and
  // replaced by the measured score as soon as there is enough real history.
  // Never silently blend the two: "we measured this" and "you told us this" are
  // different claims and the UI has to be able to say which one it is showing.
  const answers = profile.answers ? JSON.parse(profile.answers) : null
  const measured = fin.healthScore({ income: profile.monthly_income, txns, month: m, goals, bills, accounts })
  const enoughHistory = txns.length >= 20
  const health = enoughHistory || !answers
    ? { ...measured, basis: 'measured' }
    : prof.selfReportedHealth(answers, prof.scoreAnswers(answers))

  const assessment = answers ? prof.assess(answers) : null
  const order = fin.fundingOrder({ health, goals, accounts, income: profile.monthly_income })

  return {
    profile, accounts, bills, goals, txns, budget, summary, sts, health, order,
    month: m, today: today(), goalContrib, plannedFuture, assessment,
  }
}

app.get('/api/state', (req, res) => {
  const m = req.query.month || month()
  const s = snapshot(m)
  const prev = fin.shiftMonth(m, -1)
  res.json({
    ...s,
    txns: s.txns.slice(0, 60),
    txnCount: s.txns.length,
    deltas: fin.categoryDelta(s.txns, m, prev),
    prevSummary: fin.monthSummary(s.txns, prev),
    goalPlans: Object.fromEntries(s.goals.map((g) => [g.id, fin.goalPlan(g, s.today)])),
    milestones: all("SELECT * FROM events WHERE kind = 'milestone' ORDER BY id DESC"),
    months: all('SELECT DISTINCT substr(date,1,7) AS m FROM txns ORDER BY m DESC').map((r) => r.m),
    provider: provider(),
    uncategorised: s.txns.filter((t) => !t.category).length,
    budgetNotes: readCache(`budget-notes:${m}`),
    assumptions: fin.ASSUMPTIONS,
  })
})

app.get('/api/txns', (req, res) => {
  const { month: m, q, category, limit = 500 } = req.query
  let sql = 'SELECT * FROM txns WHERE 1=1', p = []
  if (m) { sql += ' AND date LIKE ?'; p.push(`${m}%`) }
  if (category) { sql += ' AND category = ?'; p.push(category) }
  if (q) { sql += ' AND merchant LIKE ?'; p.push(`%${q}%`) }
  sql += ' ORDER BY date DESC, id DESC LIMIT ?'; p.push(+limit)
  res.json(all(sql, ...p))
})

app.patch('/api/txns/:id', (req, res) => {
  run('UPDATE txns SET category = ?, source = ? WHERE id = ?', req.body.category, 'user', req.params.id)
  res.json(one('SELECT * FROM txns WHERE id = ?', req.params.id))
})

/* ------------------------------------------------------------------ nudges */

app.get('/api/nudges', (req, res) => {
  const s = snapshot()
  const dismissed = new Set(all('SELECT id FROM nudge_dismissed').map((r) => r.id))
  const list = fin.nudges({ ...s, month: s.month, today: s.today })
  res.json({
    nudges: list.filter((n) => !dismissed.has(n.id)),
    dismissedCount: list.length - list.filter((n) => !dismissed.has(n.id)).length,
  })
})

app.post('/api/nudges/:id/dismiss', (req, res) => {
  run('INSERT INTO nudge_dismissed (id, ts) VALUES (?, ?) ON CONFLICT(id) DO NOTHING', req.params.id, new Date().toISOString())
  res.json({ ok: true })
})

app.delete('/api/nudges/dismissed', (req, res) => { run('DELETE FROM nudge_dismissed'); res.json({ ok: true }) })

/* ------------------------------------------------------------------ onboarding */

app.get('/api/onboard/questions', (req, res) => res.json({ questions: prof.QUESTIONS, sections: prof.SECTIONS }))

/** Score without saving, so the profile can be shown before it is committed. */
app.post('/api/onboard/assess', (req, res) => res.json(prof.assess(req.body.answers || {})))

app.post('/api/ai/profile-note', async (req, res) => {
  const { answers, assessment } = req.body
  const key = cacheKey('profile-note', assessment.profile.key, assessment.scores.capacity, assessment.scores.appetite, assessment.scores.awareness, provider())
  const hit = readCache(key)
  if (hit) return res.json(hit)

  const out = await ask({
    task: 'profile',
    provider: provider(),
    json: true,
    shared: 'Your questionnaire scores and the profile the rule engine assigned. Not your name or date of birth.',
    instruction: `A rule engine has classified this person into a financial profile. The classification is final — do not second-guess it, re-rank it, or hedge it.

Write it back to them as a person, not as a category.

Return:
  "opening": 2 sentences addressed to them, saying what this profile means for their situation specifically. No greeting, no restating the profile name.
  "strength": the genuine advantage their answers reveal, one sentence. Every profile has one — find the real one, do not invent flattery.
  "blindspot": the thing most likely to hurt them, one honest sentence.
  "thisWeek": one concrete action for the next seven days, with a rupee figure if one applies.`,
    context: {
      profile: assessment.profile.name,
      what_it_means: assessment.profile.meaning,
      scores: assessment.scores,
      why_this_profile: assessment.profile.reasons,
      knowledge_gaps: prof.scoreAnswers(answers).gaps,
      monthly_take_home: inr(answers.income || 0),
      life_stage: answers.stage,
    },
    fallback: () => ({
      opening: assessment.profile.meaning.split('. ').slice(0, 2).join('. ') + '.',
      strength: 'You answered honestly enough for this to be useful, which is the part most people skip.',
      blindspot: assessment.profile.watch,
      thisWeek: assessment.profile.first[0],
    }),
  })

  const payload = { ...out.value, source: out.source, fallback: out.fallback, error: out.error }
  if (!out.fallback) writeCache(key, payload)
  res.json(payload)
})

app.get('/api/onboard/split', (req, res) => {
  const income = Math.max(1, Math.round(+req.query.income || 0))
  const stage = req.query.stage || 'professional'
  const rent = req.query.rent ? Math.round(+req.query.rent) : null
  res.json({
    income, stage,
    split: fin.salarySplit({ income, stage, rent, emergencyMonths: 0 }),
    buckets: fin.SPLIT_BUCKETS,
  })
})

app.post('/api/onboard', (req, res) => {
  const { answers = {}, payDay = 1, split, goals: wanted = [] } = req.body
  const name = answers.name || req.body.name
  const city = answers.city || req.body.city
  // 'firstjob' and 'freelance' both budget like a working professional; the
  // templates only distinguish student from earner.
  const stage = (answers.stage || req.body.stage) === 'student' ? 'student' : 'professional'
  const monthly = Math.round(+(answers.income ?? req.body.income))
  const assessment = prof.assess(answers)

  run('UPDATE profile SET name=?, stage=?, city=?, monthly_income=?, pay_day=?, onboarded=1, answers=?, profile_key=? WHERE id = 1',
    name || 'You', stage, city, monthly, +payDay, JSON.stringify(answers), assessment.profile.key)
  logEvent('milestone', `You are a ${assessment.profile.name}`, assessment.profile.reasons.join(' '))

  // The emergency fund is created for everyone, not offered as an option — it is
  // the one goal the whole funding order depends on.
  const emergencyMonthly = split.find((b) => b.key === 'emergency')?.amount || Math.round(monthly * 0.15)
  const target = Math.round((monthly * 0.7 * 6) / 1000) * 1000
  const existing = one("SELECT id FROM goals WHERE kind = 'emergency'")
  if (existing) run('UPDATE goals SET target = ?, target_date = ? WHERE id = ?', target, fin.shiftMonth(month(), Math.ceil(target / Math.max(1, emergencyMonthly))), existing.id)
  else run('INSERT INTO goals (id,name,kind,target,saved,target_date,priority,emoji) VALUES (?,?,?,?,?,?,?,?)',
    'gl_emg', 'Emergency fund', 'emergency', target, 0, fin.shiftMonth(month(), Math.ceil(target / Math.max(1, emergencyMonthly))), 1, '🛟')

  for (const g of wanted) {
    const id = `gl_${g.name.replace(/\W+/g, '').slice(0, 8).toLowerCase()}`
    run('INSERT INTO goals (id,name,kind,target,saved,target_date,priority,emoji) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',
      id, g.name, 'goal', Math.round(+g.target), 0, g.target_date, +g.priority || 5, g.emoji || '🎯')
  }

  const rows = fin.splitToBudget(split, stage)
  run('DELETE FROM budget WHERE month = ?', month())
  const ins = db.prepare('INSERT INTO budget (id,category,amount,bucket,month,origin) VALUES (?,?,?,?,?,?)')
  for (const r of rows) ins.run(`bd_${month()}_${r.category.replace(/\W+/g, '')}`, r.category, r.amount, r.bucket, month(), 'user')

  logEvent('milestone', 'You made a plan', `Split ${inr(monthly)} across essentials, savings, investments and everyday spending.`)
  res.json({ ok: true, budget: rows, assessment, profile: one('SELECT * FROM profile WHERE id = 1') })
})

app.post('/api/ai/onboard-plan', async (req, res) => {
  const { stage, city, income, split } = req.body
  const out = await ask({
    task: 'onboard',
    provider: provider(),
    json: true,
    shared: 'Your life stage, city, monthly take-home and the split you chose. No transactions — there are none yet.',
    instruction: `This person has just told the app about their first salary. A rule engine has already produced the split below; the amounts are final.

Write the plan back to them in their own terms.

Return:
  "headline": one sentence under 18 words describing what this plan is doing for them
  "notes": {"<bucket key>": "<one sentence on what that number is really for, referencing the rupee amount>"}
  "firstStep": the single thing to do in the next 24 hours, one sentence with the amount in it
  "watchFor": the part of this plan most likely to break in month one, one honest sentence`,
    context: { stage, city, monthly_take_home: inr(income), split: split.map((b) => `${b.label}: ${inr(b.amount)} (${Math.round(b.share * 100)}%)`) },
    fallback: () => ({
      headline: `A first plan for a ${stage} in ${city}, built to fund the emergency buffer before anything else.`,
      notes: Object.fromEntries(split.map((b) => [b.key, `${inr(b.amount)} a month — ${b.note}`])),
      firstStep: `Set up an automatic transfer of ${inr(split.find((b) => b.key === 'emergency')?.amount || 0)} on your pay day.`,
      watchFor: 'Month one always costs more than expected. Adjust the everyday line rather than the savings line.',
    }),
  })
  res.json({ ...out.value, source: out.source, fallback: out.fallback, error: out.error })
})

/* ------------------------------------------------------------------ providers */

app.get('/api/providers', async (req, res) => {
  // probeAll already returns the public view: configuration and status, no keys.
  res.json({ active: provider(), providers: await probeAll({ force: req.query.force === '1' }) })
})

app.post('/api/provider', (req, res) => {
  const p = PROVIDERS[req.body.name]
  if (!p) return res.status(400).json({ error: 'unknown provider' })
  if (!p.configured) return res.status(400).json({ error: `${p.label} is not configured — ${p.missing}` })
  setSetting('provider', p.name)
  logEvent('system', 'AI engine changed',
    `Recommendations will now be written by ${p.label}${p.model ? ` (${p.model})` : ''}.`)
  res.json({ active: p.name, provider: publicView(p) })
})

/* ------------------------------------------------------------------ AI: priorities */

const cacheKey = (task, ...parts) => `${task}:${createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12)}`
const readCache = (k) => { const r = one('SELECT v, ts FROM cache WHERE k = ?', k); return r ? { ...JSON.parse(r.v), cachedAt: r.ts } : null }
const writeCache = (k, v) => run('INSERT INTO cache (k,v,ts) VALUES (?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, ts=excluded.ts', k, JSON.stringify(v), new Date().toISOString())

app.get('/api/ai/priorities', async (req, res) => {
  const s = snapshot()
  const key = cacheKey('priorities', s.month, s.health.total, s.sts.safe, provider())
  const hit = req.query.refresh !== '1' && readCache(key)
  if (hit) return res.json(hit)

  const context = {
    person: { name: s.profile.name, age_band: '22-25', stage: s.profile.stage, city: s.profile.city, months_using_app: 4 },
    computed: {
      monthly_take_home: inr(s.profile.monthly_income),
      safe_to_spend_right_now: inr(s.sts.safe),
      days_left_in_month: s.sts.daysLeft,
      financial_health_score: `${s.health.total}/100 (${s.health.band})`,
      emergency_fund_months_covered: s.health.monthsCovered.toFixed(1),
      savings_rate_this_month: `${Math.round(s.health.savingsRate * 100)}%`,
      spent_this_month: inr(s.summary.spend),
      top_categories: s.summary.categories.slice(0, 5).map((c) => `${c.category} ${inr(c.amount)}`),
      biggest_changes_vs_last_month: s.deltas ?? undefined,
      goals: s.goals.map((g) => { const p = fin.goalPlan(g, s.today); return `${g.name}: ${inr(g.saved)} of ${inr(g.target)}, needs ${inr(p.monthly)}/month for ${p.months} months` }),
      rule_engine_funding_order: s.order.map((o) => `${o.rank}. ${o.action}`),
    },
  }

  const out = await ask({
    task: 'priorities',
    provider: provider(),
    json: true,
    shared: 'Aggregated monthly totals, category names, goal progress and the computed score. No merchant names, no account numbers.',
    instruction: `Write the three things this person should do next with their money, in priority order.

The rule engine has already decided the ordering — respect it, do not reorder. Your job is to make each step feel obvious and doable.

For each step return:
  "title": under 9 words, an instruction not a topic
  "body": 2 sentences maximum, referencing their actual computed figures
  "why": one sentence starting with "Because" that names the specific number driving this
  "risk": the honest downside of doing this, one sentence. Never write "none".
  "alternative": a smaller or different version for someone who cannot commit fully
  "effort": one of "2 minutes", "10 minutes", "this weekend"

Return {"steps":[...]}`,
    context,
    fallback: () => ({
      steps: s.order.slice(0, 3).map((o) => ({
        title: o.action, body: o.why, why: `Because ${o.why[0].toLowerCase()}${o.why.slice(1)}`,
        risk: 'Money committed here is not available for other things this month.',
        alternative: 'Start with half the amount and raise it next month.', effort: '10 minutes',
      })),
    }),
  })

  const payload = { ...out.value, source: out.source, fallback: out.fallback, error: out.error, generatedAt: new Date().toISOString() }
  if (!out.fallback) writeCache(key, payload)
  res.json(payload)
})

/* ------------------------------------------------------------------ AI: categorise */

app.post('/api/ai/categorise', async (req, res) => {
  const rows = all('SELECT * FROM txns WHERE category IS NULL ORDER BY date DESC')
  if (!rows.length) return res.json({ updated: 0, items: [], source: 'nothing to do' })

  const out = await ask({
    task: 'categorise',
    provider: provider(),
    json: true,
    shared: `${rows.length} merchant strings and amounts. Sent without dates, accounts or balances.`,
    instruction: `These bank and UPI transaction descriptions could not be matched by the rule engine. Assign each one a category.

Allowed categories, exactly as written: ${fin.CATEGORIES.join(', ')}

Indian payment strings are cryptic. "PAYTM*", "RAZ*", "SQ *" and "BBPS" are payment-gateway prefixes, not the merchant. A bare "UPI/<name>/<number>" is usually a person, not a business.

Return {"items":[{"id":"...","category":"...","confidence":0.0-1.0,"reason":"under 12 words"}]}
Use confidence below 0.6 when the string is genuinely ambiguous — a low score is more useful than a confident guess.`,
    context: rows.map((t) => ({ id: t.id, merchant: t.merchant, amount: t.amount, method: t.method })),
    fallback: () => ({ items: rows.map((t) => ({ id: t.id, category: fin.ruleCategorise(t.merchant, t.amount) || 'Other', confidence: 0.3, reason: 'no rule matched — defaulted' })) }),
  })

  const items = (out.value.items || []).filter((i) => fin.CATEGORIES.includes(i.category))
  for (const i of items) run('UPDATE txns SET category = ?, source = ?, note = ? WHERE id = ?', i.category, 'ai', i.reason || null, i.id)
  logEvent('system', 'Transactions categorised', `${items.length} transactions labelled by ${out.source}.`)
  res.json({ updated: items.length, items, source: out.source, fallback: out.fallback, error: out.error })
})

/* ------------------------------------------------------------------ AI: budget */

app.post('/api/ai/budget', async (req, res) => {
  const s = snapshot()
  const rows = fin.generateBudget({ stage: req.body.stage || s.profile.stage, income: s.profile.monthly_income, txns: s.txns, month: s.month })

  const out = await ask({
    task: 'budget',
    provider: provider(),
    json: true,
    shared: 'Category names, the rule-engine budget amounts and your 3-month category averages.',
    instruction: `A rule engine has produced a monthly budget. Do not change any amount — the numbers are final.

Write one sentence per line explaining what that number is doing for this person and why it is set where it is. Reference their own averages when the budget differs from what they actually spend.

Then write a "headline": one sentence, under 20 words, describing the shape of this budget in plain language.
And "tradeoff": the single most uncomfortable thing about this budget, stated honestly.

Return {"headline":"...","tradeoff":"...","notes":{"<category>":"<one sentence>"}}`,
    context: { stage: s.profile.stage, monthly_income: inr(s.profile.monthly_income), budget: rows.map((r) => ({ category: r.category, amount: inr(r.amount), bucket: r.bucket, basis: r.basis })) },
    fallback: () => ({
      headline: `A ${s.profile.stage} budget built from your last three months of actual spending.`,
      tradeoff: 'Discretionary categories were trimmed first to keep savings intact.',
      notes: Object.fromEntries(rows.map((r) => [r.category, `Set from ${r.basis}.`])),
    }),
  })

  run('DELETE FROM budget WHERE month = ?', s.month)
  const ins = db.prepare('INSERT INTO budget (id,category,amount,bucket,month,origin) VALUES (?,?,?,?,?,?)')
  for (const r of rows) ins.run(`bd_${s.month}_${r.category.replace(/\W+/g, '')}`, r.category, r.amount, r.bucket, s.month, out.fallback ? 'rule' : 'ai')

  // Keep the commentary with the budget. A budget whose reasoning vanishes on
  // reload is back to being a table of numbers somebody else chose.
  const payload = { ...out.value, source: out.source, fallback: out.fallback, error: out.error }
  writeCache(`budget-notes:${s.month}`, payload)
  res.json({ rows, ...payload })
})

app.patch('/api/budget/:id', (req, res) => {
  run('UPDATE budget SET amount = ?, origin = ? WHERE id = ?', Math.max(0, +req.body.amount), 'user', req.params.id)
  res.json(one('SELECT * FROM budget WHERE id = ?', req.params.id))
})

/* ------------------------------------------------------------------ AI: simulate */

/**
 * Free text → a scenario object the projection engine can run.
 * The model only classifies and extracts; it never runs the maths.
 */
app.post('/api/ai/parse-scenario', async (req, res) => {
  const question = String(req.body.question || '').slice(0, 400)

  const out = await ask({
    task: 'parse-scenario',
    provider: provider(),
    json: true,
    shared: 'Only the sentence you typed.',
    instruction: `Turn this what-if question into one scenario object. Extract only what the sentence actually says — do not invent an amount that is not there.

Indian number words count: "50k" = 50000, "1.5 lakh"/"1.5L" = 150000, "2 cr" = 20000000.

Choose exactly one kind:
  "swap"     — two options weighed against each other: investing rather than spending, saving rather than buying. Use this whenever the sentence contains "instead of", "rather than", or "vs".
  "purchase" — a one-off spend with no alternative named
  "emi"      — anything bought on instalments, or where a monthly payment for a fixed term is described
  "invest"   — starting or changing a regular investment with no spending alternative named

Return {"scenario": {...}, "restated": "<the question restated in under 12 words>", "assumed": "<anything you had to assume, or null>"}

Scenario fields by kind:
  swap     → {"kind":"swap","amount":<rupees>,"monthly":<true if it recurs every month>,"months":<term if monthly, else omit>}
  purchase → {"kind":"purchase","amount":<rupees>}
  emi      → {"kind":"emi","emi":<monthly rupees>,"months":<term, default 12>}
  invest   → {"kind":"invest","monthlySip":<rupees>,"delayMonths":<0 unless a delay is described>}`,
    context: { question },
    fallback: () => {
      // Regex fallback so the simulator still answers when no engine is reachable.
      const num = (s) => {
        const m = s.match(/(?:₹|rs\.?\s*)?([\d,]+(?:\.\d+)?)\s*(k|lakh|lac|l|cr|crore)?/i)
        if (!m) return null
        const n = parseFloat(m[1].replace(/,/g, ''))
        const unit = (m[2] || '').toLowerCase()
        return Math.round(n * (unit === 'k' ? 1e3 : ['lakh', 'lac', 'l'].includes(unit) ? 1e5 : ['cr', 'crore'].includes(unit) ? 1e7 : 1))
      }
      const amount = num(question) || 10000
      const monthly = /per month|monthly|every month|a month|sip/i.test(question)
      if (/instead of|rather than|\bvs\b|versus/i.test(question)) return { scenario: { kind: 'swap', amount, monthly, months: 12 }, restated: question.slice(0, 60), assumed: 'Matched by keyword — the AI engine was unavailable.' }
      if (/emi|instalment|installment|finance it/i.test(question)) return { scenario: { kind: 'emi', emi: amount, months: 12 }, restated: question.slice(0, 60), assumed: 'Assumed a 12-month term.' }
      if (/invest|sip|mutual fund|index/i.test(question)) return { scenario: { kind: 'invest', monthlySip: amount, delayMonths: 0 }, restated: question.slice(0, 60), assumed: null }
      return { scenario: { kind: 'purchase', amount }, restated: question.slice(0, 60), assumed: 'Read as a one-off purchase.' }
    },
  })

  res.json({ ...out.value, source: out.source, fallback: out.fallback, error: out.error })
})

app.post('/api/ai/simulate', async (req, res) => {
  const s = snapshot()
  const scenario = req.body.scenario
  const state = {
    income: s.profile.monthly_income,
    monthlySave: 6000, monthlyInvest: 5000,
    savingsBalance: s.accounts.filter((a) => a.kind === 'savings').reduce((x, a) => x + a.balance, 0),
    investBalance: s.accounts.filter((a) => a.kind === 'invest').reduce((x, a) => x + a.balance, 0),
    monthlyExpense: s.summary.spend || s.profile.monthly_income * 0.7,
  }
  const sim = fin.simulate(scenario, state)

  const out = await ask({
    task: 'simulate',
    provider: provider(),
    json: true,
    shared: 'The scenario you typed, plus the projected balances the calculator produced.',
    instruction: `A projection engine has already run this what-if. All figures below are final; quoting them is your only source of numbers.

Return:
  "verdict": one of "comfortable", "tight", "risky"
  "summary": 2 sentences on what actually happens to this person's money
  "watchFor": the one thing that would make this go wrong, one sentence
  "smallerVersion": a scaled-down alternative that keeps most of the benefit, one sentence
  "learn": {"term": "<one financial term this scenario depends on>", "plain": "<explain it in under 25 words>"}

Return JSON only.`,
    context: {
      scenario,
      monthly_take_home: inr(s.profile.monthly_income),
      monthly_expenses: inr(state.monthlyExpense),
      cash_today: inr(state.savingsBalance),
      invested_today: inr(state.investBalance),
      emergency_months_covered: s.health.monthsCovered.toFixed(1),
      engine_headline: sim.headline,
      engine_mechanics: sim.mechanics,
      net_worth_in_24_months_if_you_do_it: inr(sim.after.at(-1).net),
      net_worth_in_24_months_if_you_do_not: inr(sim.base.at(-1).net),
      // present only for A-vs-B scenarios
      net_worth_in_24_months_with_the_other_option: sim.alt ? inr(sim.alt.at(-1).net) : undefined,
      the_two_options: sim.labels ?? undefined,
      assumptions: `${Math.round(fin.ASSUMPTIONS.equityReturn * 100)}% equity, ${(fin.ASSUMPTIONS.savingsReturn * 100).toFixed(1)}% savings, nominal`,
    },
    fallback: () => ({
      verdict: sim.after.at(-1).net < sim.base.at(-1).net * 0.8 ? 'risky' : 'tight',
      summary: sim.headline,
      watchFor: 'An unexpected expense while your buffer is lower than usual.',
      smallerVersion: 'Do half of it now and revisit in three months.',
      learn: { term: 'Opportunity cost', plain: 'What the same money would have grown into if you had left it invested instead.' },
    }),
  })

  res.json({ ...sim, ai: out.value, source: out.source, fallback: out.fallback, error: out.error })
})

/* ------------------------------------------------------------------ AI: explain / learn */

app.post('/api/ai/explain', async (req, res) => {
  const s = snapshot()
  const { claim, context: extra } = req.body
  const key = cacheKey('explain', claim, s.month, provider())
  const hit = readCache(key)
  if (hit) return res.json(hit)

  const out = await ask({
    task: 'explain',
    provider: provider(),
    json: true,
    shared: 'The recommendation text being questioned plus the summary figures behind it.',
    instruction: `The person tapped "Why am I seeing this?" on the recommendation below. Answer it properly.

Return:
  "why": why this specific person is being shown this, referencing their computed figures. 2 sentences.
  "benefit": what they get if they follow it. 1 sentence.
  "risk": the real downside. 1 sentence. Never write "none" — there is always a cost.
  "alternatives": array of exactly 2 objects {"label": "<under 8 words>", "detail": "<1 sentence>"}
  "basis": one sentence naming which of their numbers drove this and where those numbers came from
  "notAdvice": one short sentence reminding them this is guidance, not regulated financial advice`,
    context: {
      recommendation: claim, extra,
      health_score: `${s.health.total}/100`,
      emergency_months: s.health.monthsCovered.toFixed(1),
      savings_rate: `${Math.round(s.health.savingsRate * 100)}%`,
      safe_to_spend: inr(s.sts.safe),
      monthly_income: inr(s.profile.monthly_income),
      monthly_spend: inr(s.summary.spend),
    },
    fallback: () => ({
      why: `This came from your computed figures: ${s.health.monthsCovered.toFixed(1)} months of emergency cover and a ${Math.round(s.health.savingsRate * 100)}% savings rate this month.`,
      benefit: 'It moves the weakest part of your financial health first.',
      risk: 'Money directed here is unavailable for everything else this month.',
      alternatives: [{ label: 'Do half the amount', detail: 'Smaller steps still compound and are easier to sustain.' }, { label: 'Wait one month', detail: 'Delaying is a valid choice if this month is unusually tight.' }],
      basis: 'Computed by the built-in rules from your transactions and balances.',
      notAdvice: 'This is educational guidance, not regulated financial advice.',
    }),
  })

  const payload = { ...out.value, source: out.source, fallback: out.fallback, error: out.error }
  if (!out.fallback) writeCache(key, payload)
  res.json(payload)
})

app.post('/api/ai/lesson', async (req, res) => {
  const { term, where } = req.body
  const key = cacheKey('lesson', term, provider())
  const hit = readCache(key)
  if (hit) return res.json(hit)

  const s = snapshot()
  const out = await ask({
    task: 'lesson',
    provider: provider(),
    json: true,
    shared: 'The term you tapped, and the screen you were on. No transaction data.',
    instruction: `Teach "${term}" to someone in their first job in India who has never had it explained.

Return:
  "plain": what it is, under 40 words, no jargon, no analogy about pizzas
  "why": why it matters for someone earning their first salary, 1 sentence
  "example": a concrete example using round Indian rupee figures, 1-2 sentences
  "mistake": the most common first-timer mistake with this, 1 sentence
  "india": one thing specific to India — a tax rule, a regulator, a product name category, a typical rate. 1 sentence.
  "next": what to learn immediately after this, just the term name`,
    context: { term, screen: where, reader_stage: s.profile.stage, reader_city: s.profile.city },
    fallback: () => ({
      plain: `${term} is a core personal-finance concept. The built-in glossary has a short definition, but the full explanation needs the AI engine.`,
      why: 'Understanding it before acting is what separates a decision from a guess.',
      example: 'Example unavailable offline.', mistake: 'Acting on a product before understanding the mechanism.',
      india: 'Check the SEBI or RBI investor-education pages for the India-specific rules.', next: 'Emergency fund',
    }),
  })

  const payload = { term, ...out.value, source: out.source, fallback: out.fallback, error: out.error }
  if (!out.fallback) writeCache(key, payload)
  res.json(payload)
})

/* ------------------------------------------------------------------ AI: monthly review */

app.get('/api/ai/review', async (req, res) => {
  const m = req.query.month || fin.shiftMonth(month(), -1)
  const s = snapshot(m)
  const prev = fin.monthSummary(s.txns, fin.shiftMonth(m, -1))
  const key = cacheKey('review', m, s.summary.spend, provider())
  const hit = req.query.refresh !== '1' && readCache(key)
  if (hit) return res.json(hit)

  const out = await ask({
    task: 'review',
    provider: provider(),
    json: true,
    shared: 'Monthly totals and category totals for the month being reviewed. No individual transactions.',
    instruction: `Write this person's monthly money review. Conversational, the way a friend who is good with money would say it out loud. No headings, no bullet symbols in the prose.

Return:
  "story": 3 to 4 sentences. Open with what actually changed, not a greeting. Name the single biggest movement and what caused it.
  "won": one thing that genuinely went well, specific
  "slipped": one thing that got worse, stated without scolding
  "nextMonth": one concrete change for next month, with the rupee figure attached
  "streak": a short phrase describing any consistency worth naming, or null`,
    context: {
      month: m,
      money_in: inr(s.summary.income), money_out: inr(s.summary.spend), kept: inr(s.summary.net),
      previous_month_out: inr(prev.spend),
      categories: s.summary.categories.slice(0, 8).map((c) => `${c.category} ${inr(c.amount)} (${Math.round(c.share * 100)}%)`),
      biggest_movers: fin.categoryDelta(s.txns, m, fin.shiftMonth(m, -1)).filter((c) => Math.abs(c.delta) > 1500).slice(0, 4)
        .map((c) => `${c.category} ${c.delta > 0 ? 'up' : 'down'} ${inr(Math.abs(c.delta))}`),
      goals_progress: s.goals.map((g) => `${g.name} ${Math.round((g.saved / g.target) * 100)}%`),
    },
    fallback: () => ({
      story: `In ${m} you took in ${inr(s.summary.income)} and spent ${inr(s.summary.spend)}, keeping ${inr(s.summary.net)}. Your largest category was ${s.summary.categories[0]?.category ?? 'unclassified'} at ${inr(s.summary.categories[0]?.amount ?? 0)}.`,
      won: `You kept ${inr(s.summary.net)} of what you earned.`,
      slipped: `${s.summary.categories[0]?.category ?? 'Spending'} took ${Math.round((s.summary.categories[0]?.share ?? 0) * 100)}% of everything you spent.`,
      nextMonth: `Try holding ${s.summary.categories[0]?.category ?? 'your top category'} ${inr(Math.round((s.summary.categories[0]?.amount ?? 0) * 0.15))} lower.`,
      streak: null,
    }),
  })

  const payload = { month: m, summary: s.summary, ...out.value, source: out.source, fallback: out.fallback, error: out.error }
  if (!out.fallback) writeCache(key, payload)
  res.json(payload)
})

/* ------------------------------------------------------------------ AI: mentor chat (SSE) */

app.get('/api/chat', (req, res) => res.json(all('SELECT * FROM chat ORDER BY id')))
app.delete('/api/chat', (req, res) => { run('DELETE FROM chat'); res.json({ ok: true }) })

app.post('/api/ai/chat', async (req, res) => {
  const question = String(req.body.question || '').slice(0, 2000)
  const s = snapshot()

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

  run('INSERT INTO chat (ts, role, content) VALUES (?,?,?)', new Date().toISOString(), 'user', question)
  const history = all('SELECT role, content FROM chat ORDER BY id DESC LIMIT 8').reverse()

  send('meta', { provider: provider(), label: engine().label, model: engine().model, streams: !!engine().streams })

  try {
    const { text } = await askStream({
      task: 'chat',
      provider: provider(),
      shared: 'Your question, the last few turns of this conversation, and your computed monthly summary. No raw transaction list.',
      onChunk: (c) => send('chunk', c),
      instruction: `Answer the question at the end. You are talking, not writing a document.

Rules for this reply:
- Lead with the answer. No preamble, no restating the question.
- Under 180 words unless they explicitly asked for detail.
- Use their real computed figures wherever one applies.
- If the honest answer is "not yet, do X first", say that.
- If they ask you to pick a specific fund, stock or insurance policy, decline once in one sentence and give them the criteria to judge it themselves instead.
- Plain text. A short list is fine when there are genuinely 3+ parallel items; otherwise prose.`,
      context: {
        conversation_so_far: history.slice(0, -1).map((h) => `${h.role}: ${h.content}`),
        question,
        their_numbers: {
          name: s.profile.name, city: s.profile.city, stage: s.profile.stage,
          monthly_take_home: inr(s.profile.monthly_income),
          safe_to_spend_now: inr(s.sts.safe), days_left_in_month: s.sts.daysLeft,
          health: `${s.health.total}/100 (${s.health.band})`,
          emergency_months: s.health.monthsCovered.toFixed(1),
          savings_rate: `${Math.round(s.health.savingsRate * 100)}%`,
          spent_this_month: inr(s.summary.spend),
          top_categories: s.summary.categories.slice(0, 5).map((c) => `${c.category} ${inr(c.amount)}`),
          goals: s.goals.map((g) => { const p = fin.goalPlan(g, s.today); return `${g.name}: ${inr(g.saved)}/${inr(g.target)}, ${inr(p.monthly)}/mo needed` }),
          accounts: s.accounts.map((a) => `${a.name} ${inr(a.balance)}`),
        },
      },
    })
    run('INSERT INTO chat (ts, role, content) VALUES (?,?,?)', new Date().toISOString(), 'assistant', text)
    send('done', { text })
  } catch (e) {
    const msg = `I could not reach the ${engine().label} engine just now — ${e.message}. Your numbers on every other screen are computed locally and are still correct; only this conversation needs the engine.`
    run('INSERT INTO chat (ts, role, content) VALUES (?,?,?)', new Date().toISOString(), 'assistant', msg)
    send('error', { message: msg })
  }
  res.end()
})

/* ------------------------------------------------------------------ goals & profile */

app.post('/api/goals', (req, res) => {
  const { name, target, saved = 0, target_date, emoji = '🎯', kind = 'goal', priority = 5 } = req.body
  const id = `gl_${Date.now().toString(36)}`
  run('INSERT INTO goals (id,name,kind,target,saved,target_date,priority,emoji) VALUES (?,?,?,?,?,?,?,?)',
    id, name, kind, Math.round(+target), Math.round(+saved), target_date, +priority, emoji)
  logEvent('system', 'Goal created', `${name} — target ${inr(target)} by ${target_date}.`)
  res.json(one('SELECT * FROM goals WHERE id = ?', id))
})

app.patch('/api/goals/:id', (req, res) => {
  const g = one('SELECT * FROM goals WHERE id = ?', req.params.id)
  if (!g) return res.status(404).json({ error: 'not found' })
  const next = { ...g, ...req.body }
  run('UPDATE goals SET name=?, target=?, saved=?, target_date=?, priority=?, emoji=? WHERE id=?',
    next.name, Math.round(+next.target), Math.round(+next.saved), next.target_date, +next.priority, next.emoji, g.id)
  if (g.saved < g.target && next.saved >= next.target) logEvent('milestone', `${next.name} complete`, `Reached ${inr(next.target)}.`)
  res.json(one('SELECT * FROM goals WHERE id = ?', g.id))
})

app.delete('/api/goals/:id', (req, res) => { run('DELETE FROM goals WHERE id = ?', req.params.id); res.json({ ok: true }) })

app.patch('/api/profile', (req, res) => {
  const p = { ...one('SELECT * FROM profile WHERE id = 1'), ...req.body }
  run('UPDATE profile SET name=?, stage=?, city=?, monthly_income=?, pay_day=? WHERE id = 1',
    p.name, p.stage, p.city, Math.round(+p.monthly_income), +p.pay_day)
  res.json(one('SELECT * FROM profile WHERE id = 1'))
})

app.patch('/api/bills/:id', (req, res) => {
  run('UPDATE bills SET autopay = ? WHERE id = ?', req.body.autopay ? 1 : 0, req.params.id)
  res.json(one('SELECT * FROM bills WHERE id = ?', req.params.id))
})

/* ------------------------------------------------------------------ trust centre */

// Where the aggregated figures actually travel depends on the active provider,
// so the Trust Centre states it per provider rather than making one blanket claim.
const DATA_PATH = {
  'local-cli': (p) => `Aggregated figures are piped to the ${p.bin} CLI running as a subprocess on this machine. Whatever that CLI forwards to ${p.vendor} is governed by your own account with them, not by this app.`,
  'local-server': (p) => `Aggregated figures are sent to ${p.endpoint} — a model server on this machine or your own network — and answered by ${p.model}. They do not leave it.`,
  'cloud-api': (p) => `Aggregated figures are sent over HTTPS to ${p.endpoint} and answered by ${p.model}. The request is signed with the ${p.keyEnv} key from your .env file, which stays on this machine.`,
}
const dataPath = () => {
  const p = engine()
  return DATA_PATH[p?.transport]?.(p) || 'No inference provider is configured, so nothing is sent anywhere and every screen uses the built-in rules.'
}

const permissions = () => [
  { id: 'read_txn', label: 'Read transactions', granted: true, why: 'Needed to categorise spending and compute Safe-to-Spend.', revocable: true },
  { id: 'read_balance', label: 'Read account balances', granted: true, why: 'Needed for net worth and emergency-fund cover.', revocable: true },
  { id: 'initiate_payment', label: 'Move money', granted: false, why: 'PaisaPath is read-only. It can never initiate a payment.', revocable: false },
  { id: 'share_third_party', label: 'Share data with partners', granted: false, why: 'No data broker, lender or insurer receives your data.', revocable: false },
  { id: 'ai_processing', label: 'Send summaries to the AI engine', granted: true, why: dataPath(), revocable: true },
]

app.get('/api/trust', async (req, res) => {
  const log = all('SELECT * FROM ai_log ORDER BY id DESC LIMIT 60')
  const stats = one('SELECT COUNT(*) n, SUM(ok) ok, SUM(fallback) fb, AVG(ms) avg FROM ai_log') || {}
  res.json({
    provider: provider(),
    engine: publicView(engine()),
    providers: Object.values(PROVIDERS).map(publicView),
    permissions: permissions(),
    accounts: all('SELECT id,name,institution,kind,masked,synced_at FROM accounts'),
    log, stats,
    events: all('SELECT * FROM events ORDER BY id DESC LIMIT 30'),
    disclosures: {
      sponsored: 'There is no sponsored content, no affiliate link and no referral fee anywhere in this app. Nothing you are shown is paid placement.',
      revenue: 'This build has no revenue model. If one is ever added, it will be named here before it ships.',
      advice: 'PaisaPath is not a SEBI-registered investment adviser. It explains mechanisms and shows your own numbers. It does not recommend specific securities, funds or policies.',
      numbers: 'Every rupee figure in this app is computed on your device by server/finance.js. The AI engine receives already-computed figures and writes prose about them; it is never asked to produce a number.',
      engine: dataPath(),
      storage: 'All data lives in a single SQLite file on this machine (data/paisapath.db). Nothing is uploaded to a PaisaPath server, because there is no PaisaPath server. API keys, if you use a hosted provider, are read from .env and never stored in the database or sent to the browser.',
    },
  })
})

app.post('/api/reset', (req, res) => {
  seedIfEmpty({ force: true })
  db.exec('DELETE FROM chat; DELETE FROM cache; DELETE FROM ai_log; DELETE FROM nudge_dismissed;')
  res.json({ ok: true })
})

/* ------------------------------------------------------------------ static + boot */

// An unmatched /api path must stay JSON. Letting the SPA fallback swallow it
// means a typo'd endpoint returns 200 and a page of HTML, which is a miserable
// thing to debug.
app.use('/api', (req, res) => res.status(404).json({ error: `no such endpoint: ${req.method} /api${req.path}` }))

// The slide deck, presentable straight from the running project at
// /deck/paisapath-progress.html
app.use('/deck', express.static(join(root, 'presentation')))

const dist = join(root, 'dist')
if (existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/.*/, (req, res) => res.sendFile(join(dist, 'index.html')))
}

app.use((err, req, res, next) => {
  console.error('[paisapath]', err)
  res.status(500).json({ error: err.message })
})

const PORT = process.env.PORT || 8787
app.listen(PORT, () => {
  const p = engine()
  const detail = p.api === 'cli' ? `${p.label} CLI` : `${p.label}${p.model ? ` · ${p.model}` : ''}`
  console.log(`PaisaPath API on http://localhost:${PORT}  (AI engine: ${detail}${p.configured ? '' : ` — NOT configured: ${p.missing}`})`)
})
  .on('error', (e) => {
    // A stale server holding the port is otherwise invisible: the old process
    // keeps answering, so the app looks fine while serving code you just edited away.
    console.error(e.code === 'EADDRINUSE'
      ? `Port ${PORT} is already taken — something else is answering as PaisaPath.\n  lsof -ti :${PORT} | xargs kill`
      : e)
    process.exit(1)
  })
