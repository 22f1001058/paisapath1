// Self-check for the questionnaire scoring and the profile classifier.
//   node server/profile.test.js
//
// A classification shown to someone as a fact about themselves has to be
// reproducible, so every profile gets a worked example that must land on it.
import assert from 'node:assert/strict'
import * as p from './profile.js'

/* --- question set is internally consistent -------------------------------- */

const ids = p.QUESTIONS.map((q) => q.id)
assert.equal(new Set(ids).size, ids.length, 'question ids must be unique')
assert.ok(p.QUESTIONS.length >= 15 && p.QUESTIONS.length <= 22, `expected 15–22 questions, got ${p.QUESTIONS.length}`)
for (const q of p.QUESTIONS) {
  assert.ok(q.label && q.section && q.type, `question ${q.id} is missing a field`)
  assert.ok(p.SECTIONS.some((s) => s.key === q.section), `${q.id} points at an unknown section`)
  if (q.type === 'choice') {
    assert.ok(q.options?.length >= 2, `${q.id} needs options`)
    assert.equal(new Set(q.options.map((o) => o.value)).size, q.options.length, `${q.id} has duplicate option values`)
  }
}

const awareness = p.QUESTIONS.filter((q) => q.options?.some((o) => o.correct))
assert.equal(awareness.length, 6, 'six scored knowledge questions')
for (const q of awareness) {
  assert.equal(q.options.filter((o) => o.correct).length, 1, `${q.id} must have exactly one correct answer`)
  assert.ok(q.options.some((o) => o.value === 'unsure'), `${q.id} must offer "Not sure"`)
  assert.ok(!q.options.find((o) => o.value === 'unsure').correct, '"Not sure" is never the correct answer')
  assert.ok(q.teaches, `${q.id} must name the concept it maps to`)
}

/* --- age ------------------------------------------------------------------ */
assert.equal(p.ageFrom(null), null)
assert.equal(p.ageFrom('1800-01-01'), null, 'absurd ages are rejected rather than returned')
const y = new Date().getFullYear()
assert.ok(Math.abs(p.ageFrom(`${y - 24}-01-01`) - 24) <= 1)

/* --- helpers -------------------------------------------------------------- */

const ALL_CORRECT = { q_compound: 'b', q_inflation: 'b', q_index: 'b', q_credit: 'b', q_term: 'b', q_emergency: 'b' }
const ALL_UNSURE = Object.fromEntries(awareness.map((q) => [q.id, 'unsure']))

const base = {
  name: 'Test', dob: `${y - 25}-06-01`, city: 'Pune', stage: 'firstjob',
  dependents: 'none', stability: 'high', billHabit: 'never',
  income: 60000, rent: 15000, emi: 0, savedNow: 200000, savesMonthly: 12000,
  drawdown: 'hold', horizon: '3to7', tradeoff: 'mixed', runway: '3to6m',
  ...ALL_CORRECT,
}
const who = (over) => p.assess({ ...base, ...over }).profile.key

/* --- every profile is reachable ------------------------------------------- */

assert.equal(who({ rent: 30000, emi: 12000 }), 'stretched', 'fixed costs over 60% of income')
assert.equal(who({ emi: 25000, rent: 2000 }), 'stretched', 'EMI alone over 35% of income')

assert.equal(who({ savedNow: 20000, drawdown: 'buy', horizon: 'gt7', tradeoff: 'risky', runway: 'lt1m' }),
  'exposed', 'high appetite on a thin buffer')

assert.equal(who({ savedNow: 60000, drawdown: 'sell', horizon: 'lt1', tradeoff: 'safe', runway: '1to3m' }),
  'foundation', 'thin buffer without the appetite is a different problem')

assert.equal(who({ drawdown: 'sell', horizon: 'lt1', tradeoff: 'safe', runway: 'gt6m' }),
  'cautious', 'good buffer, no appetite')

assert.equal(who({ savedNow: 400000, drawdown: 'buy', horizon: 'gt7', tradeoff: 'risky', runway: 'gt6m' }),
  'confident', 'capacity, appetite and awareness all clear the bar')

