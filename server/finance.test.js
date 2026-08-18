// Self-check for the money maths. Run: node server/finance.test.js
// No framework on purpose — this is a handful of asserts over pure functions.
import assert from 'node:assert/strict'
import * as f from './finance.js'

const txns = [
  { date: '2026-07-01', amount: 60000, category: 'Income' },
  { date: '2026-07-03', amount: -17000, category: 'Rent' },
  { date: '2026-07-05', amount: -5000, category: 'Investments' },
  { date: '2026-07-08', amount: -3000, category: 'Food & Dining' },
  { date: '2026-07-12', amount: -2000, category: 'Transport' },
  { date: '2026-06-01', amount: 60000, category: 'Income' },
  { date: '2026-06-03', amount: -17000, category: 'Rent' },
  { date: '2026-06-09', amount: -9000, category: 'Food & Dining' },
]
const bills = [
  { name: 'Rent', amount: 17000, due_day: 3, autopay: 0 },
  { name: 'Gym', amount: 2000, due_day: 25, autopay: 1 },
]
const goals = [
  { id: 'e', kind: 'emergency', name: 'Emergency', target: 180000, saved: 60000, target_date: '2027-07' },
  { id: 'p', kind: 'goal', name: 'Phone', target: 40000, saved: 10000, target_date: '2026-12' },
]
const accounts = [
  { kind: 'savings', balance: 60000 }, { kind: 'bank', balance: 20000 },
  { kind: 'invest', balance: 30000 }, { kind: 'card', balance: -5000 },
]

/* --- month summary ------------------------------------------------------- */
const s = f.monthSummary(txns, '2026-07')
assert.equal(s.income, 60000)
assert.equal(s.spend, 27000)
assert.equal(s.net, 33000)
assert.equal(s.categories[0].category, 'Rent')
assert.equal(s.cumulative.at(-1), 27000, 'cumulative must end at total spend')
assert.equal(s.byDay.length, 31)

/* --- buckets ------------------------------------------------------------- */
assert.equal(f.bucketOf('Rent'), 'fixed')
assert.equal(f.bucketOf('Investments'), 'future')
assert.equal(f.bucketOf('Food & Dining'), 'flexible')

/* --- safe to spend ------------------------------------------------------- */
const sts = f.safeToSpend({ income: 60000, bills, goalContrib: 9000, txns, month: '2026-07', today: '2026-07-18' })
// 60000 in − 17000 fixed − 5000 flexible − 5000 future − 2000 bill still due − 4000 future still due
assert.equal(sts.safe, 27000)
assert.equal(sts.daysLeft, 14)
assert.equal(sts.perDay, Math.round(27000 / 14))
assert.ok(sts.safe >= 0, 'safe-to-spend can never go negative')
assert.equal(
  sts.ledger.reduce((x, l) => x + l.amount, 0), sts.safe,
  'the shown ledger must add up to the shown number — this is the whole trust claim',
)

// an unaffordable month must floor at zero rather than show a negative
const broke = f.safeToSpend({ income: 10000, bills, goalContrib: 9000, txns, month: '2026-07', today: '2026-07-18' })
assert.equal(broke.safe, 0)

/* --- health score -------------------------------------------------------- */
const h = f.healthScore({ income: 60000, txns, month: '2026-07', goals, bills, accounts })
assert.ok(h.total >= 0 && h.total <= 100, `score out of range: ${h.total}`)
assert.equal(h.pillars.reduce((x, p) => x + p.weight, 0), 100, 'pillar weights must total 100')
assert.equal(h.pillars.length, 5)
assert.ok(h.pillars.every((p) => p.score >= 0 && p.score <= 1))
assert.ok(h.pillars.every((p) => p.reason && p.detail))
// rate pillars must read June (complete), not the half-finished July
assert.ok(h.pillars.find((p) => p.key === 'savings').detail.includes('2026-06'))

