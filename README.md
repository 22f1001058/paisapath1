# PaisaPath

**A financial mentor for first-time earners in India — one clear step at a time.**

Most money apps show a 23-year-old on their first salary a balance and a pie chart, then leave
them to work out what any of it means. PaisaPath answers the question they actually have, which
is never "what did I spend on Tuesday" but *"what should I do next, and why should I believe you?"*

The AI brain is any inference provider you point it at: an agent CLI already installed on the
machine (`claude`, `codex`, `gemini`), a local model server (Ollama, LM Studio, vLLM), or a hosted
API (OpenAI, Anthropic, Gemini, OpenRouter, Groq, DeepSeek, Mistral, Together, xAI, or anything
else that speaks one of those three wire formats). Keys live in a gitignored `.env`; there is no
key in this repo and no PaisaPath server.

---

## The three design goals

| # | How Might We | Where it lives |
|---|---|---|
| **1** | Make every complex first-money decision clear, explainable and actionable | Safe-to-Spend ledger · "Why am I seeing this?" on every recommendation · Decision Simulator |
| **2** | Track expenses, simplify budgeting and plan — with minimal user effort | Auto-categorisation · generated budgets · unified dashboard · goal planner |
| **3** | Build confidence through trustworthy guidance that complements professional advice | Contextual lessons · full AI audit log · stated risks and alternatives · explicit non-adviser stance |

### The ten ideas, and where each one landed

| Idea | Screen |
|---|---|
| 1. AI Financial Mentor | `Mentor` — streamed chat that already knows your figures |
| 2. Unified Financial Dashboard | `Money` — five accounts, bills, goals, net worth on one page |
| 3. Automatic Expense Tracking | `Spending` — rules first, AI for what rules cannot place |
| 4. Smart Budget Generator | `Budget` — life-stage template bent toward your 3-month averages |
| 5. Safe-to-Spend Calculator | `Today` — the hero number, with its arithmetic one click away |
| 6. Goal & Emergency Fund Planner | `Goals` — every goal carries its monthly number |
| 7. Decision Simulator | `What if…` — ask in plain words, 24-month projection with assumptions on the chart |
| 8. Learn While You Use | Any dashed underline, anywhere, plus the `Learn` index |
| 9. Explain Every Recommendation | The `Why am I seeing this?` drawer — why, benefit, risk, 2 alternatives, basis |
| 10. Trust & Transparency Centre | `Trust centre` — permissions, disclosures, and every AI call ever made |
| 11. Onboarding questionnaire | `#/start` — 22 questions → 1 of 6 profiles → a salary split you drag |
| 12. Context-aware nudges | `Today` — triggered, evidenced, dismissible |
| *Bonus* — Financial Health Score | `Today` — five weighted pillars, each one expandable to its reason |
| *Bonus* — Smart Monthly Review | `Spending` — the month written as prose, not a report |
| *Bonus* — Milestone Celebrations | `Today` — "worth celebrating" |

Deliberately **not** built: a SEBI-advisor marketplace and a peer community. Both were descoped —
the advisor platform needs real verified professionals to mean anything, and an unmoderated tips
feed cuts directly against the trust argument the rest of the app makes.

### Onboarding: the questionnaire, the profile, the split

**22 questions in four sections** — about you, your money, how you handle risk, and what you already
know — then a profile, then a salary split. Nothing is written to the database until the last screen.

The client renders whatever `/api/onboard/questions` returns, so there is no per-question JSX. The
wording and the points that read it live in the same file, which is the usual way this kind of thing
rots.

**Three measured axes**, kept separate rather than collapsed into one number, because they mean
different things and pull in different directions:

| Axis | From |
|---|---|
| **Capacity** | buffer months, fixed-cost ratio, dependants, income stability |
| **Appetite** | what you'd actually do in a 24% drawdown, horizon, a risk/return trade-off, runway, age |
| **Awareness** | six objective questions — compounding, inflation, index funds, credit-card minimums, term insurance, where an emergency fund belongs |

Every knowledge question offers **"Not sure"**, which scores zero but is never penalised further. A
questionnaire that punishes honesty collects guesses, and a guess tells you nothing about what the
person needs taught. Whatever they miss becomes their lesson list, wired to the same `Learn` drawer
the rest of the app uses.

**Six profiles**, assigned by an ordered cascade where first match wins:

| Profile | Triggered by |
|---|---|
| 🪢 **Stretched Thin** | fixed costs > 60% of income, or EMIs alone > 35% |
| 🎢 **Bold but Uncovered** | under 1.5 months of buffer **and** appetite ≥ 55 |
| 🧱 **Foundation Builder** | under 3 months of buffer |
| 🛡️ **Cautious Saver** | buffer fine, appetite under 35 |
| 🏗️ **Confident Builder** | capacity ≥ 60, appetite ≥ 55 and awareness ≥ 60 |
| 🌱 **Steady Starter** | everything else |

