import { useState } from 'react'
import { api, inr, monthName, useAction } from '../lib/util'
import { Card, Icon, Stat, Term, Why } from '../components/ui'
import { Bar } from '../components/charts'

export default function Goals({ state, reload }) {
  const { goals, goalPlans, profile, goalContrib, health, order } = state
  const [adding, setAdding] = useState(false)
  const emergency = goals.find((g) => g.kind === 'emergency')
  const rest = goals.filter((g) => g.kind !== 'emergency')
  const strain = goalContrib / profile.monthly_income

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Goals</div>
          <h1 className="page-title" style={{ marginTop: 6 }}>What the money is for</h1>
          <p className="page-sub">
            A goal without a monthly number is a wish. Every goal here carries the exact amount it needs each month,
            and the app tells you when they stop fitting together.
          </p>
        </div>
        <button className="btn" onClick={() => setAdding(true)}><Icon.plus size={14} /> New goal</button>
      </header>

      <div className="grid g-main">
        <div className="stack">
          {emergency && <Emergency g={emergency} plan={goalPlans[emergency.id]} health={health} reload={reload} />}
          {adding && <NewGoal onDone={() => { setAdding(false); reload() }} onCancel={() => setAdding(false)} />}
          <div className="grid g2">
            {rest.map((g) => <GoalCard key={g.id} g={g} plan={goalPlans[g.id]} reload={reload} />)}
          </div>
        </div>

        <div className="stack">
          <Card title="Do these fit together?">
            <Stat label="Every goal, every month" value={inr(goalContrib)}
              sub={`${Math.round(strain * 100)}% of your ${inr(profile.monthly_income)} take-home`} />
            <div style={{ marginTop: 12 }}>
              <Bar value={goalContrib} max={profile.monthly_income * 0.4} height={7}
                ink={strain > 0.4 ? 'var(--terracotta)' : strain > 0.28 ? 'var(--marigold)' : 'var(--forest)'} />
            </div>
            <p className={`callout ${strain > 0.4 ? 'callout-warn' : 'callout-forest'}`} style={{ marginTop: 14, fontSize: 13 }}>
              {strain > 0.4
                ? 'These goals together need more than 40% of your income. Something has to move — push a target date out rather than quietly missing all of them.'
                : strain > 0.28
                  ? 'Ambitious but reachable. One unexpected month will hurt, which is exactly what the emergency fund is for.'
                  : 'Comfortable. You could pull a target date forward or add a goal without straining the month.'}
            </p>
            <div style={{ marginTop: 12 }}>
              <Why claim="Whether my goals fit my income" context={`monthly goal load ${inr(goalContrib)} against income ${inr(profile.monthly_income)}`} />
            </div>
          </Card>

          <Card title="What to fund first">
            <p className="small" style={{ marginBottom: 12 }}>
              When money is short, this is the order the app uses — and the order it will keep recommending until the
              numbers change.
            </p>
            {order.map((o) => (
              <div key={o.rank} className="row" style={{ gap: 11, padding: '9px 0', borderTop: o.rank > 1 ? '1px solid var(--rule-2)' : 0, alignItems: 'flex-start' }}>
                <span className="num" style={{ fontSize: 17, color: 'var(--rule)', width: 16 }}>{o.rank}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{o.action}</div>
                  <div className="small" style={{ marginTop: 2 }}>{o.why}</div>
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- emergency */

function Emergency({ g, plan, health, reload }) {
  const [add, setAdd] = useState('')
  const [contribute, pending] = useAction(async () => {
    await api.patch(`/api/goals/${g.id}`, { saved: g.saved + Number(add || 0) })
    setAdd(''); reload()
  })
  const short = health.monthsCovered < 3

  return (
    <Card pad={false}>
      <div style={{ padding: '20px 22px' }}>
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="eyebrow">The one that comes first</div>
            <h2 style={{ fontFamily: 'var(--serif)', fontSize: 24, fontWeight: 500, marginTop: 6 }}>{g.emoji} {g.name}</h2>
            <p className="lede" style={{ marginTop: 8, maxWidth: '48ch' }}>
              Six months of expenses, held in cash, touched only when something breaks. It is the least exciting
              thing you will ever fund and the only one that decides whether everything else survives.
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="display" style={{ fontSize: 34, color: short ? 'var(--terracotta)' : 'var(--forest)' }}>
              {health.monthsCovered.toFixed(1)}
            </div>
            <div className="small">months covered</div>
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <Bar value={g.saved} max={g.target} height={8} ink={short ? 'var(--terracotta)' : 'var(--forest)'} />
          <div className="row-between small" style={{ marginTop: 6 }}>
            <span className="mono">{inr(g.saved)} saved</span>
            <span className="mono">target {inr(g.target)}</span>
          </div>
        </div>

        <div className="grid g3" style={{ marginTop: 18, gap: 14 }}>
          <Stat label="Still to save" value={inr(plan.remaining)} />
          <Stat label="Each month" value={inr(plan.monthly)} sub={`for ${plan.months} months`} />
          <Stat label="Which is" value={inr(plan.perDay)} sub="a day" />
        </div>

        <div className="row wrap" style={{ gap: 10, marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--rule)' }}>
          <input className="input mono" style={{ width: 140 }} type="number" placeholder="₹ add now"
            value={add} onChange={(e) => setAdd(e.target.value)} />
          <button className="btn" onClick={contribute} disabled={pending || !add}>Move to this goal</button>
          <Why claim="Why the emergency fund comes before investing" context={`${health.monthsCovered.toFixed(1)} months covered of a 6-month target`} />
        </div>
        <p className="small" style={{ marginTop: 10 }}>
          Keep this in a separate savings account, not the one your UPI is linked to.
          <Term of="Emergency fund"> Why six months?</Term>
        </p>
      </div>
    </Card>
  )
}

/* ---------------------------------------------------------------- goal card */

function GoalCard({ g, plan, reload }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(g)
  const [save, saving] = useAction(async () => { await api.patch(`/api/goals/${g.id}`, form); setEditing(false); reload() })
  const [remove] = useAction(async () => { await api.del(`/api/goals/${g.id}`); reload() })

  if (editing) {
    return (
      <Card title={`Edit ${g.name}`}>
        <div className="stack" style={{ gap: 10 }}>
          <div className="field"><label>Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Target ₹</label><input className="input mono" type="number" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} /></div>
            <div className="field" style={{ flex: 1 }}><label>Saved ₹</label><input className="input mono" type="number" value={form.saved} onChange={(e) => setForm({ ...form, saved: e.target.value })} /></div>
          </div>
          <div className="field"><label>Target month</label><input className="input" type="month" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} /></div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={save} disabled={saving}>Save</button>
            <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn btn-quiet spread" onClick={remove} aria-label="Delete goal"><Icon.trash size={14} /></button>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 19 }}>{g.emoji}</div>
          <h3 style={{ fontSize: 15, marginTop: 4, fontWeight: 600 }}>{g.name}</h3>
          <div className="small">by {monthName(g.target_date, true)}</div>
        </div>
        <button className="btn btn-quiet btn-sm" onClick={() => { setForm(g); setEditing(true) }}>Edit</button>
      </div>

      <div style={{ marginTop: 14 }}>
        <Bar value={g.saved} max={g.target} height={6} />
        <div className="row-between small" style={{ marginTop: 5 }}>
          <span className="mono">{inr(g.saved)}</span>
          <span className="mono">{Math.round(plan.pct * 100)}% of {inr(g.target)}</span>
        </div>
      </div>

      <div className="row-between" style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--rule-2)' }}>
        <div>
          <div className="stat-label">Needs each month</div>
          <div className="num" style={{ fontSize: 19 }}>{inr(plan.monthly)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="stat-label">Months left</div>
          <div className="num" style={{ fontSize: 19 }}>{plan.months}</div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <Why claim={`Saving ${inr(plan.monthly)} a month for ${g.name}`} context={`${inr(g.saved)} of ${inr(g.target)} by ${g.target_date}`} />
      </div>
    </Card>
  )
}

/* ---------------------------------------------------------------- new goal */

function NewGoal({ onDone, onCancel }) {
  const [f, setF] = useState({ name: '', target: '', saved: 0, target_date: '2027-06', emoji: '🎯' })
  const [create, pending] = useAction(async () => { await api.post('/api/goals', f); onDone() })
  return (
    <Card title="New goal" className="rise">
      <div className="row wrap" style={{ gap: 10, alignItems: 'flex-end' }}>
        <div className="field" style={{ width: 62 }}><label>Icon</label><input className="input" style={{ textAlign: 'center' }} value={f.emoji} onChange={(e) => setF({ ...f, emoji: e.target.value })} /></div>
        <div className="field" style={{ flex: 2, minWidth: 180 }}><label>What is it for?</label><input className="input" placeholder="Laptop, trip, course fee…" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="field" style={{ width: 130 }}><label>Target ₹</label><input className="input mono" type="number" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} /></div>
        <div className="field" style={{ width: 150 }}><label>By when</label><input className="input" type="month" value={f.target_date} onChange={(e) => setF({ ...f, target_date: e.target.value })} /></div>
        <button className="btn" onClick={create} disabled={pending || !f.name || !f.target}>Add</button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </Card>
  )
}
