// Deterministic money maths. No AI in this file — on purpose.
// Every rupee shown in the UI is produced here so it can be re-derived and audited.
// The AI layer is only ever allowed to *explain* these numbers, never to invent them.

export const CATEGORIES = [
  'Food & Dining', 'Groceries', 'Transport', 'Rent', 'Bills & Utilities',
  'Shopping', 'Subscriptions', 'Health', 'Education', 'Entertainment',
  'Family & Gifts', 'Investments', 'Savings', 'Income', 'Other',
]

// Buckets decide how a category behaves in Safe-to-Spend.
export const BUCKET = {
  'Rent': 'fixed', 'Bills & Utilities': 'fixed', 'Subscriptions': 'fixed',
  'Education': 'fixed', 'Health': 'fixed',
  'Investments': 'future', 'Savings': 'future',
  'Income': 'income',
}
export const bucketOf = (c) => BUCKET[c] || 'flexible'

export const ym = (d) => (typeof d === 'string' ? d : d.toISOString()).slice(0, 7)
export const daysInMonth = (m) => new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate()

/* ---------------------------------------------------------------- month summary */

export function monthSummary(txns, month) {
  const rows = txns.filter((t) => t.date.startsWith(month))
  const income = rows.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const spend = -rows.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0)

  const byCategory = {}
  for (const t of rows) {
    if (t.amount >= 0) continue
    const c = t.category || 'Uncategorised'
    byCategory[c] = (byCategory[c] || 0) + -t.amount
  }

  const nDays = daysInMonth(month)
  const byDay = Array.from({ length: nDays }, () => 0)
  for (const t of rows) if (t.amount < 0) byDay[+t.date.slice(8, 10) - 1] += -t.amount

  let running = 0
  const cumulative = byDay.map((v) => (running += v))

  const categories = Object.entries(byCategory)
    .map(([category, amount]) => ({ category, amount, bucket: bucketOf(category), share: spend ? amount / spend : 0 }))
    .sort((a, b) => b.amount - a.amount)

  return { month, income, spend, net: income - spend, categories, byDay, cumulative, count: rows.length }
}

export function categoryDelta(txns, month, prevMonth) {
  const a = monthSummary(txns, month), b = monthSummary(txns, prevMonth)
  const prev = Object.fromEntries(b.categories.map((c) => [c.category, c.amount]))
  return a.categories.map((c) => {
    const was = prev[c.category] || 0
    return { ...c, prev: was, delta: c.amount - was, pct: was ? (c.amount - was) / was : null }
  })
}

/* ---------------------------------------------------------------- safe to spend */

/**
 * Safe-to-Spend = what is left after this month's obligations and future-self
 * commitments, spread across the days still remaining. Deliberately conservative:
 * bills not yet paid are reserved in full.
 */
export function safeToSpend({ income, bills, goalContrib, txns, month, today }) {
  const s = monthSummary(txns, month)
  const day = +today.slice(8, 10)
  const nDays = daysInMonth(month)
  const daysLeft = Math.max(1, nDays - day + 1)

  const billsPaid = bills.filter((b) => b.due_day < day).reduce((x, b) => x + b.amount, 0)
  const billsDue = bills.reduce((x, b) => x + b.amount, 0) - billsPaid

  const futureSpent = s.categories.filter((c) => c.bucket === 'future').reduce((x, c) => x + c.amount, 0)
  const futureDue = Math.max(0, goalContrib - futureSpent)

  const flexSpent = s.categories.filter((c) => c.bucket === 'flexible').reduce((x, c) => x + c.amount, 0)
  const fixedSpent = s.categories.filter((c) => c.bucket === 'fixed').reduce((x, c) => x + c.amount, 0)

  const pool = income - fixedSpent - flexSpent - futureSpent - billsDue - futureDue
  const safe = Math.max(0, Math.round(pool))

  return {
    safe,
    perDay: Math.round(safe / daysLeft),
    daysLeft,
    income,
    spentSoFar: Math.round(fixedSpent + flexSpent + futureSpent),
    // the ledger the UI renders line by line — this IS the explanation
    ledger: [
      { label: 'Money in this month', amount: income, sign: '+' },
      { label: 'Bills already paid', amount: -Math.round(fixedSpent), sign: '−' },
      { label: 'Bills still due', amount: -billsDue, sign: '−' },
      { label: 'Moved to savings & investments', amount: -Math.round(futureSpent + futureDue), sign: '−' },
      { label: 'Everyday spending so far', amount: -Math.round(flexSpent), sign: '−' },
    ],
  }
}

