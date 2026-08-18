// Demo data: Ananya, 23, first job in Bengaluru, four months of history.
// Deterministic (seeded PRNG) so the app looks identical on every machine —
// which matters when the same screen has to be shown twice in a review.

import { db, run, one, logEvent } from './db.js'
import { ruleCategorise, shiftMonth, daysInMonth } from './finance.js'

let s = 20260729
const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296)
const pick = (a) => a[Math.floor(rnd() * a.length)]
const jitter = (n, pct = 0.25) => Math.round(n * (1 - pct + rnd() * pct * 2))

export const TODAY = '2026-07-18'
const MONTHS = ['2026-04', '2026-05', '2026-06', '2026-07']

const ACCOUNTS = [
  { id: 'ac_hdfc', name: 'Salary account', institution: 'HDFC Bank', kind: 'bank', balance: 48200, masked: '••4471' },
  { id: 'ac_sav', name: 'Emergency savings', institution: 'HDFC Bank', kind: 'savings', balance: 62000, masked: '••9013' },
  { id: 'ac_upi', name: 'UPI wallet', institution: 'PhonePe', kind: 'upi', balance: 1450, masked: 'ananya@ybl' },
  { id: 'ac_card', name: 'Credit card', institution: 'Axis Bank', kind: 'card', balance: -14300, masked: '••2288' },
  { id: 'ac_inv', name: 'Mutual funds', institution: 'Groww', kind: 'invest', balance: 31500, masked: '••MF' },
]

const BILLS = [
  { id: 'bl_rent', name: 'Rent — Indiranagar PG', amount: 17000, due_day: 3, autopay: 0, category: 'Rent' },
  { id: 'bl_phone', name: 'Airtel postpaid', amount: 599, due_day: 8, autopay: 1, category: 'Bills & Utilities' },
  { id: 'bl_net', name: 'ACT Fibernet', amount: 899, due_day: 10, autopay: 1, category: 'Bills & Utilities' },
  { id: 'bl_elec', name: 'BESCOM electricity', amount: 1240, due_day: 14, autopay: 0, category: 'Bills & Utilities' },
  { id: 'bl_sub1', name: 'Spotify', amount: 119, due_day: 6, autopay: 1, category: 'Subscriptions' },
  { id: 'bl_sub2', name: 'Netflix', amount: 649, due_day: 17, autopay: 1, category: 'Subscriptions' },
  { id: 'bl_gym', name: 'Cult.fit', amount: 1800, due_day: 21, autopay: 0, category: 'Subscriptions' },
  { id: 'bl_ins', name: 'Health insurance', amount: 1050, due_day: 25, autopay: 1, category: 'Health' },
]

const GOALS = [
  { id: 'gl_emg', name: 'Emergency fund', kind: 'emergency', target: 186000, saved: 62000, target_date: '2027-06', priority: 1, emoji: '🛟' },
  { id: 'gl_phone', name: 'New phone', kind: 'goal', target: 45000, saved: 11000, target_date: '2026-12', priority: 3, emoji: '📱' },
  { id: 'gl_trip', name: 'Ladakh trip', kind: 'goal', target: 60000, saved: 8500, target_date: '2027-03', priority: 4, emoji: '🏔️' },
  { id: 'gl_pg', name: 'Higher studies fund', kind: 'goal', target: 400000, saved: 24000, target_date: '2029-06', priority: 2, emoji: '🎓' },
]

const MERCHANTS = {
  'Food & Dining': [['Swiggy', 260, 620], ['Zomato', 240, 540], ['Third Wave Coffee', 180, 380], ['Meghana Foods', 420, 780], ['Chai Point', 60, 140], ['Rameshwaram Cafe', 120, 260]],
  Groceries: [['Zepto', 280, 760], ['BigBasket', 900, 2200], ['Blinkit', 200, 640], ['More Supermarket', 500, 1400]],
  Transport: [['Uber', 90, 340], ['Rapido', 45, 130], ['Namma Metro', 30, 60], ['Indian Oil', 400, 900], ['Ola', 110, 380]],
  Shopping: [['Myntra', 800, 3200], ['Amazon', 350, 2600], ['Decathlon', 900, 2400], ['Nykaa', 400, 1500], ['Croma', 1500, 6000]],
  Entertainment: [['BookMyShow', 300, 900], ['PVR Cinemas', 400, 850], ['Steam', 500, 1600]],
  'Family & Gifts': [['Gift for Amma', 1200, 3500], ['Wedding gift', 2100, 5100]],
  Health: [['Apollo Pharmacy', 180, 700], ['Practo consult', 500, 900]],
  Education: [['Coursera', 1500, 3900], ['Kindle books', 250, 700]],
}

const COUNTS = {
  'Food & Dining': 16, Groceries: 6, Transport: 14, Shopping: 2,
  Entertainment: 2, 'Family & Gifts': 1, Health: 1, Education: 1,
}

