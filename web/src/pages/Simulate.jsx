import { useState } from 'react'
import { api, inr, useAction } from '../lib/util'
import { Card, Icon, Loading, SourcePill, Stat, Term, Why } from '../components/ui'
import { Projection } from '../components/charts'

const PRESETS = [
  { id: 'swap', label: 'Invest ₹5,000 a month instead of spending it', scenario: { kind: 'swap', amount: 5000, monthly: true, months: 12 } },
  { id: 'phone', label: 'Buy a ₹45,000 phone', scenario: { kind: 'purchase', amount: 45000 } },
  { id: 'sip', label: 'Start a ₹5,000 SIP', scenario: { kind: 'invest', monthlySip: 5000, delayMonths: 0 } },
  { id: 'bike', label: 'Bike on EMI, ₹4,200 × 24', scenario: { kind: 'emi', emi: 4200, months: 24 } },
  { id: 'trip', label: 'Spend ₹60,000 on a trip', scenario: { kind: 'purchase', amount: 60000 } },
  { id: 'wait', label: 'Delay investing by 6 months', scenario: { kind: 'invest', monthlySip: 5000, delayMonths: 6 } },
]

const EXAMPLES = [
  'What if I invest ₹5,000 instead of spending it?',
  'What if I buy a ₹80,000 laptop on EMI over 18 months?',
  'What if I put 10k a month into an index fund rather than upgrading my phone?',
]

const VERDICT = {
  comfortable: { cls: 'chip-good', text: 'Comfortable' },
  tight: { cls: 'chip-note', text: 'Tight but survivable' },
  risky: { cls: 'chip-warn', text: 'Risky right now' },
}

