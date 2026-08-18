// The onboarding questionnaire, its scoring, and the profile classifier.
//
// One file owns the questions, the maths and the profile definitions, and the
// client renders whatever /api/onboard/questions hands it. That keeps the wording
// and the scoring in the same place — a question whose options drift out of sync
// with the points that read them is the classic way this kind of thing rots.
//
// No AI in this file, for the same reason as finance.js: a classification a person
// is shown as a fact about themselves has to be reproducible and inspectable.

/* ================================================================== questions */

const YEARS = new Date().getFullYear()

export const QUESTIONS = [
  /* --- who you are ------------------------------------------------------- */
  { id: 'name', section: 'You', type: 'text', label: 'What should we call you?', placeholder: 'First name is fine', required: true },
  {
    id: 'dob', section: 'You', type: 'date', label: 'Date of birth', required: true,
    help: 'Age sets your investing horizon — it is the one input you cannot change and the most powerful one you have.',
    max: `${YEARS - 15}-12-31`, min: `${YEARS - 80}-01-01`,
  },
  { id: 'city', section: 'You', type: 'text', label: 'Which city do you live in?', placeholder: 'Bengaluru, Pune, Kochi…', required: true },
  {
    id: 'stage', section: 'You', type: 'choice', label: 'What best describes you right now?', required: true,
    options: [
      { value: 'student', label: 'Studying — allowance or stipend' },
      { value: 'firstjob', label: 'First job, under two years in' },
      { value: 'professional', label: 'Working, more than two years in' },
      { value: 'freelance', label: 'Freelancing or self-employed' },
    ],
  },
  {
    id: 'dependents', section: 'You', type: 'choice', label: 'Does anyone depend on your income?', required: true,
    help: 'This changes how large a buffer you need, and how much risk is reasonable.',
    options: [
      { value: 'none', label: 'No one but me', points: 15 },
      { value: 'partial', label: 'I contribute at home, but I am not the main earner', points: 9 },
      { value: 'full', label: 'People rely on me', points: 3 },
    ],
  },

  /* --- your money -------------------------------------------------------- */
  {
    id: 'income', section: 'Money', type: 'number', label: 'Monthly take-home (₹)', required: true, prefix: '₹',
    help: 'Not CTC. The number that actually lands, after tax and PF.', placeholder: '45000',
  },
  { id: 'rent', section: 'Money', type: 'number', label: 'Rent or housing cost each month (₹)', prefix: '₹', placeholder: '0 if you live with family' },
  {
    id: 'emi', section: 'Money', type: 'number', label: 'Loan and EMI payments each month (₹)', prefix: '₹',
    help: 'Education loan, phone, bike, credit-card instalments — everything with a fixed monthly repayment.', placeholder: '0',
  },
  {
    id: 'savedNow', section: 'Money', type: 'number', label: 'Money you could reach today (₹)', prefix: '₹',
    help: 'Bank balance plus savings. Not your PF, not your investments — cash you could actually use this week.', placeholder: '0',
  },
  { id: 'savesMonthly', section: 'Money', type: 'number', label: 'Roughly how much do you save or invest each month? (₹)', prefix: '₹', placeholder: '0' },
  {
    id: 'stability', section: 'Money', type: 'choice', label: 'How predictable is your income?', required: true,
    options: [
      { value: 'high', label: 'Same amount, same date, every month', points: 15 },
      { value: 'medium', label: 'Mostly steady, some variable pay', points: 10 },
      { value: 'low', label: 'It swings a lot month to month', points: 4 },
    ],
  },
  {
    id: 'billHabit', section: 'Money', type: 'choice', label: 'How often does a bill slip past its due date?', required: true,
    options: [
      { value: 'never', label: 'Never — most are automated', points: 10 },
      { value: 'rare', label: 'Once or twice a year', points: 7 },
      { value: 'sometimes', label: 'Most months something is late', points: 3 },
      { value: 'often', label: 'I lose track of what is due', points: 0 },
    ],
  },

  /* --- risk -------------------------------------------------------------- */
  {
    id: 'drawdown', section: 'Risk', type: 'choice', required: true,
    label: 'You invest ₹50,000. Three months later it is worth ₹38,000. What do you actually do?',
    help: 'Answer with what you would really do, not what sounds disciplined.',
    options: [
      { value: 'sell', label: 'Sell — I would not sleep through that', points: 0 },
      { value: 'freeze', label: 'Stop adding money, but leave what is there', points: 8 },
      { value: 'hold', label: 'Nothing. It is a long-term plan', points: 18 },
      { value: 'buy', label: 'Add more while it is cheaper', points: 25 },
      { value: 'unsure', label: 'Honestly, I do not know', points: 5 },
    ],
  },
  {
    id: 'horizon', section: 'Risk', type: 'choice', required: true,
    label: 'How long could you leave money invested without needing it back?',
    options: [
      { value: 'lt1', label: 'Under a year', points: 0 },
      { value: '1to3', label: 'One to three years', points: 8 },
      { value: '3to7', label: 'Three to seven years', points: 18 },
      { value: 'gt7', label: 'More than seven years', points: 25 },
    ],
  },
  {
    id: 'tradeoff', section: 'Risk', type: 'choice', required: true,
    label: 'Two options for the same money over ten years. Which do you pick?',
    options: [
      { value: 'safe', label: 'A guaranteed 6% a year', points: 4 },
      { value: 'mixed', label: 'Likely 9%, but some years are negative', points: 16 },
      { value: 'risky', label: 'Likely 12%, with a year that could drop 30%', points: 25 },
    ],
  },
  {
    id: 'runway', section: 'Risk', type: 'choice', required: true,
    label: 'If your income stopped tomorrow, how long could you cover your expenses?',
    options: [
      { value: 'lt1m', label: 'Less than a month', points: 0 },
      { value: '1to3m', label: 'One to three months', points: 8 },
      { value: '3to6m', label: 'Three to six months', points: 16 },
      { value: 'gt6m', label: 'More than six months', points: 22 },
    ],
  },

  /* --- awareness (objective, scored) -------------------------------------
     "Not sure" is always offered and never penalised beyond scoring zero. A
     questionnaire that punishes honesty gets guesses, and a guess tells us
     nothing about what this person needs taught.                            */
  {
    id: 'q_compound', section: 'Awareness', type: 'choice', required: true, teaches: 'Compounding',
    label: '₹10,000 grows at 8% a year, compounded. Roughly what is it worth after two years?',
    options: [
      { value: 'a', label: 'About ₹11,600' },
      { value: 'b', label: 'About ₹11,664', correct: true },
      { value: 'c', label: 'About ₹10,800' },
      { value: 'unsure', label: 'Not sure' },
    ],
  },
  {
    id: 'q_inflation', section: 'Awareness', type: 'choice', required: true, teaches: 'Nominal vs real returns',
    label: 'Inflation runs at 6% and your savings account pays 3.5%. Over a year, your money…',
    options: [
      { value: 'a', label: 'Grows — it earned interest' },
      { value: 'b', label: 'Buys less than it did before', correct: true },
      { value: 'c', label: 'Is worth exactly the same' },
      { value: 'unsure', label: 'Not sure' },
    ],
  },
  {
    id: 'q_index', section: 'Awareness', type: 'choice', required: true, teaches: 'Index fund',
    label: 'What does an index fund actually do?',
    options: [
      { value: 'a', label: 'A manager picks the shares they expect to win' },
      { value: 'b', label: 'It holds a whole market in proportion, at low cost', correct: true },
      { value: 'c', label: 'It guarantees a fixed return each year' },
      { value: 'unsure', label: 'Not sure' },
    ],
  },
  {
    id: 'q_credit', section: 'Awareness', type: 'choice', required: true, teaches: 'Minimum amount due',
    label: 'You pay only the "minimum amount due" on your credit card. What happens?',
    options: [
      { value: 'a', label: 'Nothing — the account is current, no interest' },
      { value: 'b', label: 'The rest carries interest, typically 36–42% a year', correct: true },
      { value: 'c', label: 'A flat late fee, and that is all' },
      { value: 'unsure', label: 'Not sure' },
    ],
  },
  {
    id: 'q_term', section: 'Awareness', type: 'choice', required: true, teaches: 'Term insurance',
    label: 'Which is true of a term insurance policy?',
    options: [
      { value: 'a', label: 'It returns your premiums at the end' },
      { value: 'b', label: 'It pays out only on death, and is the cheapest way to buy cover', correct: true },
      { value: 'c', label: 'It works as an investment as well as cover' },
      { value: 'unsure', label: 'Not sure' },
    ],
  },
  {
    id: 'q_emergency', section: 'Awareness', type: 'choice', required: true, teaches: 'Emergency fund',
    label: 'Where should an emergency fund actually sit?',
    options: [
      { value: 'a', label: 'In equity mutual funds, so it grows' },
      { value: 'b', label: 'A separate savings account or liquid fund', correct: true },
      { value: 'c', label: 'A five-year fixed deposit at the best rate' },
      { value: 'unsure', label: 'Not sure' },
    ],
  },
]