/* ---------------------------------------------------------------- health score */

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))

/**
 * 0–100, five weighted pillars. Each pillar reports its own reason string so the
 * UI can show *why* without asking a model.
 */
export function healthScore({ income, txns, month, goals, bills, accounts }) {
  // Rate-based pillars read the last *complete* month. Judging a savings rate on
  // day 12 of an unfinished month flatters everyone and means nothing.
  const ref = monthSummary(txns, shiftMonth(month, -1))
  const s = ref.spend > 0 ? ref : monthSummary(txns, month)

  const monthlyNeed = Math.max(1, s.spend || income * 0.7)
  const emergency = goals.find((g) => g.kind === 'emergency')
  const liquid = accounts.filter((a) => a.kind === 'bank' || a.kind === 'savings').reduce((x, a) => x + a.balance, 0)

  const monthsCovered = (emergency?.saved ?? liquid) / monthlyNeed
  const savingsRate = income ? clamp((s.income - s.spend) / s.income, -1, 1) : 0
  const flexShare = s.spend ? s.categories.filter((c) => c.bucket === 'flexible').reduce((x, c) => x + c.amount, 0) / s.spend : 0
  const invested = accounts.filter((a) => a.kind === 'invest').reduce((x, a) => x + a.balance, 0)
  // sqrt curves: going 0 → 1 month of buffer is a bigger real change than 5 → 6,
  // and a linear bar tells a first earner their genuine progress counts for nothing.
  const investRatio = income ? Math.sqrt(clamp(invested / (income * 3))) : 0
  const autopay = bills.length ? bills.filter((b) => b.autopay).length / bills.length : 0

  const pillars = [
    {
      key: 'emergency', label: 'Emergency fund', weight: 30,
      score: Math.sqrt(clamp(monthsCovered / 6)),
      detail: `${monthsCovered.toFixed(1)} months of expenses covered`,
      reason: monthsCovered < 3
        ? 'Under 3 months. This is the single biggest thing to fix before investing more.'
        : monthsCovered < 6 ? 'Solid. Push toward 6 months and then stop — more than that just loses to inflation.'
        : 'Fully funded. Anything above this belongs in investments.',
    },
    {
      key: 'savings', label: 'Savings rate', weight: 25,
      score: clamp(savingsRate / 0.25),
      detail: `${Math.round(savingsRate * 100)}% of income kept in ${s.month}`,
      reason: savingsRate < 0.1 ? 'Below 10%. Small, automatic transfers on payday move this faster than willpower.'
        : savingsRate < 0.2 ? 'Reasonable for a first job. 20% is the next step.'
        : 'Strong. You are ahead of most people at your stage.',
    },
    {
      key: 'spending', label: 'Spending control', weight: 20,
      score: clamp((0.55 - flexShare) / 0.3),
      detail: `${Math.round(flexShare * 100)}% of spending is discretionary`,
      reason: flexShare > 0.5 ? 'Half your spending is optional — that is also where the easiest wins are.'
        : 'Discretionary spending is in a healthy band.',
    },
    {
      key: 'investing', label: 'Investing', weight: 15,
      score: investRatio,
      detail: invested ? `₹${invested.toLocaleString('en-IN')} invested` : 'Not investing yet',
      reason: monthsCovered < 3
        ? 'Intentionally scored low priority right now — emergency fund comes first.'
        : 'Regular monthly investing beats timing the market. Consistency is the whole trick.',
    },
    {
      key: 'bills', label: 'Bill discipline', weight: 10,
      score: autopay,
      detail: `${bills.filter((b) => b.autopay).length} of ${bills.length} bills on autopay`,
      reason: autopay < 1 ? 'Autopay removes late fees and one decision a month.' : 'Every bill automated. Nothing to do here.',
    },
  ]

  const total = Math.round(pillars.reduce((x, p) => x + p.score * p.weight, 0))
  const band = total >= 80 ? 'Strong' : total >= 60 ? 'Steady' : total >= 40 ? 'Building' : 'Fragile'
  return { total, band, pillars, monthsCovered, savingsRate }
}

/* ---------------------------------------------------------------- goals */