/* --- goals --------------------------------------------------------------- */
const plan = f.goalPlan(goals[1], '2026-07-18')
assert.equal(plan.remaining, 30000)
assert.equal(plan.months, 5)
assert.equal(plan.monthly, 6000)
assert.equal(f.goalPlan({ target: 100, saved: 500, target_date: '2026-12' }, '2026-07-18').remaining, 0)
// a goal already past its date must not divide by zero
assert.ok(f.goalPlan({ target: 1000, saved: 0, target_date: '2026-01' }, '2026-07-18').monthly > 0)

/* --- funding order ------------------------------------------------------- */
const order = f.fundingOrder({ health: h, goals, accounts, income: 60000 })
assert.ok(order.length >= 2)
assert.deepEqual(order.map((o) => o.rank), order.map((o) => o.rank).sort((a, b) => a - b))
assert.ok(order[0].action.toLowerCase().includes('emergency'), 'under 3 months cover, emergency fund must rank first')

/* --- budget -------------------------------------------------------------- */
const b = f.generateBudget({ stage: 'professional', income: 60000, txns, month: '2026-07' })
assert.ok(b.length > 5)
assert.ok(b.reduce((x, r) => x + r.amount, 0) <= 60000 + 1, 'budget must not exceed income')
assert.ok(b.every((r) => r.amount >= 0 && r.basis))
assert.ok(b.some((r) => r.bucket === 'future'), 'savings must always be a line, never a leftover')

/* --- simulator ----------------------------------------------------------- */
const state = { income: 60000, monthlySave: 6000, monthlyInvest: 5000, savingsBalance: 60000, investBalance: 30000, monthlyExpense: 40000 }
const buy = f.simulate({ kind: 'purchase', amount: 45000 }, state)
assert.equal(buy.base.length, 24)
assert.ok(buy.after.at(-1).net < buy.base.at(-1).net, 'spending 45k must end poorer than not spending it')
const emi = f.simulate({ kind: 'emi', emi: 4200, months: 24 }, state)
assert.ok(emi.after.at(-1).net < emi.base.at(-1).net)
const sip = f.simulate({ kind: 'invest', monthlySip: 5000, delayMonths: 0 }, state)
assert.ok(sip.headline.includes('₹'))
assert.ok(buy.base.every((p) => Number.isFinite(p.net)), 'projection must never produce NaN')

/* --- swap (A vs B) ------------------------------------------------------- */
const swap = f.simulate({ kind: 'swap', amount: 5000, monthly: false }, state)
assert.ok(swap.alt, 'a swap must produce a third line — spend, invest and neither')
assert.equal(swap.labels.length, 2)
assert.ok(swap.after.at(-1).net > swap.alt.at(-1).net, 'investing must end ahead of spending the same rupees')
assert.ok(swap.headline.includes('₹'))
const swapMonthly = f.simulate({ kind: 'swap', amount: 5000, monthly: true, months: 12 }, state)
assert.ok(swapMonthly.after.at(-1).net - swapMonthly.alt.at(-1).net >
          swap.after.at(-1).net - swap.alt.at(-1).net, 'a monthly swap must open a wider gap than a one-off')
assert.equal(f.simulate({ kind: 'purchase', amount: 1000 }, state).alt, null, 'do/dont scenarios have no third line')

/* --- salary split -------------------------------------------------------- */
const split = f.salarySplit({ income: 60000, stage: 'professional', emergencyMonths: 0 })
assert.equal(split.length, 5)
assert.equal(split.reduce((x, b) => x + b.amount, 0), 60000, 'the split must spend the whole salary, exactly')
assert.ok(split.every((b) => b.amount >= 0 && b.label && b.note))
const em = (s) => s.find((b) => b.key === 'emergency').amount
const inv = (s) => s.find((b) => b.key === 'investments').amount
assert.ok(em(split) > inv(split), 'with no buffer, emergency must outrank investing')
const funded = f.salarySplit({ income: 60000, stage: 'professional', emergencyMonths: 6 })
assert.ok(inv(funded) > em(funded), 'once the buffer is full, investing must take over')
// a known rent must beat the template
const highRent = f.salarySplit({ income: 60000, stage: 'professional', rent: 30000 })
assert.ok(highRent.find((b) => b.key === 'essentials').amount > split.find((b) => b.key === 'essentials').amount)