export const SECTIONS = [
  { key: 'You', title: 'About you', blurb: 'Five quick things so the advice is about you, not an average.' },
  { key: 'Money', title: 'Your money', blurb: 'Rough numbers are fine. Nothing here is checked against anything.' },
  { key: 'Risk', title: 'How you handle risk', blurb: 'There are no right answers in this section — only useful ones.' },
  { key: 'Awareness', title: 'What you already know', blurb: 'Six questions with real answers. "Not sure" costs you nothing and tells us what to explain.' },
]

/* ================================================================== profiles */

export const PROFILES = {
  stretched: {
    key: 'stretched', name: 'Stretched Thin', emoji: '🪢',
    tagline: 'Too much of your income is spoken for before the month begins.',
    meaning: 'Fixed commitments — rent, EMIs, people who depend on you — take so much of your take-home that saving is arithmetic, not willpower. Nothing here is a personal failing; it is a cash-flow problem, and cash-flow problems have levers.',
    first: ['Map every fixed commitment and its end date', 'Attack the highest-interest debt first, not the largest one', 'Build one month of buffer before anything else, even at ₹500 a month'],
    watch: 'Taking on any new EMI right now compounds the problem it looks like it solves.',
    exit: 'This changes the month your fixed costs drop under about half your income.',
  },
  exposed: {
    key: 'exposed', name: 'Bold but Uncovered', emoji: '🎢',
    tagline: 'Your appetite for risk has run ahead of your safety net.',
    meaning: 'You are comfortable with volatility and willing to invest — genuinely useful traits. The problem is the order. With this little cash behind you, an ordinary bad month forces you to sell investments at whatever price the market happens to be offering that week, which is exactly how people conclude that investing does not work.',
    first: ['Park the next three months of surplus in cash, not equity', 'Keep investing, but at a smaller amount, so the habit survives', 'Get term insurance if anyone depends on you'],
    watch: 'A market drop while your buffer is thin turns a paper loss into a realised one.',
    exit: 'This becomes a different profile at roughly three months of expenses in cash.',
  },
  foundation: {
    key: 'foundation', name: 'Foundation Builder', emoji: '🧱',
    tagline: 'The unglamorous stage that decides how everything after it goes.',
    meaning: 'Your income works and your commitments are manageable, but the buffer underneath is still thin. This is the least exciting phase of a financial life and by far the highest-return one — every rupee here buys you the ability to say no to a bad decision later.',
    first: ['Automate a fixed transfer on payday, before anything else moves', 'Target one month of expenses, then three', 'Keep it in a separate account you have no card for'],
    watch: 'Starting to invest before the buffer exists feels like progress and usually is not.',
    exit: 'Three months of expenses in cash moves you on.',
  },
  cautious: {
    key: 'cautious', name: 'Cautious Saver', emoji: '🛡️',
    tagline: 'You are good at keeping money. It is the growing part that is missing.',
    meaning: 'You save reliably and dislike losing money — a rarer and more valuable habit than it sounds. The risk you are carrying is not volatility, it is inflation: cash that feels safe loses buying power every year, quietly and without ever showing you a red number.',
    first: ['Learn what an index fund is before buying one', 'Start smaller than feels meaningful — the habit matters more than the amount', 'Keep six months in cash and stop there'],
    watch: 'Money that never leaves a savings account is guaranteed to lose to inflation.',
    exit: 'Investing regularly for six months, with a drop survived, moves you on.',
  },
  steady: {
    key: 'steady', name: 'Steady Starter', emoji: '🌱',
    tagline: 'On track. The work now is consistency, not cleverness.',
    meaning: 'Your buffer is real, your commitments fit, and your risk appetite is proportionate to your situation. Nothing here needs fixing. What determines where you land in ten years is whether the boring monthly transfer survives the months you would rather skip it.',
    first: ['Automate every contribution so none of them need a decision', 'Raise the investment amount whenever your income does', 'Put a name and a date on each goal'],
    watch: 'Lifestyle creep after a raise is the single most common way this profile stalls.',
    exit: 'Sustained investing plus a fuller buffer moves you on.',
  },
  confident: {
    key: 'confident', name: 'Confident Builder', emoji: '🏗️',
    tagline: 'Buffer, appetite and understanding all point the same way.',
    meaning: 'You have cash behind you, you understand what you are buying, and you can sit through a bad year without selling. That combination is rare this early, and it means the constraint on your outcome is no longer safety — it is how much you invest and how consistently.',
    first: ['Raise the monthly investment before raising your spending', 'Decide an asset allocation once, then leave it alone', 'Check the fees you are paying — they compound too'],
    watch: 'Confidence is the point at which people start believing they can time the market.',
    exit: 'Nothing to move on to. Consistency is now the whole game.',
  },
}