The order *is* the design, and the tests pin it. Stretched outranks everything because no amount of
risk appetite fixes a cash-flow problem. "Bold but Uncovered" is checked **before** "Foundation
Builder" although both have a thin buffer — they need opposite advice, and collapsing them would
tell the riskiest user the mildest thing.

Every profile shows **why this profile and not another**, quoting the figures that triggered it.

### Self-reported vs measured

A brand-new account has no transactions, so its health score is built from questionnaire answers and
labelled **self-reported** everywhere it appears. Once there are 20+ transactions it switches to the
**measured** score from `finance.js` on its own. The two are never blended — *"we measured this"* and
*"you told us this"* are different claims, and the UI has to be able to say which one it is showing.
They may disagree, which is information rather than a bug.

Both produce the identical five-pillar shape, so one component renders either. A test asserts that.

### The salary split

An interactive split across essentials, emergency fund, investments, short-term savings and everyday
spending. Dragging any bucket takes the difference from everyday spending, so the plan always adds up
to exactly the salary — money has to come from somewhere, and the UI should say so rather than let
the total drift.

`salarySplit()` is the only place in the app that starts from a rule of thumb rather than the
person's own behaviour, because at onboarding there is no history yet. It is **not** 50-30-20: that
rule assumes an emergency fund already exists, so the future share is front-loaded into emergency
until roughly six months of cover, then rotates toward investing.

Nothing is written until the last screen. Re-runnable from **Trust centre → Start over**.

### The what-if simulator

Type the question the way you'd say it — *"what if I invest ₹5,000 a month instead of spending
it?"* — and the model's only job is to turn that sentence into a scenario object. It classifies and
extracts; it never runs the maths. The parsed fields are shown back to you as editable chips, along
with anything it had to assume, so a bad parse is visible rather than silent. There is a regex
fallback for when no engine is reachable.

`swap` scenarios are genuine A-vs-B and draw three lines — spend it, invest it, and do neither.
The other kinds compare do-it against don't-do-it, which is the wrong shape for most real decisions.

### Context-aware nudges

Computed in `finance.js`, not generated, under three rules:

1. A nudge names the evidence that triggered it. Every card shows **what triggered this**.
2. A nudge is dismissible and stays dismissed — ids are stable strings, never list indexes.
3. A nudge fires on a **change**, not a standing condition. *"You have no emergency fund"* is a
   dashboard fact; *"your salary landed four days ago and none of it has moved"* is a nudge.

Nine triggers: payday inaction, category spikes versus the same day last month, manual bills coming
due, subscription creep, burn rate ahead of the calendar, a detected raise, investing while the
buffer is thin, the same merchant charging twice, and budget lines breached with month still to run.

---

## The one architectural rule

> **The model never produces a number.**

`server/finance.js` computes every rupee, percentage and projection. It imports nothing and
contains no AI. Whichever provider is active receives figures that are already final and is asked
only to write prose about them.

This is not stylistic. It is what makes the Trust Centre's claims true, it is why the app still
works with every provider offline, and it is why "Why am I seeing this?" can show you arithmetic
rather than a paraphrase. `server/finance.test.js` asserts the invariant that matters most:

```js
assert.equal(
  sts.ledger.reduce((x, l) => x + l.amount, 0), sts.safe,
  'the shown ledger must add up to the shown number — this is the whole trust claim',
)
```

When no provider answers, every AI endpoint falls back to a deterministic rule-writer and the
UI says so — the little pill next to each block reads `built-in rules` instead of the engine name.

---

## Running it

```bash
npm install
npm run dev
```

`http://localhost:5173` — Vite serves the UI and proxies `/api` to the Express server on `:8787`.
Demo data (Ananya, 23, Bengaluru, four months of history) seeds itself on first boot into
`data/paisapath.db`.

| Command | What it does |
|---|---|
| `npm run dev` | UI on `:5173`, API on `:8787`, both watching |
| `npm run api` | API only |
| `npm run build` | Production bundle into `dist/` |
| `npm start` | Build, then serve UI + API from `:8787` alone |
| `npm run shots` | Full-page screenshots of every screen + the PDF walkthrough → `screenshots/` |
| `npm run pdf` | Rebuild just the PDF from the PNGs already in `screenshots/` |
| `npm test` | Self-checks on the money maths, the profile classifier and the provider layer |

`npm run shots` drives the Chrome on this Mac over the DevTools Protocol (no Puppeteer), clicking
through the two drawers and the simulator so those states get captured too. The PDF is written
byte-by-byte by `tools/sheet-pdf.mjs` rather than by Chrome's `printToPDF`, which hangs
indefinitely on a page holding twelve 2880&nbsp;px-wide bitmaps.

### The AI engine

Nothing to configure to try it: with no `.env` at all, PaisaPath drives whichever agent CLI you
already have installed. To use a hosted or local model instead:

```bash
cp .env.example .env       # then fill in exactly one provider
```

```bash
OPENAI_API_KEY=sk-…        # or ANTHROPIC_API_KEY / GOOGLE_API_KEY / OPENROUTER_API_KEY / …
OPENAI_MODEL=gpt-4o-mini   # optional, every preset has a default
AI_PROVIDER=openai         # which one to start on
```

Switch at runtime in **Trust centre → The AI engine**, or:

```bash
curl -X POST localhost:8787/api/provider -H 'Content-Type: application/json' -d '{"name":"codex"}'
```

| Kind | Providers | How it is reached |
|---|---|---|
| Agent CLI | `claude` `codex` `gemini` | subprocess on this machine, no key — `claude -p`, `codex exec --ephemeral -s read-only`, `gemini --approval-mode plan` |
| Hosted API | `openai` `anthropic` `google` `openrouter` `groq` `deepseek` `mistral` `together` `xai` | HTTPS, key from `.env`, streamed |
| Local server | `ollama` (and anything OpenAI-compatible) | `http://localhost:…`, no key, nothing leaves the machine |

A provider the catalogue has never heard of needs no code change — declare it and configure it
with its own name as the prefix:

```bash
AI_PROVIDERS=vllm
VLLM_BASE_URL=http://10.0.0.4:8000/v1
VLLM_MODEL=Qwen/Qwen2.5-32B-Instruct
VLLM_API=openai            # wire format: openai (default) | anthropic | google
```

Three wire formats cover the field: OpenAI `/chat/completions`, Anthropic `/messages`, Gemini
`:generateContent`. `server/providers.js` holds the catalogue and the request/response shaping —
data and pure functions, covered by `server/providers.test.js`. `server/ai.js` holds the
plumbing: subprocess or socket, SSE streaming, concurrency lanes, JSON repair, fallback, audit log.

The Trust Centre probes every configured provider live and reports the real reason an unavailable
one failed (no credits, expired auth, wrong model name, connection refused) rather than hiding it.
It also states, per provider, exactly where the data goes — a subprocess, a box on your network,
or a named vendor endpoint. API keys are read from the environment, used to sign one request, and
never written to the database, never logged and never sent to the browser.

---

## Design

**"The Ledger."** Warm paper, hairline rules, a serif kept for money figures. The brief was
explicitly *not* the purple-blue gradient every AI-built fintech arrives in, and the reasoning is
more than taste: a first-time earner is already unsure whether an app is selling them something.
Restraint reads as honesty. Reference boards were pulled from Mobbin — Monarch, Origin, Rocket
Money, Quicken — for information density and hierarchy, not for their palettes.

```
paper   #F4F0E8    forest    #14493C   (brand, and money coming in)
card    #FFFCF6    marigold  #C8891F   (attention, and "a model wrote this")
ink     #1B1815    terracotta #AB4326  (money going out, and honest warnings)
rule    #DFD7C6
```

Fraunces for money and headlines, Inter for interface, JetBrains Mono for tabular figures and
small caps. Colour is only ever semantic — in, out, caution. There is no gradient in the app.
Full dark theme, `prefers-reduced-motion` respected, focus rings on everything.

Charts are ~30 lines of hand-written SVG each. A chart library would have been one `npm install`,
but each arrives with its own defaults — rounded bars, drop shadows, a stock palette — that fight
the rest of the page.

---

## Layout

```
server/
  finance.js       every calculation. no AI, no imports, fully testable
  finance.test.js  assert-based self-check
  profile.js       the questionnaire, its scoring, and the 6-profile classifier
  profile.test.js  every profile has a worked example that must land on it
  providers.js     the provider catalogue and the three wire formats
  providers.test.js  assert-based self-check, no network
  ai.js            transport: subprocess or HTTP, streaming, fallback, audit log
  index.js         Express API
  db.js            schema (node:sqlite, stdlib)
  seed.js          deterministic demo data
web/src/
  pages/           Today · Money · Spending · Budget · Goals · Simulate · Mentor · Learn · Trust
  components/ui.jsx      primitives + the Why / Term drawers
  components/charts.jsx  hand-rolled SVG charts
  lib/util.js      money formatting (Indian units), fetch hooks, 20-line hash router
  styles.css       the design system
tools/capture.mjs  screenshots + PDF over the DevTools Protocol
```

Dependencies: `express` at runtime; `react`, `vite`, `concurrently` to build. Nothing else.

---

## What this deliberately is not

- Not a SEBI-registered adviser. It never names a fund, stock, insurer or policy to buy — asked
  directly, it declines once and hands over the criteria to judge one instead.
- Not connected to a real bank. Account data is seeded; the read-only permission model is real
  in the sense that no code path can initiate a payment.
- Not monetised. No affiliate links, no sponsored placement, no referral fees — stated in the
  Trust Centre because an app that says nothing about this is saying something.
#   p a i s a p a t h 1  
 