export function goalPlan(goal, today = new Date().toISOString().slice(0, 10)) {
  const remaining = Math.max(0, goal.target - goal.saved)
  const months = Math.max(1, monthsBetween(today, goal.target_date))
  const monthly = Math.ceil(remaining / months / 100) * 100
  return {
    remaining, months, monthly,
    pct: goal.target ? clamp(goal.saved / goal.target) : 0,
    perDay: Math.ceil(monthly / 30),
    done: goal.saved >= goal.target,
  }
}

export function monthsBetween(a, b) {
  const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number)
  return (by - ay) * 12 + (bm - am)
}

/** Priority order for spare money. This is the app's actual opinion, stated in code. */
export function fundingOrder({ health, goals, accounts, income }) {
  const steps = []
  const emergency = goals.find((g) => g.kind === 'emergency')
  const cover = health.monthsCovered

  if (cover < 1) steps.push({ rank: 1, action: 'Build one month of expenses in a separate savings account', why: 'One month of buffer is the difference between an unexpected bill and a credit card balance.', amount: emergency ? Math.max(0, income * 0.7 - emergency.saved) : income })
  else if (cover < 3) steps.push({ rank: 1, action: 'Grow the emergency fund to 3 months', why: `You have ${cover.toFixed(1)} months. Three months covers a job gap without touching investments.`, amount: Math.round(income * 0.7 * 3 - (emergency?.saved || 0)) })
  else if (cover < 6) steps.push({ rank: 1, action: 'Top up the emergency fund toward 6 months, while investing', why: 'Past 3 months you can safely do both at once.', amount: Math.round(income * 0.7 * 6 - (emergency?.saved || 0)) })
  else steps.push({ rank: 1, action: 'Emergency fund is done — redirect it to investing', why: 'Beyond 6 months, cash loses to inflation.', amount: 0 })

  const hasInvest = accounts.some((a) => a.kind === 'invest' && a.balance > 0)
  steps.push({
    rank: 2,
    action: hasInvest ? 'Keep the monthly SIP running' : 'Start a small monthly SIP in an index fund',
    why: hasInvest ? 'Skipped months, not small amounts, are what break long-term compounding.' : 'Starting at ₹1,000 a month beats waiting until you can afford ₹10,000.',
    amount: Math.round(income * 0.1),
  })

  const nearest = goals.filter((g) => g.kind === 'goal').map((g) => ({ g, p: goalPlan(g) })).sort((a, b) => a.p.months - b.p.months)[0]
  if (nearest) steps.push({ rank: 3, action: `Set aside ₹${nearest.p.monthly.toLocaleString('en-IN')} a month for ${nearest.g.name}`, why: `That is what the goal needs to land on time — ${nearest.p.months} months out.`, amount: nearest.p.monthly })

  return steps
}

/* ---------------------------------------------------------------- budget */

const TEMPLATES = {
  student: [
    ['Food & Dining', 0.22, 'flexible'], ['Groceries', 0.08, 'flexible'], ['Transport', 0.10, 'flexible'],
    ['Bills & Utilities', 0.08, 'fixed'], ['Education', 0.10, 'fixed'], ['Entertainment', 0.08, 'flexible'],
    ['Shopping', 0.09, 'flexible'], ['Subscriptions', 0.03, 'fixed'], ['Savings', 0.17, 'future'],
    ['Investments', 0.05, 'future'],
  ],
  professional: [
    ['Rent', 0.28, 'fixed'], ['Food & Dining', 0.12, 'flexible'], ['Groceries', 0.07, 'flexible'],
    ['Transport', 0.06, 'flexible'], ['Bills & Utilities', 0.06, 'fixed'], ['Subscriptions', 0.02, 'fixed'],
    ['Health', 0.03, 'fixed'], ['Shopping', 0.07, 'flexible'], ['Entertainment', 0.04, 'flexible'],
    ['Family & Gifts', 0.05, 'flexible'], ['Savings', 0.10, 'future'], ['Investments', 0.10, 'future'],
  ],
}

/**
 * Rule-based budget. Starts from a life-stage template, then bends it toward
 * what the person actually spent over the last 3 months so the first budget
 * they see is not a fantasy.
 */