/* ================================================================== scoring */

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))
const pointsFor = (qid, value) => QUESTIONS.find((q) => q.id === qid)?.options?.find((o) => o.value === value)?.points ?? 0
const num = (v) => (Number.isFinite(+v) ? Math.max(0, +v) : 0)

export function ageFrom(dob) {
  if (!dob) return null
  const d = new Date(dob), now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
  return age >= 0 && age < 120 ? age : null
}

const AWARENESS_QS = QUESTIONS.filter((q) => q.options?.some((o) => o.correct))

/**
 * Three independent axes, each 0–100. Kept separate rather than collapsed into
 * one number because they mean different things and pull in different directions:
 * appetite without capacity is the dangerous combination, and the classifier
 * needs to see that.
 */
export function scoreAnswers(a) {
  const income = num(a.income)
  const rent = num(a.rent), emi = num(a.emi)
  const saved = num(a.savedNow)
  const age = ageFrom(a.dob)

  // Living costs beyond rent, when we have nothing else to go on.
  const livingEstimate = Math.max(income * 0.3, 6000)
  const monthlyNeed = Math.max(1, rent + emi + livingEstimate)
  const bufferMonths = saved / monthlyNeed
  const fixedRatio = income > 0 ? (rent + emi) / income : 1
  const emiRatio = income > 0 ? emi / income : 0

  /* --- capacity: how much shock this person can absorb -------------------- */
  const capacity = Math.round(
    40 * Math.sqrt(clamp(bufferMonths / 6)) +          // buffer, front-loaded
    30 * clamp((0.65 - fixedRatio) / 0.45) +           // room left after fixed costs
    pointsFor('dependents', a.dependents) +            // 0–15
    pointsFor('stability', a.stability),               // 0–15
  )

  /* --- appetite: willingness, plus the horizon age buys you --------------- */
  const ageBonus = age == null ? 5 : age <= 25 ? 10 : age <= 32 ? 7 : age <= 45 ? 4 : 1
  const appetite = Math.round(clamp((
    pointsFor('drawdown', a.drawdown) +                // 0–25
    pointsFor('horizon', a.horizon) +                  // 0–25
    pointsFor('tradeoff', a.tradeoff) +                // 0–25
    pointsFor('runway', a.runway) * 0.6 +              // 0–13
    ageBonus                                           // 0–10
  ) / 98) * 100)

  /* --- awareness: objective, six questions -------------------------------- */
  const correct = AWARENESS_QS.filter((q) => q.options.find((o) => o.value === a[q.id])?.correct)
  const unsure = AWARENESS_QS.filter((q) => a[q.id] === 'unsure')
  const awareness = Math.round((correct.length / AWARENESS_QS.length) * 100)

  return {
    capacity: clamp(capacity, 0, 100), appetite: clamp(appetite, 0, 100), awareness,
    bufferMonths, fixedRatio, emiRatio, monthlyNeed, age,
    dependents: a.dependents,
    correctCount: correct.length, totalAwareness: AWARENESS_QS.length,
    // what they did not know is the syllabus — the Learn page reads this
    gaps: AWARENESS_QS.filter((q) => !q.options.find((o) => o.value === a[q.id])?.correct).map((q) => q.teaches),
    unsureCount: unsure.length,
  }
}

