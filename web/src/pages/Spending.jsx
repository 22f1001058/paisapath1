import { useMemo, useState } from 'react'
import { api, dayLabel, inr, inkFor, monthName, useAction, useFetch } from '../lib/util'
import { Card, Icon, Loading, SourcePill, Stat, Term, Why } from '../components/ui'
import { Bar, Donut } from '../components/charts'

const ALL = 'All categories'

export default function Spending({ state, reload }) {
  const { month, months, summary, deltas, uncategorised } = state
  const [m, setM] = useState(month)
  const [cat, setCat] = useState(ALL)
  const [q, setQ] = useState('')
  const [hover, setHover] = useState(null)

  const qs = new URLSearchParams({ month: m, ...(cat !== ALL && { category: cat }), ...(q && { q }) })
  const txns = useFetch(`/api/txns?${qs}`, [m, cat, q])

  // Picking an older month has to move the totals and the donut too, not just the
  // transaction list — otherwise the page shows July's chart over April's rows.
  const past = useFetch(m === month ? null : `/api/state?month=${m}`, [m])
  const view = m === month ? { summary, deltas } : past.data ? { summary: past.data.summary, deltas: past.data.deltas } : null
  const S = view?.summary ?? summary

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Spending</div>
          <h1 className="page-title" style={{ marginTop: 6 }}>Where the money actually went</h1>
          <p className="page-sub">
            Transactions arrive from your accounts already sorted. You never type an expense — you only correct the
            handful the app gets wrong.
          </p>
        </div>
        <select className="select" style={{ width: 160 }} value={m} onChange={(e) => setM(e.target.value)}>
          {months.map((x) => <option key={x} value={x}>{monthName(x)}</option>)}
        </select>
      </header>

      {uncategorised > 0 && <Categoriser count={uncategorised} reload={reload} onDone={txns.reload} />}

      <div className="grid g-main" style={{ marginBottom: 20 }}>
        <Card title={`Categories · ${monthName(m, true)}`}>
          {!view && <Loading lines={5} />}
          <table className="ledger">
            <thead>
              <tr>
                <th>Category</th><th style={{ width: '32%' }}>Share</th>
                <th className="r">vs last month</th><th className="r">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(view?.deltas || []).map((c) => (
                <tr key={c.category} onMouseEnter={() => setHover(c)} onMouseLeave={() => setHover(null)}>
                  <td>
                    <button className="row" style={{ gap: 8, background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
                      onClick={() => setCat(cat === c.category ? ALL : c.category)}>
                      <i className="dot" style={{ background: inkFor(c.category) }} />
                      <span style={{ fontSize: 13, fontWeight: cat === c.category ? 600 : 400 }}>{c.category}</span>
                      <span className="tag-bucket">{c.bucket}</span>
                    </button>
                  </td>
                  <td><Bar value={c.amount} max={S.categories[0]?.amount || 1} ink={inkFor(c.category)} height={4} /></td>
                  <td className="r" style={{ color: c.delta > 0 ? 'var(--terracotta)' : c.delta < 0 ? 'var(--forest)' : 'var(--ink-3)' }}>
                    {c.delta == null ? '—' : c.delta === 0 ? '—' : `${c.delta > 0 ? '+' : '−'}${inr(Math.abs(c.delta))}`}
                  </td>
                  <td className="r">{inr(c.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="stack">
          <Card title={`${monthName(m, true)} at a glance`}>
            <div style={{ display: 'grid', placeItems: 'center', marginBottom: 12 }}>
              <Donut data={S.categories.slice(0, 8)} centre={inr(hover ? hover.amount : S.spend)}
                sub={hover ? hover.category : 'total out'} onHover={setHover} />
            </div>
            <div className="row-between"><Stat label="Money in" value={inr(S.income)} ink="var(--in)" /><Stat label="Kept" value={inr(S.net)} /></div>
            <div style={{ marginTop: 14 }}>
              <Why claim="How my spending is categorised" context={`${S.count} transactions across ${S.categories.length} categories`} />
            </div>
          </Card>
          <Review month={m} />
        </div>
      </div>

      <Card
        title={`${txns.data?.length || 0} transactions`}
        action={
          <div className="row" style={{ gap: 8 }}>
            <input className="input" style={{ width: 180 }} placeholder="Search merchant…" value={q} onChange={(e) => setQ(e.target.value)} />
            {cat !== ALL && <button className="chip" onClick={() => setCat(ALL)}>{cat} <Icon.close size={11} /></button>}
          </div>
        }
      >
        {txns.loading && <Loading lines={5} />}
        <table className="ledger">
          <thead><tr><th>Date</th><th>Merchant</th><th>Category</th><th>Method</th><th className="r">Amount</th></tr></thead>
          <tbody>
            {txns.data?.map((t) => <TxnRow key={t.id} t={t} onSaved={txns.reload} />)}
          </tbody>
        </table>
        {txns.data?.length === 0 && <p className="small" style={{ padding: '20px 0', textAlign: 'center' }}>Nothing matches that filter.</p>}
      </Card>
    </div>
  )
}

/* ---------------------------------------------------------------- row */

const CATS = ['Food & Dining', 'Groceries', 'Transport', 'Rent', 'Bills & Utilities', 'Shopping', 'Subscriptions',
  'Health', 'Education', 'Entertainment', 'Family & Gifts', 'Investments', 'Savings', 'Income', 'Other']

function TxnRow({ t, onSaved }) {
  const [editing, setEditing] = useState(false)
  const save = async (category) => {
    await api.patch(`/api/txns/${t.id}`, { category })
    setEditing(false); onSaved()
  }
  return (
    <tr>
      <td className="mono small" style={{ whiteSpace: 'nowrap' }}>{dayLabel(t.date)}</td>
      <td style={{ fontSize: 13 }}>
        {t.merchant}
        {t.source === 'ai' && t.note && <div className="small" style={{ fontSize: 11 }}>sorted by AI · {t.note}</div>}
      </td>
      <td>
        {editing ? (
          <select className="select" style={{ width: 165, padding: '3px 8px', fontSize: 12 }} autoFocus
            defaultValue={t.category || ''} onChange={(e) => save(e.target.value)} onBlur={() => setEditing(false)}>
            <option value="" disabled>Choose…</option>
            {CATS.map((c) => <option key={c}>{c}</option>)}
          </select>
        ) : (
          <button className="chip" onClick={() => setEditing(true)}>
            <i className="dot" style={{ background: t.category ? inkFor(t.category) : 'var(--terracotta)' }} />
            {t.category || 'uncategorised'}
          </button>
        )}
      </td>
      <td className="small">{t.method}</td>
      <td className="r" style={{ color: t.amount > 0 ? 'var(--in)' : 'var(--ink)' }}>
        {t.amount > 0 ? '+' : '−'}{inr(t.amount)}
      </td>
    </tr>
  )
}

/* ---------------------------------------------------------------- AI categoriser */

function Categoriser({ count, reload, onDone }) {
  const [result, setResult] = useState(null)
  const [runIt, running] = useAction(async () => {
    const r = await api.post('/api/ai/categorise')
    setResult(r); reload(); onDone()
  })

  return (
    <Card className="rise" style={{ marginBottom: 20, borderColor: 'var(--marigold)' }}>
      <div className="row-between wrap" style={{ gap: 16 }}>
        <div style={{ maxWidth: '62ch' }}>
          <div className="row" style={{ gap: 8, marginBottom: 4 }}>
            <span style={{ color: 'var(--marigold)' }}><Icon.spark size={15} /></span>
            <strong style={{ fontSize: 14 }}>{count} transactions the rules could not place</strong>
          </div>
          <p className="small">
            Strings like <span className="mono">RAZ*ORPGWAY LTD</span> and <span className="mono">BBPS BILLDESK 40219</span> are
            payment-gateway noise, not merchants. The AI engine reads them and assigns a category with a confidence score —
            anything under 60% is flagged rather than silently accepted.
          </p>
        </div>
        <button className="btn" onClick={runIt} disabled={running}>
          {running ? <><Icon.refresh size={14} className="spin" /> Reading…</> : <>Sort these for me</>}
        </button>
      </div>

      {result && (
        <div className="rise" style={{ marginTop: 16, borderTop: '1px solid var(--rule-2)', paddingTop: 12 }}>
          <div className="row-between" style={{ marginBottom: 8 }}>
            <span className="eyebrow">{result.updated} sorted</span>
            <SourcePill source={result.source} fallback={result.fallback} />
          </div>
          {result.items?.map((i) => (
            <div key={i.id} className="row-between" style={{ padding: '5px 0', fontSize: 12.5 }}>
              <span className="row" style={{ gap: 8 }}>
                <i className="dot" style={{ background: inkFor(i.category) }} />{i.category}
                <span className="small">{i.reason}</span>
              </span>
              <span className={`chip chip-static ${i.confidence < 0.6 ? 'chip-warn' : 'chip-good'}`}>
                {Math.round(i.confidence * 100)}% sure
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

/* ---------------------------------------------------------------- monthly review */

function Review({ month }) {
  const { data, loading, error } = useFetch(`/api/ai/review?month=${month}`, [month])
  const bits = useMemo(() => [
    ['What went well', data?.won, 'callout-forest'],
    ['What slipped', data?.slipped, 'callout-warn'],
    ['Next month', data?.nextMonth, ''],
  ], [data])

  return (
    <Card title={`${monthName(month, true)} in a sentence`} action={data && <SourcePill source={data.source} fallback={data.fallback} />}>
      {loading && <Loading lines={4} label="Reading the month…" />}
      {error && <p className="callout callout-warn">{error}</p>}
      {data && (
        <>
          <p style={{ fontSize: 14.5, lineHeight: 1.65 }}>{data.story}</p>
          <div className="stack" style={{ gap: 12, marginTop: 14 }}>
            {bits.filter(([, v]) => v).map(([label, value, cls]) => (
              <div key={label}>
                <div className="eyebrow" style={{ marginBottom: 4 }}>{label}</div>
                <p className={`callout ${cls}`} style={{ fontSize: 13 }}>{value}</p>
              </div>
            ))}
          </div>
          {data.streak && <div className="chip chip-good chip-static" style={{ marginTop: 12 }}><Icon.spark size={12} /> {data.streak}</div>}
          <p className="small" style={{ marginTop: 14 }}>
            Written from the totals only — no individual transaction leaves this machine. <Term of="Transaction categorisation">How sorting works</Term>
          </p>
        </>
      )}
    </Card>
  )
}