export function generateBudget({ stage, income, txns, month }) {
  const tpl = TEMPLATES[stage] || TEMPLATES.professional
  const hist = {}
  for (let i = 1; i <= 3; i++) {
    const m = shiftMonth(month, -i)
    for (const c of monthSummary(txns, m).categories) (hist[c.category] ||= []).push(c.amount)
  }
  const avg = (a) => (a?.length ? a.reduce((x, y) => x + y, 0) / a.length : null)

  const rows = tpl.map(([category, share, bucket]) => {
    const target = income * share
    const actual = avg(hist[category])
    // blend 60/40 toward reality, but never budget below 70% of the template for savings
    const blended = actual == null ? target : bucket === 'future' ? Math.max(target * 0.7, target * 0.6 + actual * 0.4) : target * 0.6 + actual * 0.4
    return {
      category, bucket,
      amount: Math.round(blended / 100) * 100,
      basis: actual == null ? 'stage template' : `your ${Math.round(actual).toLocaleString('en-IN')}/mo average, nudged toward the target`,
    }
  })

  return fitToIncome(rows, income)
}

/**
 * Make the plan add up. Trims discretionary lines first, then savings, never the
 * fixed ones — you cannot negotiate rent by editing a spreadsheet. Rounding each
 * line to ₹100 can push the total back over, so the residual is shaved explicitly
 * at the end; a budget that quietly exceeds income is worse than no budget.
 */
function fitToIncome(rows, income) {
  const sum = () => rows.reduce((x, r) => x + r.amount, 0)

  for (const bucket of ['flexible', 'future']) {
    const over = sum() - income
    if (over <= 0) break
    const group = rows.filter((r) => r.bucket === bucket)
    const groupTotal = group.reduce((x, r) => x + r.amount, 0)
    if (groupTotal <= 0) continue
    const take = Math.min(over, groupTotal * 0.6)   // never gut a whole bucket at once
    for (const r of group) r.amount = Math.max(0, Math.round((r.amount - take * (r.amount / groupTotal)) / 100) * 100)
  }

  const residual = sum() - income
  if (residual > 0) {
    const shave = rows.filter((r) => r.bucket !== 'fixed').sort((a, b) => b.amount - a.amount)[0]
    if (shave) shave.amount = Math.max(0, shave.amount - residual)
  }
  return rows
}

/* ---------------------------------------------------------------- salary split

   Onboarding has no transaction history to learn from, so this is the only place
   in the app that starts from a rule of thumb rather than from the person's own
   behaviour. Every number it produces is a *starting position* the user then drags.
*/

export const SPLIT_BUCKETS = [
  { key: 'essentials', label: 'Essentials', note: 'Rent, bills, groceries, transport — the things that arrive whether you plan for them or not.' },
  { key: 'emergency', label: 'Emergency fund', note: 'Cash you do not touch. This is what stops one bad month becoming a bad year.' },
  { key: 'investments', label: 'Investments', note: 'Money with a job that is more than five years away.' },
  { key: 'savings', label: 'Short-term savings', note: 'Named goals inside two years — a trip, a laptop, a course.' },
  { key: 'discretionary', label: 'Yours to spend', note: 'Guilt-free. A plan with no room for this is a plan you will abandon.' },
]

/**
 * Recommended first split of a salary.
 *
 * Deliberately not 50-30-20. That rule assumes an emergency fund already exists;
 * for someone in month one it does not, so the future share is front-loaded into
 * emergency until roughly six months of cover, then rotates toward investments.
 */
export function salarySplit({ income, stage = 'professional', rent = null, emergencyMonths = 0 }) {
  const essentialShare = stage === 'student' ? 0.45 : 0.5
  // A known rent beats a template every time.
  const essentials = rent != null ? Math.min(income * 0.75, rent + income * (stage === 'student' ? 0.18 : 0.2)) : income * essentialShare
  const discretionary = income * (stage === 'student' ? 0.25 : 0.2)
  const future = Math.max(0, income - essentials - discretionary)

  // Under 6 months of cover, emergency takes the lion's share of whatever is left.
  const urgency = clamp((6 - emergencyMonths) / 6)
  const emergency = future * (0.25 + 0.5 * urgency)
  const investments = future * (0.55 - 0.35 * urgency)
  const savings = Math.max(0, future - emergency - investments)

  const r = (n) => Math.round(n / 100) * 100
  const rows = [
    { key: 'essentials', amount: r(essentials) },
    { key: 'emergency', amount: r(emergency) },
    { key: 'investments', amount: r(investments) },
    { key: 'savings', amount: r(savings) },
    { key: 'discretionary', amount: r(discretionary) },
  ]
  // rounding can drift a few hundred either way; absorb it in discretionary
  const drift = rows.reduce((x, b) => x + b.amount, 0) - income
  const disc = rows.find((b) => b.key === 'discretionary')
  disc.amount = Math.max(0, disc.amount - drift)

  return rows.map((b) => ({ ...b, ...SPLIT_BUCKETS.find((d) => d.key === b.key), share: b.amount / Math.max(1, income) }))
}