/**
 * Ordered cascade, first match wins. Order is the design: a stretched cash flow
 * outranks everything because no amount of risk appetite fixes it, and "bold but
 * uncovered" is checked before "foundation" because the two need opposite advice
 * despite looking similar on a buffer measure alone.
 */
export function classify(s) {
  const reasons = []
  const say = (t) => { reasons.push(t); return true }

  let key
  if (s.fixedRatio > 0.6 || s.emiRatio > 0.35) {
    key = 'stretched'
    say(`Rent and EMIs take ${Math.round(s.fixedRatio * 100)}% of your take-home.`)
  } else if (s.bufferMonths < 1.5 && s.appetite >= 55) {
    key = 'exposed'
    say(`You have about ${s.bufferMonths.toFixed(1)} months of cash, but your answers put your risk appetite at ${s.appetite}/100.`)
  } else if (s.bufferMonths < 3) {
    key = 'foundation'
    say(`Your buffer covers roughly ${s.bufferMonths.toFixed(1)} months of expenses.`)
  } else if (s.appetite < 35) {
    key = 'cautious'
    say(`Your buffer is solid, and your risk appetite scores ${s.appetite}/100.`)
  } else if (s.capacity >= 60 && s.appetite >= 55 && s.awareness >= 60) {
    key = 'confident'
    say(`Capacity ${s.capacity}, appetite ${s.appetite} and awareness ${s.awareness} all clear the bar together.`)
  } else {
    key = 'steady'
    say(`Capacity ${s.capacity} and appetite ${s.appetite} sit in a balanced middle.`)
  }

  if (s.awareness < 50) reasons.push(`You answered ${s.correctCount} of ${s.totalAwareness} knowledge questions — that is the fastest thing on this list to change.`)
  if (s.dependents === 'full') reasons.push('People depend on your income, which raises the buffer you need.')

  return { ...PROFILES[key], reasons, scores: { capacity: s.capacity, appetite: s.appetite, awareness: s.awareness } }
}

