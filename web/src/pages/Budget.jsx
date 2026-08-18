import { useState } from 'react'
import { api, inr, inkFor, monthName, useAction } from '../lib/util'
import { Card, Icon, Loading, SourcePill, Stat, Term, Why } from '../components/ui'
import { Bar } from '../components/charts'

const BUCKETS = {
  fixed: { label: 'Has to be paid', note: 'Rent, bills, insurance — decided once, then automatic.' },
  flexible: { label: 'Up to you', note: 'Where every realistic saving actually comes from.' },
  future: { label: 'Future you', note: 'Savings and investments. Treated as a bill, not a leftover.' },
}

export default function Budget({ state, reload }) {
  const { budget, summary, profile, month, budgetNotes } = state
  const [gen, setGen] = useState(budgetNotes)
  const [rows, setRows] = useState(budget)

  const [generate, generating] = useAction(async (stage) => {
    const r = await api.post('/api/ai/budget', { stage })
    setGen(r); reload()
    const fresh = await api.get(`/api/state?month=${month}`)
    setRows(fresh.budget)
  })

  const live = rows.length ? rows : budget
  const spentBy = Object.fromEntries(summary.categories.map((c) => [c.category, c.amount]))
  const total = live.reduce((s, r) => s + r.amount, 0)
  const spent = live.reduce((s, r) => s + Math.min(r.amount, spentBy[r.category] || 0), 0)

  if (!live.length) {
    return (
      <div className="page">
        <Head profile={profile} />
        <Card>
          <div style={{ maxWidth: '58ch', padding: '18px 0' }}>
            <h3 style={{ fontFamily: 'var(--serif)', fontSize: 21, fontWeight: 500 }}>You do not have to build this.</h3>
            <p className="lede" style={{ marginTop: 8 }}>
              Most budgeting apps hand you an empty table and a cursor. This one reads your last three months, starts
              from a template for your life stage, and bends it toward what you actually spend — then lets you argue
              with it.
            </p>
            <div className="row wrap" style={{ gap: 10, marginTop: 18 }}>
              <button className="btn" onClick={() => generate('professional')} disabled={generating}>
                {generating ? <><Icon.refresh size={14} className="spin" /> Building…</> : <>Build my budget</>}
              </button>
              <button className="btn btn-ghost" onClick={() => generate('student')} disabled={generating}>
                Use the student template instead
              </button>
            </div>
            <p className="small" style={{ marginTop: 14 }}>
              The amounts come from a rule engine on this machine. The AI engine only writes the note explaining each
              line. <Term of="Zero-based budgeting">What is a budget, actually?</Term>
            </p>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="page">
      <Head profile={profile} action={
        <button className="btn btn-ghost btn-sm" onClick={() => generate(profile.stage)} disabled={generating}>
          <Icon.refresh size={13} className={generating ? 'spin' : ''} /> Rebuild
        </button>
      } />

      {gen && (
        <Card className="rise" style={{ marginBottom: 20 }}>
          <div className="row-between" style={{ marginBottom: 8 }}>
            <span className="eyebrow">The shape of this budget</span>
            <SourcePill source={gen.source} fallback={gen.fallback} />
          </div>
          <p style={{ fontSize: 15.5, fontFamily: 'var(--serif)', lineHeight: 1.5 }}>{gen.headline}</p>
          {gen.tradeoff && <p className="callout callout-warn" style={{ marginTop: 10 }}><strong>The uncomfortable bit:</strong> {gen.tradeoff}</p>}
        </Card>
      )}

      <div className="grid g-main">
        <Card title={`${monthName(month)} plan`} action={<span className="small">tap any amount to change it</span>}>
          {Object.entries(BUCKETS).map(([bucket, meta]) => {
            const items = live.filter((r) => r.bucket === bucket)
            if (!items.length) return null
            const sub = items.reduce((s, r) => s + r.amount, 0)
            return (
              <div key={bucket} style={{ marginBottom: 22 }}>
                <div className="row-between" style={{ marginBottom: 8 }}>
                  <div>
                    <div className="eyebrow">{meta.label}</div>
                    <div className="small">{meta.note}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="mono" style={{ fontSize: 14, fontWeight: 600 }}>{inr(sub)}</div>
                    <div className="small">{Math.round((sub / total) * 100)}% of plan</div>
                  </div>
                </div>
                <table className="ledger">
                  <tbody>
                    {items.map((r) => (
                      <BudgetRow key={r.id} r={r} spent={spentBy[r.category] || 0} note={gen?.notes?.[r.category]}
                        onSaved={async (amount) => { await api.patch(`/api/budget/${r.id}`, { amount }); setRows(live.map((x) => (x.id === r.id ? { ...x, amount } : x))) }} />
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </Card>

        <div className="stack">
          <Card title="Does it add up?">
            <Stat label="Planned each month" value={inr(total)}
              sub={total > profile.monthly_income
                ? `${inr(total - profile.monthly_income)} more than you earn`
                : `${inr(profile.monthly_income - total)} unallocated`} />
            <div style={{ marginTop: 12 }}>
              <Bar value={total} max={profile.monthly_income} ink={total > profile.monthly_income ? 'var(--terracotta)' : 'var(--forest)'} height={7} />
            </div>
            <div className="row-between small" style={{ marginTop: 6 }}>
              <span>planned</span><span>take-home {inr(profile.monthly_income)}</span>
            </div>

            <hr className="rule" style={{ margin: '16px 0' }} />

            <Stat label="Used so far this month" value={inr(spent)} sub={`${Math.round((spent / Math.max(1, total)) * 100)}% of the plan`} />
            <div style={{ marginTop: 12 }}><Bar value={spent} max={total} ink="var(--marigold)" height={7} /></div>

            <div style={{ marginTop: 16 }}>
              <Why claim="How this budget was built" context={`stage=${profile.stage}, income=${profile.monthly_income}, total=${total}`} />
            </div>
          </Card>

          <Card title="Where it is going wrong">
            {live.map((r) => ({ r, over: (spentBy[r.category] || 0) - r.amount }))
              .filter((x) => x.over > 0).sort((a, b) => b.over - a.over).slice(0, 4)
              .map(({ r, over }) => (
                <div key={r.id} className="row-between" style={{ padding: '7px 0', borderBottom: '1px solid var(--rule-2)' }}>
                  <span className="row" style={{ gap: 8, fontSize: 13 }}>
                    <i className="dot" style={{ background: inkFor(r.category) }} />{r.category}
                  </span>
                  <span className="mono" style={{ fontSize: 12.5, color: 'var(--terracotta)' }}>+{inr(over)} over</span>
                </div>
              ))}
            {!live.some((r) => (spentBy[r.category] || 0) > r.amount) && (
              <p className="small">Nothing is over its line this month.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

const Head = ({ profile, action }) => (
  <header className="page-head">
    <div>
      <div className="eyebrow">Budget</div>
      <h1 className="page-title" style={{ marginTop: 6 }}>A plan you did not have to write</h1>
      <p className="page-sub">
        Built for a {profile.stage === 'student' ? 'student' : 'working professional'} in {profile.city},
        from your own three-month averages. Every line is editable — it is a starting point, not a verdict.
      </p>
    </div>
    {action}
  </header>
)

function BudgetRow({ r, spent, note, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(r.amount)
  const over = spent > r.amount

  return (
    <tr>
      <td style={{ width: '38%' }}>
        <div className="row" style={{ gap: 8 }}>
          <i className="dot" style={{ background: inkFor(r.category) }} />
          <span style={{ fontSize: 13 }}>{r.category}</span>
        </div>
        {note && <div className="small" style={{ marginTop: 3, paddingLeft: 15, maxWidth: '46ch' }}>{note}</div>}
      </td>
      <td>
        <Bar value={spent} max={r.amount} ink={over ? 'var(--terracotta)' : inkFor(r.category)} height={4} />
        <div className="small" style={{ marginTop: 3 }}>{inr(spent)} used{over ? ` · ${inr(spent - r.amount)} over` : ''}</div>
      </td>
      <td className="r" style={{ width: 120 }}>
        {editing ? (
          <input className="input mono" style={{ width: 100, textAlign: 'right', padding: '3px 7px' }} type="number" autoFocus
            value={val} onChange={(e) => setVal(+e.target.value)}
            onBlur={() => { setEditing(false); if (val !== r.amount) onSaved(val) }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
        ) : (
          <button className="mono" style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 13, borderBottom: '1px dotted var(--rule)' }}
            onClick={() => setEditing(true)}>{inr(r.amount)}</button>
        )}
        {r.origin === 'user' && <div className="small" style={{ fontSize: 10 }}>edited by you</div>}
      </td>
    </tr>
  )
}