function seedTxns() {
  const rows = []
  const push = (date, merchant, amount, method, account_id, category) =>
    rows.push({ id: `tx_${rows.length}_${date}`, date, merchant, amount, method, account_id, category: category ?? ruleCategorise(merchant, amount), source: 'seed', note: null })

  for (const [mi, m] of MONTHS.entries()) {
    const nd = daysInMonth(m)
    const last = m === TODAY.slice(0, 7) ? +TODAY.slice(8, 10) : nd
    const d = (day) => `${m}-${String(Math.min(day, last)).padStart(2, '0')}`

    // salary lands on the 1st; small raise from June
    push(d(1), 'Nexcorp Technologies — Salary', mi >= 2 ? 64500 : 62000, 'NEFT', 'ac_hdfc', 'Income')
    if (mi === 3) push(d(12), 'Freelance — poster design', 6000, 'UPI', 'ac_hdfc', 'Income')

    for (const b of BILLS) {
      if (b.due_day > last) continue
      push(d(b.due_day), b.name, -jitter(b.amount, b.category === 'Bills & Utilities' ? 0.18 : 0.02),
        b.autopay ? 'Autopay' : 'UPI', b.autopay ? 'ac_hdfc' : 'ac_upi', b.category)
    }

    // recurring savings + SIP, skipped in July to create something to notice
    if (mi < 3) {
      push(d(2), 'Recurring deposit — HDFC', -6000, 'Standing instruction', 'ac_sav', 'Savings')
      push(d(5), 'Groww — SIP index fund', -5000, 'Autopay', 'ac_inv', 'Investments')
    } else {
      push(d(2), 'Recurring deposit — HDFC', -3000, 'Standing instruction', 'ac_sav', 'Savings')
    }

    for (const [cat, n] of Object.entries(COUNTS)) {
      // July: food delivery spikes, groceries drop — the story the app should catch
      // July is only half-elapsed, so scale everything to the day count, then let
      // food delivery overshoot anyway — that is the pattern the app should catch.
      const scale = mi === 3 ? last / nd : 1
      const count = Math.max(1, Math.round(n * scale) + (mi === 3 && cat === 'Food & Dining' ? 7 : 0) - (mi === 3 && cat === 'Groceries' ? 2 : 0))
      for (let i = 0; i < count; i++) {
        const [name, lo, hi] = pick(MERCHANTS[cat])
        const day = 1 + Math.floor(rnd() * last)
        push(d(day), name, -Math.round(lo + rnd() * (hi - lo)), pick(['UPI', 'UPI', 'UPI', 'Card']), pick(['ac_hdfc', 'ac_upi', 'ac_card']), cat)
      }
    }

    // a few genuinely ambiguous merchants left uncategorised for the AI pass to earn its keep
    if (mi === 3) {
      push(d(4), 'PAYTM*QSR 8829', -410, 'UPI', 'ac_upi', null)
      push(d(9), 'RAZ*ORPGWAY LTD', -1899, 'Card', 'ac_card', null)
      push(d(12), 'UPI/MOHAMMED S/9876', -250, 'UPI', 'ac_upi', null)
      push(d(15), 'BBPS BILLDESK 40219', -1240, 'UPI', 'ac_hdfc', null)
      push(d(17), 'SQ *STUDIO 91', -2400, 'Card', 'ac_card', null)
    }
  }
  return rows.sort((a, b) => (a.date < b.date ? 1 : -1))
}

export function seedIfEmpty({ force = false } = {}) {
  if (!force && one('SELECT COUNT(*) AS n FROM txns').n > 0) return false

  db.exec('DELETE FROM txns; DELETE FROM accounts; DELETE FROM bills; DELETE FROM goals; DELETE FROM budget; DELETE FROM profile; DELETE FROM events;')

  // onboarded=1: this demo profile has four months of history, so putting it
  // through the first-salary journey would be nonsense. Reach it at #/start.
  //
  // The answers are what Ananya would have given in April, and are deliberately
  // consistent with the transactions below — so the dashboard shows her
  // questionnaire profile next to a *measured* health score rather than a
  // self-reported one, which is the pairing the design is actually about.
  run(
    'INSERT INTO profile (id, name, stage, city, monthly_income, pay_day, dependents, risk, started_at, onboarded, answers, profile_key) VALUES (1,?,?,?,?,?,?,?,?,1,?,?)',
    'Ananya', 'professional', 'Bengaluru', 64500, 1, 0, 'balanced', '2026-04-01',
    JSON.stringify({
      name: 'Ananya', dob: '2003-02-14', city: 'Bengaluru', stage: 'firstjob',
      dependents: 'partial', income: 64500, rent: 17000, emi: 0,
      savedNow: 62000, savesMonthly: 9000, stability: 'high', billHabit: 'rare',
      drawdown: 'freeze', horizon: '3to7', tradeoff: 'mixed', runway: '1to3m',
      q_compound: 'b', q_inflation: 'b', q_index: 'unsure',
      q_credit: 'b', q_term: 'unsure', q_emergency: 'b',
    }),
    'foundation',
  )

  for (const a of ACCOUNTS)
    run('INSERT INTO accounts (id,name,institution,kind,balance,synced_at,masked) VALUES (?,?,?,?,?,?,?)',
      a.id, a.name, a.institution, a.kind, a.balance, `${TODAY}T09:12:00Z`, a.masked)

  for (const b of BILLS)
    run('INSERT INTO bills (id,name,amount,due_day,autopay,category) VALUES (?,?,?,?,?,?)',
      b.id, b.name, b.amount, b.due_day, b.autopay, b.category)

  for (const g of GOALS)
    run('INSERT INTO goals (id,name,kind,target,saved,target_date,priority,emoji) VALUES (?,?,?,?,?,?,?,?)',
      g.id, g.name, g.kind, g.target, g.saved, g.target_date, g.priority, g.emoji)

  const ins = db.prepare('INSERT INTO txns (id,date,merchant,amount,category,method,account_id,source,note) VALUES (?,?,?,?,?,?,?,?,?)')
  for (const t of seedTxns()) ins.run(t.id, t.date, t.merchant, t.amount, t.category, t.method, t.account_id, t.source, t.note)

  logEvent('milestone', 'First ₹50,000 saved', 'Crossed ₹50,000 in the emergency fund in May 2026.')
  logEvent('milestone', 'First investment made', 'Started a ₹5,000 monthly SIP in April 2026.')
  logEvent('milestone', 'Three months of tracked spending', 'Every transaction since April is categorised.')
  logEvent('system', 'Accounts connected', '5 accounts linked in read-only mode.')
  return true
}

export { MONTHS, shiftMonth }