/**
 * A five-pillar health score in the same shape finance.js produces, built from
 * what the person told us. Flagged self-reported everywhere it is shown: it is a
 * starting estimate, and it is replaced by the measured score the moment there
 * are transactions to measure.
 */
export function selfReportedHealth(a, s) {
  const income = num(a.income)
  const saves = num(a.savesMonthly)
  const savingsRate = income > 0 ? clamp(saves / income, 0, 1) : 0
  const investing = saves > 0

  const pillars = [
    {
      key: 'emergency', label: 'Emergency fund', weight: 30,
      score: Math.sqrt(clamp(s.bufferMonths / 6)),
      detail: `About ${s.bufferMonths.toFixed(1)} months of expenses covered`,
      reason: s.bufferMonths < 3
        ? 'Under three months. This is the first thing to fix, ahead of investing.'
        : s.bufferMonths < 6 ? 'A real buffer. Six months is the sensible ceiling.'
          : 'Fully funded. Anything beyond this belongs in investments.',
    },
    {
      key: 'savings', label: 'Savings rate', weight: 25,
      score: clamp(savingsRate / 0.25),
      detail: `You told us you save about ${Math.round(savingsRate * 100)}% of your income`,
      reason: savingsRate < 0.1 ? 'Below 10%. An automatic transfer on payday moves this faster than intent does.'
        : savingsRate < 0.2 ? 'A reasonable start. 20% is the next step.' : 'Strong for this stage.',
    },
    {
      key: 'spending', label: 'Fixed-cost load', weight: 20,
      score: clamp((0.65 - s.fixedRatio) / 0.45),
      detail: `Rent and EMIs are ${Math.round(s.fixedRatio * 100)}% of take-home`,
      reason: s.fixedRatio > 0.5 ? 'Above half your income is committed before the month starts, which limits every other option.'
        : 'Your committed costs leave room to work with.',
    },
    {
      key: 'investing', label: 'Investing', weight: 15,
      score: investing ? clamp(savingsRate / 0.2) * 0.9 : 0,
      detail: investing ? `Around ${Math.round(saves).toLocaleString('en-IN')} a month set aside` : 'Not investing yet',
      reason: s.bufferMonths < 3 ? 'Deliberately low priority right now — the buffer comes first.'
        : 'Consistency beats amount. A small monthly habit outperforms a large occasional one.',
    },
    {
      key: 'bills', label: 'Bill discipline', weight: 10,
      score: clamp(pointsFor('billHabit', a.billHabit) / 10),
      detail: { never: 'Nothing slips', rare: 'Once or twice a year', sometimes: 'Most months something is late', often: 'Hard to keep track' }[a.billHabit] || '—',
      reason: ['sometimes', 'often'].includes(a.billHabit)
        ? 'Late fees and credit-score damage both come from here, and autopay removes the whole category.'
        : 'Nothing to fix here.',
    },
  ]

  const total = Math.round(pillars.reduce((x, p) => x + p.score * p.weight, 0))
  return {
    total, band: total >= 80 ? 'Strong' : total >= 60 ? 'Steady' : total >= 40 ? 'Building' : 'Fragile',
    pillars, monthsCovered: s.bufferMonths, savingsRate, basis: 'self-reported',
  }
}

/** Everything the API needs, from raw answers, in one call. */
export function assess(answers) {
  const scores = scoreAnswers(answers)
  return { scores, profile: classify(scores), health: selfReportedHealth(answers, scores) }
}