/** Turn an approved split into the budget-category rows the Budget screen renders. */
export function splitToBudget(split, stage) {
  const get = (k) => split.find((b) => b.key === k)?.amount || 0
  const tpl = TEMPLATES[stage] || TEMPLATES.professional
  const essentials = get('essentials'), disc = get('discretionary')

  // Groceries and transport are essentials in life even though they are flexible
  // in the Safe-to-Spend sense, so they draw from the essentials pot, not the fun one.
  const isEssential = ([c, , b]) => b === 'fixed' || c === 'Groceries' || c === 'Transport'
  const essentialCats = tpl.filter(isEssential)
  const discCats = tpl.filter((t) => !isEssential(t) && t[2] === 'flexible')
  const weight = (rows) => rows.reduce((x, [, s]) => x + s, 0) || 1

  const spread = (cats, pot, basis) =>
    cats.map(([c, s, b]) => ({ category: c, bucket: b, amount: Math.round((pot * s) / weight(cats) / 100) * 100, basis }))

  return [
    ...spread(essentialCats, essentials, 'your essentials share'),
    ...spread(discCats, disc, 'your spending share'),
    { category: 'Savings', bucket: 'future', amount: get('emergency') + get('savings'), basis: 'your emergency fund and goals' },
    { category: 'Investments', bucket: 'future', amount: get('investments'), basis: 'your investing share' },
  ].filter((r) => r.amount > 0)
}