const bud = f.splitToBudget(split, 'professional')
assert.ok(bud.length > 4)
assert.ok(bud.some((r) => r.category === 'Savings' && r.bucket === 'future'))
assert.ok(Math.abs(bud.reduce((x, r) => x + r.amount, 0) - 60000) < 1500, 'budget from a split should land near the salary')

/* --- nudges -------------------------------------------------------------- */
const nudgeState = {
  profile: { monthly_income: 60000 },
  txns: [
    { id: 't1', date: '2026-07-16', merchant: 'Salary', amount: 60000, category: 'Income' },
    { id: 't2', date: '2026-07-17', merchant: 'Swiggy', amount: -4000, category: 'Food & Dining' },
    { id: 't3', date: '2026-07-15', merchant: 'Croma', amount: -2500, category: 'Shopping' },
    { id: 't4', date: '2026-07-16', merchant: 'Croma', amount: -2500, category: 'Shopping' },
    { id: 't5', date: '2026-06-10', merchant: 'Swiggy', amount: -900, category: 'Food & Dining' },
  ],
  bills: [{ id: 'b1', name: 'Rent', amount: 17000, due_day: 19, autopay: 0 }],
  goals: [], accounts: [], budget: [],
  month: '2026-07', today: '2026-07-18',
  health: { monthsCovered: 1.1 },
  sts: { safe: 5000, perDay: 350 },
}
const n = f.nudges(nudgeState)
const kinds = n.map((x) => x.kind)
assert.ok(kinds.includes('payday'), 'salary in, nothing moved to savings → payday nudge')
assert.ok(kinds.includes('bill'), 'manual bill due in 1 day → bill nudge')
assert.ok(kinds.includes('spike'), 'food up 4x on the same day count → spike nudge')
assert.ok(kinds.includes('charge'), 'same merchant, same amount, one day apart → duplicate-charge nudge')
assert.ok(n.every((x) => x.id && x.title && x.body && x.evidence), 'every nudge must carry its own evidence')
assert.ok(new Set(n.map((x) => x.id)).size === n.length, 'nudge ids must be unique — they key dismissal')
assert.equal(n[0].severity, 'act', 'actionable nudges must sort first')

// a nudge fires on change, not on a standing condition
const quiet = f.nudges({
  ...nudgeState,
  txns: [
    { id: 'q1', date: '2026-07-01', merchant: 'Salary', amount: 60000, category: 'Income' },
    { id: 'q2', date: '2026-07-02', merchant: 'RD', amount: -9000, category: 'Savings' },
  ],
  bills: [{ id: 'b1', name: 'Rent', amount: 17000, due_day: 3, autopay: 1 }],
})
assert.ok(!quiet.map((x) => x.kind).includes('payday'), 'savings already moved → no payday nudge')
assert.ok(!quiet.map((x) => x.kind).includes('bill'), 'autopay bill already past → no bill nudge')

// ids must be stable across calls, or dismissal cannot stick
assert.deepEqual(f.nudges(nudgeState).map((x) => x.id), n.map((x) => x.id))

/* --- categoriser --------------------------------------------------------- */
assert.equal(f.ruleCategorise('Swiggy order', -300), 'Food & Dining')
assert.equal(f.ruleCategorise('ZEPTO MARKETPLACE', -800), 'Groceries')
assert.equal(f.ruleCategorise('Groww SIP', -5000), 'Investments')
assert.equal(f.ruleCategorise('Nexcorp Salary', 60000), 'Income')
assert.equal(f.ruleCategorise('RAZ*ORPGWAY LTD', -1899), null, 'gateway noise must stay unclassified for the AI pass')

/* --- date helpers -------------------------------------------------------- */
assert.equal(f.shiftMonth('2026-01', -1), '2025-12')
assert.equal(f.shiftMonth('2026-12', 1), '2027-01')
assert.equal(f.daysInMonth('2024-02'), 29)
assert.equal(f.daysInMonth('2026-02'), 28)
assert.equal(f.monthsBetween('2026-07-18', '2027-03'), 8)

console.log('finance.js — all checks pass')