assert.equal(who({ ...ALL_UNSURE, savedNow: 400000, drawdown: 'buy', horizon: 'gt7', tradeoff: 'risky', runway: 'gt6m' }),
  'steady', 'the same person without the knowledge is not "confident"')

assert.equal(new Set(Object.keys(p.PROFILES)).size, 6, 'six profiles')
for (const prof of Object.values(p.PROFILES)) {
  assert.ok(prof.name && prof.tagline && prof.meaning && prof.watch && prof.exit, `${prof.key} is missing copy`)
  assert.ok(prof.first?.length >= 2, `${prof.key} needs concrete first steps`)
}

/* --- the ordering matters and must not drift ------------------------------ */
// Stretched outranks everything: no amount of appetite fixes a cash-flow problem.
assert.equal(who({ rent: 40000, drawdown: 'buy', horizon: 'gt7', tradeoff: 'risky', savedNow: 500000 }), 'stretched')
// Exposed is checked before foundation — same thin buffer, opposite advice.
assert.equal(who({ savedNow: 20000, drawdown: 'buy', horizon: 'gt7', tradeoff: 'risky' }), 'exposed')
assert.equal(who({ savedNow: 20000, drawdown: 'sell', horizon: 'lt1', tradeoff: 'safe' }), 'foundation')

/* --- scores --------------------------------------------------------------- */

const s = p.scoreAnswers(base)
for (const k of ['capacity', 'appetite', 'awareness']) {
  assert.ok(s[k] >= 0 && s[k] <= 100, `${k} out of range: ${s[k]}`)
  assert.ok(Number.isFinite(s[k]))
}
assert.equal(p.scoreAnswers({ ...base, ...ALL_CORRECT }).awareness, 100)
assert.equal(p.scoreAnswers({ ...base, ...ALL_UNSURE }).awareness, 0)
assert.equal(p.scoreAnswers({ ...base, ...ALL_UNSURE }).unsureCount, 6)
assert.deepEqual(p.scoreAnswers({ ...base, ...ALL_UNSURE }).gaps.length, 6, 'every missed question becomes a lesson')
assert.deepEqual(p.scoreAnswers(base).gaps, [], 'nothing to teach someone who got them all')

// more cash must never lower capacity; more caution must never raise appetite
assert.ok(p.scoreAnswers({ ...base, savedNow: 500000 }).capacity > p.scoreAnswers({ ...base, savedNow: 10000 }).capacity)
assert.ok(p.scoreAnswers({ ...base, drawdown: 'buy' }).appetite > p.scoreAnswers({ ...base, drawdown: 'sell' }).appetite)
assert.ok(p.scoreAnswers({ ...base, emi: 20000 }).capacity < p.scoreAnswers({ ...base, emi: 0 }).capacity)

// an empty questionnaire must not explode or produce NaN
const empty = p.assess({})
assert.ok(Number.isFinite(empty.scores.capacity) && Number.isFinite(empty.health.total))
assert.ok(empty.profile.key, 'even a blank form classifies to something')

/* --- self-reported health ------------------------------------------------- */

const h = p.assess(base).health
assert.equal(h.pillars.reduce((x, q) => x + q.weight, 0), 100, 'pillar weights must total 100, same as the measured score')
assert.equal(h.pillars.length, 5, 'same five pillars as finance.js, so the dashboard renders one component')
assert.ok(h.total >= 0 && h.total <= 100)
assert.equal(h.basis, 'self-reported', 'the dashboard must be able to label this honestly')
assert.ok(h.pillars.every((q) => q.detail && q.reason && q.score >= 0 && q.score <= 1))
assert.ok(p.assess({ ...base, savedNow: 500000 }).health.total > p.assess({ ...base, savedNow: 0 }).health.total)

/* --- determinism ---------------------------------------------------------- */
assert.deepEqual(p.assess(base), p.assess(base), 'same answers must always give the same profile')

console.log('profile.js — all checks pass')