export function shiftMonth(m, by) {
  const d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + by, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/* ---------------------------------------------------------------- simulator */

/**
 * 24-month projection for a what-if. Pure arithmetic — an 11% nominal equity
 * return and a 6.5% savings return, both stated in the UI so the assumption
 * is never hidden behind a chart.
 */
export const ASSUMPTIONS = { equityReturn: 0.11, savingsReturn: 0.065, inflation: 0.05, horizonMonths: 24 }

export function simulate({ kind, amount, emi, months: emiMonths = 12, monthlySip = 0, delayMonths = 0, monthly = false }, state) {
  const { income, monthlySave, monthlyInvest, savingsBalance, investBalance, monthlyExpense } = state
  const N = ASSUMPTIONS.horizonMonths
  const rS = ASSUMPTIONS.savingsReturn / 12
  const rE = ASSUMPTIONS.equityReturn / 12

  const walk = (mut) => {
    let cash = savingsBalance, inv = investBalance
    const out = []
    for (let m = 0; m < N; m++) {
      let addCash = monthlySave, addInv = monthlyInvest, oneOff = 0
      mut?.(m, (d) => { addCash += d.cash ?? 0; addInv += d.inv ?? 0; oneOff += d.spend ?? 0 })
      cash = cash * (1 + rS) + addCash - oneOff
      inv = inv * (1 + rE) + addInv
      out.push({ m, cash: Math.round(cash), inv: Math.round(inv), net: Math.round(cash + inv) })
    }
    return out
  }

  const base = walk()
  let after, alt = null, labels = null, headline, mechanics

  if (kind === 'purchase') {
    after = walk((m, add) => { if (m === 0) add({ spend: amount }) })
    const monthsOfBuffer = (savingsBalance - amount) / Math.max(1, monthlyExpense)
    headline = `Buying this now leaves ${monthsOfBuffer.toFixed(1)} months of expenses in cash.`
    mechanics = [`₹${amount.toLocaleString('en-IN')} leaves savings immediately`, `24-month net worth ends ₹${(base.at(-1).net - after.at(-1).net).toLocaleString('en-IN')} lower than not buying`]
  } else if (kind === 'emi') {
    after = walk((m, add) => { if (m < emiMonths) add({ cash: -emi }) })
    const strain = emi / income
    headline = `An EMI of ₹${emi.toLocaleString('en-IN')} takes ${Math.round(strain * 100)}% of your monthly income for ${emiMonths} months.`
    mechanics = [`Total paid over the term: ₹${(emi * emiMonths).toLocaleString('en-IN')}`, strain > 0.2 ? 'Above the 20%-of-income line where EMIs start crowding out savings' : 'Within the 20%-of-income comfort line']
  } else if (kind === 'invest') {
    after = walk((m, add) => { if (m >= delayMonths) add({ inv: monthlySip, cash: -monthlySip }) })
    const delayed = walk((m, add) => { if (m >= delayMonths + 6) add({ inv: monthlySip, cash: -monthlySip }) })
    headline = `Starting now instead of six months later ends ₹${(after.at(-1).net - delayed.at(-1).net).toLocaleString('en-IN')} ahead in two years.`
    mechanics = [`₹${monthlySip.toLocaleString('en-IN')}/month at ${Math.round(ASSUMPTIONS.equityReturn * 100)}% assumed nominal return`, 'The gap keeps widening — this is the cost of waiting, not the cost of the amount']
  } else if (kind === 'swap') {
    // "Invest X instead of spending it" — a genuine A-vs-B, so it needs a third
    // line. The other kinds compare do-it against don't-do-it; this compares two
    // things you might actually do, which is the shape most real decisions have.
    const spendIt = (m, add) => (monthly ? add({ spend: amount }) : m === 0 && add({ spend: amount }))
    const investIt = (m, add) => (monthly ? add({ inv: amount, cash: -amount }) : m === 0 && add({ inv: amount, cash: -amount }))

    alt = walk((m, add) => { if (m < (monthly ? emiMonths : 1)) spendIt(m, add) })
    after = walk((m, add) => { if (m < (monthly ? emiMonths : 1)) investIt(m, add) })

    const gap = after.at(-1).net - alt.at(-1).net
    headline = monthly
      ? `Investing ₹${amount.toLocaleString('en-IN')} a month instead of spending it ends ₹${gap.toLocaleString('en-IN')} ahead in two years.`
      : `Investing this ₹${amount.toLocaleString('en-IN')} instead of spending it ends ₹${gap.toLocaleString('en-IN')} ahead in two years.`
    mechanics = [
      `Spending it: net worth reaches ₹${alt.at(-1).net.toLocaleString('en-IN')} in 24 months`,
      `Investing it: ₹${after.at(-1).net.toLocaleString('en-IN')}, at an assumed ${Math.round(ASSUMPTIONS.equityReturn * 100)}% nominal return`,
      'The gap is the whole decision. Whether it is worth it depends on what the spending was for — the chart cannot tell you that.',
    ]
    labels = ['If you spend it', 'If you invest it']
  } else {
    after = walk((m, add) => { if (m < emiMonths) add({ cash: amount / emiMonths, inv: 0 }) })
    headline = 'Projection updated.'
    mechanics = []
  }

  return { base, after, alt, labels, headline, mechanics, assumptions: ASSUMPTIONS }
}

/* ---------------------------------------------------------------- nudges

   Context-aware nudges, computed not generated. Three rules keep this from
   becoming the notification spam every finance app degenerates into:

     1. A nudge must name the evidence that triggered it. No vague encouragement.
     2. A nudge must be dismissible, and stay dismissed (stable ids, not indexes).
     3. A nudge fires on a *change*, not on a standing condition. "You have no
        emergency fund" is a dashboard fact; "your salary landed and none of it
        has moved yet" is a nudge.
*/

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

export function nudges({ profile, txns, bills, goals, accounts, budget = [], month, today, health, sts }) {
  const out = []
  const day = +today.slice(8, 10)
  const nDays = daysInMonth(month)
  const s = monthSummary(txns, month)
  const income = profile.monthly_income
  const push = (n) => out.push({ severity: 'watch', ...n })

  /* --- salary landed, nothing moved yet ------------------------------------ */
  const salary = txns.filter((t) => t.amount > income * 0.5 && t.date <= today)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0]
  if (salary) {
    const since = daysBetween(salary.date, today)
    const movedAfter = txns.some((t) => t.date >= salary.date && t.amount < 0 && bucketOf(t.category) === 'future')
    if (since <= 5 && !movedAfter) {
      const target = Math.round((income * 0.2) / 100) * 100
      push({
        id: `payday:${salary.date}`, kind: 'payday', severity: 'act',
        title: 'Your salary landed. Move the savings before the month does.',
        body: `${inrs(target)} out today is the single highest-leverage thing you can do this month. Money that leaves on payday is never missed; money left to the end of the month never survives.`,
        evidence: `${inrs(salary.amount)} credited ${since === 0 ? 'today' : `${since} day${since > 1 ? 's' : ''} ago`}, and nothing has moved to savings or investments since.`,
        cta: { label: 'Open goals', route: 'goals' },
      })
    }
  }

  /* --- a category is running hot versus the same point last month ---------- */
  const prev = monthSummary(txns.filter((t) => +t.date.slice(8, 10) <= day), shiftMonth(month, -1))
  const prevBy = Object.fromEntries(prev.categories.map((c) => [c.category, c.amount]))
  for (const c of s.categories) {
    if (c.bucket !== 'flexible') continue
    const was = prevBy[c.category] || 0
    const delta = c.amount - was
    if (was < 500 || delta < 800 || delta / was < 0.25) continue
    push({
      id: `spike:${month}:${c.category}`, kind: 'spike',
      title: `${c.category} is ${Math.round((delta / was) * 100)}% ahead of last month`,
      body: `Same ${day} days, ${inrs(delta)} more. Not a verdict — some months are just like that. Worth a look while there is still month left to steer.`,
      evidence: `${inrs(c.amount)} so far, against ${inrs(was)} by day ${day} of ${monthLabel(shiftMonth(month, -1))}.`,
      cta: { label: 'See the transactions', route: 'spending' },
    })
  }

  /* --- manual bill about to fall due -------------------------------------- */
  for (const b of bills.filter((x) => !x.autopay && x.due_day >= day && x.due_day - day <= 3)) {
    push({
      id: `bill:${month}:${b.id}`, kind: 'bill', severity: 'act',
      title: `${b.name} is due ${b.due_day === day ? 'today' : `in ${b.due_day - day} days`}`,
      body: 'This one is still manual, so it needs you. Putting it on autopay removes both the late fee and one decision a month.',
      evidence: `${inrs(b.amount)}, due on the ${b.due_day}, autopay off.`,
      cta: { label: 'Turn on autopay', route: 'money' },
    })
  }

  /* --- subscriptions creeping up ------------------------------------------ */
  const subs = txns.filter((t) => t.date.startsWith(month) && t.category === 'Subscriptions')
  const subTotal = -subs.reduce((x, t) => x + t.amount, 0)
  if (subTotal > income * 0.04) {
    push({
      id: `subs:${month}`, kind: 'subscriptions',
      title: 'Subscriptions are quietly taking a real share',
      body: `${inrs(subTotal)} a month is ${inrs(subTotal * 12)} a year. Nothing here is wrong, but subscriptions are the one category that grows without anyone deciding it should.`,
      evidence: `${subs.length} charges this month: ${[...new Set(subs.map((t) => t.merchant))].slice(0, 4).join(', ')}.`,
      cta: { label: 'Review them', route: 'money' },
    })
  }

  /* --- burning the month faster than the month is passing ------------------ */
  if (sts && day >= 5) {
    const flexSpent = s.categories.filter((c) => c.bucket === 'flexible').reduce((x, c) => x + c.amount, 0)
    const pace = flexSpent / Math.max(1, day)
    const projected = pace * nDays
    const room = flexSpent + sts.safe
    if (projected > room * 1.15) {
      push({
        id: `burn:${month}:${Math.round(projected / 1000)}`, kind: 'burn', severity: 'act',
        title: 'At this pace the month runs out before the days do',
        body: `You are spending about ${inrs(pace)} a day on everyday things. Holding to ${inrs(sts.perDay)} a day from here keeps the month whole.`,
        evidence: `${inrs(flexSpent)} in ${day} days projects to ${inrs(projected)} by the ${nDays}th, against ${inrs(room)} of room.`,
      })
    }
  }

  /* --- a raise, which is the moment SIPs should move ----------------------- */
  const avgIncome = [1, 2, 3].map((i) => monthSummary(txns, shiftMonth(month, -i)).income).filter(Boolean)
  if (avgIncome.length >= 2) {
    const base = avgIncome.reduce((x, y) => x + y, 0) / avgIncome.length
    if (s.income > base * 1.05) {
      const extra = s.income - base
      push({
        id: `raise:${month}`, kind: 'raise', severity: 'good',
        title: 'Your income went up. This is the cheapest time to save more.',
        body: `Raising your monthly investment by ${inrs(Math.round(extra * 0.5 / 100) * 100)} now costs you nothing you are used to, because you have not started spending it yet.`,
        evidence: `${inrs(s.income)} this month against a ${inrs(base)} average over the last ${avgIncome.length} months.`,
        cta: { label: 'Model it', route: 'simulate' },
      })
    }
  }

  /* --- investing while the buffer is thin ---------------------------------- */
  const investedThisMonth = s.categories.find((c) => c.category === 'Investments')?.amount || 0
  if (health && health.monthsCovered < 3 && investedThisMonth > 0) {
    push({
      id: `order:${month}`, kind: 'priority',
      title: 'You are investing before the buffer is built',
      body: 'Not wrong, just early. Until three months of expenses sit in cash, a bad month forces you to sell investments at whatever price the market happens to offer that week.',
      evidence: `${health.monthsCovered.toFixed(1)} months of cover, while ${inrs(investedThisMonth)} went into investments this month.`,
      cta: { label: 'See the funding order', route: 'goals' },
    })
  }

  /* --- the same charge twice ------------------------------------------------ */
  const seen = new Map()
  for (const t of txns.filter((x) => x.date.startsWith(month) && x.amount < 0)) {
    const key = `${t.merchant}|${t.amount}`
    const first = seen.get(key)
    if (first && Math.abs(daysBetween(first.date, t.date)) <= 3) {
      push({
        id: `dupe:${t.id}`, kind: 'charge', severity: 'act',
        title: `${t.merchant} charged you the same amount twice`,
        body: 'Could be legitimate. Could be a double charge, a failed retry, or a subscription billing on two cards. Worth thirty seconds of checking.',
        evidence: `${inrs(-t.amount)} on ${first.date.slice(8)} and again on ${t.date.slice(8)} ${monthLabel(month)}.`,
        cta: { label: 'Open transactions', route: 'spending' },
      })
    } else seen.set(key, t)
  }

  /* --- a budget line already breached, with month left to go --------------- */
  if (day <= 22) {
    for (const b of budget.filter((x) => x.bucket === 'flexible')) {
      const spent = s.categories.find((c) => c.category === b.category)?.amount || 0
      if (spent <= b.amount) continue
      push({
        id: `budget:${month}:${b.category}`, kind: 'budget',
        title: `${b.category} is past its line with ${nDays - day} days left`,
        body: 'A budget line is a signal, not a rule. Either the spending moves or the line does — both are legitimate, but pick one on purpose.',
        evidence: `${inrs(spent)} spent against a ${inrs(b.amount)} plan.`,
        cta: { label: 'Adjust the budget', route: 'budget' },
      })
    }
  }

  const rank = { act: 0, watch: 1, good: 2 }
  return out.sort((a, b) => rank[a.severity] - rank[b.severity])
}