export default function Simulate({ state }) {
  const [scenario, setScenario] = useState(PRESETS[0].scenario)
  const [active, setActive] = useState('swap')
  const [result, setResult] = useState(null)
  const [parsed, setParsed] = useState(null)

  const [run, running, error] = useAction(async (sc) => setResult(await api.post('/api/ai/simulate', { scenario: sc })))
  const go = (id, sc) => { setActive(id); setScenario(sc); setParsed(null); run(sc) }

  // Free text → scenario object → the same deterministic engine every other path uses.
  const [askInWords, parsing, parseError] = useAction(async (question) => {
    const p = await api.post('/api/ai/parse-scenario', { question })
    setParsed(p); setActive('typed'); setScenario(p.scenario)
    await run(p.scenario)
  })

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">What if…</div>
          <h1 className="page-title" style={{ marginTop: 6 }}>Try the decision before you make it</h1>
          <p className="page-sub">
            The projection is arithmetic, not a forecast. It assumes {Math.round(state.assumptions.equityReturn * 100)}%
            nominal equity growth and {(state.assumptions.savingsReturn * 100).toFixed(1)}% on savings, and it says so
            on every chart — because a projection that hides its assumptions is just a nice-looking guess.
          </p>
        </div>
      </header>

      <AskInWords onAsk={askInWords} parsing={parsing} parsed={parsed} error={parseError} />

      <div className="row wrap" style={{ gap: 8, margin: '20px 0' }}>
        {PRESETS.map((p) => (
          <button key={p.id} className="chip" aria-pressed={active === p.id}
            style={active === p.id ? { background: 'var(--forest)', color: '#F4EEDE', borderColor: 'transparent' } : undefined}
            onClick={() => go(p.id, p.scenario)}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid g-main">
        <div className="stack">
          <Custom scenario={scenario} onRun={(sc) => go('custom', sc)} running={running} />

          {running && <Card><Loading lines={5} label="Running the projection…" /></Card>}
          {error && <Card><p className="callout callout-warn">{error}</p></Card>}

          {result && !running && (
            <Card title="Two years from now" className="rise"
              action={<span className="small">24 months · nominal rupees</span>}>
              <p style={{ fontSize: 16, fontFamily: 'var(--serif)', lineHeight: 1.5, marginBottom: 16 }}>{result.headline}</p>
              <Projection base={result.base} after={result.after} alt={result.alt}
                labels={result.labels || scenarioLabels(scenario)} />
              <div className="grid g3" style={{ marginTop: 18, gap: 14 }}>
                {result.alt ? (
                  <>
                    <Stat label={result.labels[0]} value={inr(result.alt.at(-1).net)} ink="var(--terracotta)" />
                    <Stat label={result.labels[1]} value={inr(result.after.at(-1).net)} ink="var(--in)" />
                    <Stat label="The gap" value={inr(Math.abs(result.after.at(-1).net - result.alt.at(-1).net))}
                      sub="after 24 months" />
                  </>
                ) : (
                  <>
                    <Stat label="If you don't" value={inr(result.base.at(-1).net)} />
                    <Stat label="If you do" value={inr(result.after.at(-1).net)}
                      ink={result.after.at(-1).net < result.base.at(-1).net ? 'var(--terracotta)' : 'var(--in)'} />
                    <Stat label="Difference" value={inr(Math.abs(result.after.at(-1).net - result.base.at(-1).net))}
                      sub={result.after.at(-1).net < result.base.at(-1).net ? 'less net worth' : 'more net worth'} />
                  </>
                )}
              </div>
              {result.mechanics?.length > 0 && (
                <ul style={{ margin: '18px 0 0', paddingLeft: 18 }}>
                  {result.mechanics.map((m, i) => <li key={i} className="small" style={{ marginBottom: 4 }}>{m}</li>)}
                </ul>
              )}
              <p className="small" style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--rule-2)' }}>
                Assumes {Math.round(result.assumptions.equityReturn * 100)}% equity and {(result.assumptions.savingsReturn * 100).toFixed(1)}% savings
                returns, before inflation of {Math.round(result.assumptions.inflation * 100)}%. Real returns will differ —
                that is the point of running it more than one way. <Term of="Nominal vs real returns">Nominal vs real</Term>
              </p>
            </Card>
          )}
        </div>

        <div className="stack">
          {result?.ai && !running && (
            <Card title="What this actually means" className="rise"
              action={<SourcePill source={result.source} fallback={result.fallback} />}>
              <span className={`chip chip-static ${VERDICT[result.ai.verdict]?.cls || ''}`} style={{ marginBottom: 12 }}>
                {VERDICT[result.ai.verdict]?.text || result.ai.verdict}
              </span>
              <p style={{ fontSize: 14.5, lineHeight: 1.62 }}>{result.ai.summary}</p>

              <div style={{ marginTop: 16 }}>
                <div className="eyebrow" style={{ marginBottom: 5 }}>Watch for</div>
                <p className="callout callout-warn" style={{ fontSize: 13 }}>{result.ai.watchFor}</p>
              </div>
              <div style={{ marginTop: 14 }}>
                <div className="eyebrow" style={{ marginBottom: 5 }}>A smaller version</div>
                <p className="callout callout-forest" style={{ fontSize: 13 }}>{result.ai.smallerVersion}</p>
              </div>

              {result.ai.learn && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--rule-2)' }}>
                  <div className="eyebrow" style={{ marginBottom: 5 }}>Worth knowing: {result.ai.learn.term}</div>
                  <p className="small">{result.ai.learn.plain}</p>
                  <Term of={result.ai.learn.term}>
                    <span className="small">Explain this properly →</span>
                  </Term>
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                <Why claim={`The verdict on: ${JSON.stringify(scenario)}`} context={result.headline} />
              </div>
            </Card>
          )}

          <Card title="Where you're starting from">
            <div className="stack" style={{ gap: 12 }}>
              <Stat label="Cash in savings" value={inr(state.accounts.filter((a) => a.kind === 'savings').reduce((s, a) => s + a.balance, 0))} />
              <Stat label="Invested" value={inr(state.accounts.filter((a) => a.kind === 'invest').reduce((s, a) => s + a.balance, 0))} />
              <Stat label="Emergency cover" value={`${state.health.monthsCovered.toFixed(1)} months`} />
              <Stat label="Monthly outgoings" value={inr(state.summary.spend)} />
            </div>
            <p className="small" style={{ marginTop: 14 }}>
              Every scenario starts from these real balances, not a demo profile.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- ask in words */

function AskInWords({ onAsk, parsing, parsed, error }) {
  const [q, setQ] = useState('')
  return (
    <Card>
      <form className="row wrap" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); if (q.trim()) onAsk(q) }}>
        <input className="input" style={{ flex: 1, minWidth: 260 }} disabled={parsing}
          placeholder="Ask it the way you'd say it — “what if I invest ₹5,000 instead of spending it?”"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" type="submit" disabled={parsing || !q.trim()}>
          {parsing ? <><Icon.refresh size={14} className="spin" /> Reading</> : <>Run it</>}
        </button>
      </form>

      {!parsed && !parsing && (
        <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
          {EXAMPLES.map((e) => <button key={e} className="chip" onClick={() => { setQ(e); onAsk(e) }}>{e}</button>)}
        </div>
      )}

      {error && <p className="callout callout-warn" style={{ marginTop: 12 }}>{error}</p>}

      {parsed && (
        <div className="rise" style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--rule-2)' }}>
          <div className="row-between wrap" style={{ gap: 10 }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Read as</div>
              <div style={{ fontSize: 13.5 }}>{parsed.restated}</div>
            </div>
            <SourcePill source={parsed.source} fallback={parsed.fallback} />
          </div>
          <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
            {Object.entries(parsed.scenario).map(([k, v]) => (
              <span key={k} className="chip chip-static">
                <span className="muted">{k}</span> <span className="mono">{String(v)}</span>
              </span>
            ))}
          </div>
          {parsed.assumed && (
            <p className="small" style={{ marginTop: 10 }}>
              {/* the model does not reliably end its sentence, and "…is used If that is wrong" reads as a typo */}
              ⚠ {parsed.assumed.replace(/[.\s]*$/, '.')} If that is wrong, set it exactly below — the projection only
              ever uses these fields.
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

const scenarioLabels = (s) =>
  s.kind === 'swap' ? ['If you spend it', 'If you invest it']
    : s.kind === 'invest' ? ['Without the SIP', 'With the SIP']
      : s.kind === 'emi' ? ['Without the EMI', 'With the EMI']
        : ['If you skip it', 'If you buy it']

/* ---------------------------------------------------------------- custom */

function Custom({ scenario, onRun, running }) {
  const [kind, setKind] = useState(scenario.kind)
  const [amount, setAmount] = useState(45000)
  const [emi, setEmi] = useState(4200)
  const [months, setMonths] = useState(24)
  const [sip, setSip] = useState(5000)

  const [swapMonthly, setSwapMonthly] = useState(true)

  const build = () =>
    kind === 'purchase' ? { kind, amount: +amount }
      : kind === 'emi' ? { kind, emi: +emi, months: +months }
        : kind === 'swap' ? { kind, amount: +sip, monthly: swapMonthly, months: 12 }
          : { kind, monthlySip: +sip, delayMonths: 0 }

  return (
    <Card title="Or set it exactly">
      <div className="seg" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <button aria-pressed={kind === 'swap'} onClick={() => setKind('swap')}>Invest instead of spending</button>
        <button aria-pressed={kind === 'purchase'} onClick={() => setKind('purchase')}>One-off purchase</button>
        <button aria-pressed={kind === 'emi'} onClick={() => setKind('emi')}>Something on EMI</button>
        <button aria-pressed={kind === 'invest'} onClick={() => setKind('invest')}>Start investing</button>
      </div>

      <div className="row wrap" style={{ gap: 12, alignItems: 'flex-end' }}>
        {kind === 'swap' && (
          <>
            <div className="field" style={{ width: 170 }}><label>Amount in question ₹</label>
              <input className="input mono" type="number" value={sip} onChange={(e) => setSip(e.target.value)} /></div>
            <div className="field"><label>How often</label>
              <div className="seg">
                <button aria-pressed={swapMonthly} onClick={() => setSwapMonthly(true)}>Every month</button>
                <button aria-pressed={!swapMonthly} onClick={() => setSwapMonthly(false)}>Just once</button>
              </div>
            </div>
          </>
        )}
        {kind === 'purchase' && (
          <div className="field" style={{ width: 170 }}><label>How much does it cost?</label>
            <input className="input mono" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        )}
        {kind === 'emi' && (
          <>
            <div className="field" style={{ width: 150 }}><label>Monthly EMI ₹</label>
              <input className="input mono" type="number" value={emi} onChange={(e) => setEmi(e.target.value)} /></div>
            <div className="field" style={{ width: 130 }}><label>For how many months</label>
              <input className="input mono" type="number" value={months} onChange={(e) => setMonths(e.target.value)} /></div>
          </>
        )}
        {kind === 'invest' && (
          <div className="field" style={{ width: 170 }}><label>Monthly amount ₹</label>
            <input className="input mono" type="number" value={sip} onChange={(e) => setSip(e.target.value)} /></div>
        )}
        <button className="btn" onClick={() => onRun(build())} disabled={running}>
          {running ? <><Icon.refresh size={14} className="spin" /> Running</> : <><Icon.sim size={14} /> Show me</>}
        </button>
      </div>

      <p className="small" style={{ marginTop: 12 }}>
        {kind === 'swap'
          ? <>This is the only scenario with two real arms — most decisions are not "do it or don't", they are "this or that". <Term of="Opportunity cost">Opportunity cost</Term></>
          : kind === 'emi'
          ? <>An EMI is a commitment your future self cannot cancel. The chart shows what it does to everything else. <Term of="EMI">What an EMI really costs</Term></>
          : kind === 'invest'
            ? <>Investing is boring on purpose — the interesting part is the gap that opens between starting now and starting later. <Term of="SIP">What is a SIP?</Term></>
            : <>A one-off purchase looks small next to a salary and large next to an emergency fund. Both are true. <Term of="Opportunity cost">Opportunity cost</Term></>}
      </p>
    </Card>
  )
}