const inrs = (n) => `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthLabel = (m) => MONTH_LABELS[+m.slice(5, 7) - 1]

/* ---------------------------------------------------------------- categorise */

const RULES = [
  [/swiggy|zomato|dominos|eatsure|blinkit cafe|starbucks|chai|cafe|restaurant|biryani/i, 'Food & Dining'],
  [/bigbasket|dmart|zepto|blinkit|instamart|reliance fresh|grocer|kirana/i, 'Groceries'],
  [/uber|ola|rapido|namma yatri|metro|irctc|petrol|indian oil|hp petrol|bpcl|fastag/i, 'Transport'],
  [/rent|landlord|nobroker|housing/i, 'Rent'],
  [/electricity|bescom|tneb|airtel|jio|vodafone|broadband|act fibernet|gas|water bill/i, 'Bills & Utilities'],
  [/amazon|flipkart|myntra|ajio|nykaa|croma|decathlon|ikea|meesho/i, 'Shopping'],
  [/netflix|spotify|prime|hotstar|youtube premium|icloud|google one|gym|cult\.fit|notion|figma/i, 'Subscriptions'],
  [/apollo|pharmeasy|1mg|practo|hospital|clinic|dental|insurance/i, 'Health'],
  [/udemy|coursera|byju|unacademy|book|college|tuition|exam fee/i, 'Education'],
  [/bookmyshow|pvr|inox|steam|playstation|concert/i, 'Entertainment'],
  [/gift|wedding|temple|donation|mom|dad|family/i, 'Family & Gifts'],
  [/zerodha|groww|kuvera|coin|sip|mutual fund|nps|ppf|elss/i, 'Investments'],
  [/salary|stipend|freelance|payout|refund|interest credit/i, 'Income'],
  [/rd |recurring deposit|savings transfer|fd /i, 'Savings'],
]

/** Deterministic fallback used when the AI is unavailable, and as a pre-pass so
 *  the model only ever sees the merchants that rules genuinely could not place. */
export function ruleCategorise(merchant, amount) {
  for (const [re, cat] of RULES) if (re.test(merchant)) return cat
  return amount > 0 ? 'Income' : null
}
