import { useState } from 'react'
import { api, inr, monthName, useAction } from '../lib/util'
import { Card, Icon, Stat, Term, Why } from '../components/ui'
import { Bar } from '../components/charts'

const KIND = {
  bank: { label: 'Bank', ink: 'var(--forest)', note: 'Where salary lands' },
  savings: { label: 'Savings', ink: 'var(--forest-2)', note: 'Kept apart on purpose' },
  upi: { label: 'UPI', ink: 'var(--marigold)', note: 'Day-to-day wallet' },
  card: { label: 'Credit', ink: 'var(--terracotta)', note: 'Owed, not owned' },
  invest: { label: 'Invested', ink: 'var(--slate)', note: 'Long horizon' },
}

export default function Money({ state, reload, go }) {
  const { accounts, bills, goals, summary, month, profile, health } = state

  const assets = accounts.filter((a) => a.balance > 0).reduce((s, a) => s + a.balance, 0)
  const debts = -accounts.filter((a) => a.balance < 0).reduce((s, a) => s + a.balance, 0)
  const net = assets - debts
  const monthlyBills = bills.reduce((s, b) => s + b.amount, 0)

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Everything in one place</div>
          <h1 className="page-title" style={{ marginTop: 6 }}>Your money, all of it</h1>
          <p className="page-sub">
            Five accounts, one page. This is the whole point of the app — you should never have to open four banking
            apps to answer "how am I doing".
          </p>
        </div>
        <div className="small" style={{ textAlign: 'right' }}>
          Last synced<br /><span className="mono">{accounts[0]?.synced_at?.slice(0, 16).replace('T', ' ')}</span>
        </div>
      </header>

      <div className="grid g3" style={{ marginBottom: 20 }}>
        <Card>
          <Stat label="Net worth" value={inr(net)} sub={`${inr(assets)} held · ${inr(debts)} owed`} />
          <div style={{ marginTop: 12 }}><Bar value={assets - debts} max={assets} /></div>
        </Card>
        <Card>
          <Stat label="Fixed monthly commitments" value={inr(monthlyBills)}
            sub={`${Math.round((monthlyBills / profile.monthly_income) * 100)}% of take-home`} />
          <div className="small" style={{ marginTop: 10 }}>
            Under 50% is the usual comfort line for <Term of="Fixed costs ratio">fixed costs</Term>.
          </div>
        </Card>
        <Card>
          <Stat label="Emergency cover" value={`${health.monthsCovered.toFixed(1)} months`}
            sub={`of your ${inr(summary.spend || profile.monthly_income * 0.7)} monthly outgoings`} />
          <div style={{ marginTop: 12 }}>
            <Bar value={health.monthsCovered} max={6} ink={health.monthsCovered < 3 ? 'var(--terracotta)' : 'var(--forest)'} />
          </div>
        </Card>
      </div>

      <div className="grid g-main">
        <Card title="Accounts" action={<span className="small">read-only access</span>}>
          <table className="ledger">
            <thead><tr><th>Account</th><th>Type</th><th>Identifier</th><th className="r">Balance</th></tr></thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div style={{ fontSize: 13 }}>{a.name}</div>
                    <div className="small">{a.institution}</div>
                  </td>
                  <td>
                    <span className="chip chip-static" style={{ color: KIND[a.kind]?.ink }}>
                      <i className="dot" style={{ background: KIND[a.kind]?.ink }} />{KIND[a.kind]?.label}
                    </span>
                  </td>
                  <td className="mono small">{a.masked}</td>
                  <td className="r" style={{ color: a.balance < 0 ? 'var(--terracotta)' : 'var(--ink)', fontWeight: 500 }}>
                    {a.balance < 0 ? '−' : ''}{inr(a.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small" style={{ marginTop: 14 }}>
            PaisaPath can read these accounts and nothing else. It has no permission to move money, and there is no
            code path that could. <button className="why" onClick={() => go('trust')}>See the permission list</button>
          </p>
        </Card>

        <div className="stack">
          <Card title="Recurring commitments" action={<span className="small">{monthName(month, true)}</span>}>
            {bills.map((b) => <BillRow key={b.id} b={b} reload={reload} />)}
            <div className="row-between" style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--rule)' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Every month</span>
              <span className="mono" style={{ fontWeight: 600 }}>{inr(monthlyBills)}</span>
            </div>
          </Card>

          <Card title="Committed to goals">
            {goals.map((g) => (
              <div key={g.id} className="row-between" style={{ padding: '7px 0' }}>
                <span style={{ fontSize: 13 }}>{g.emoji} {g.name}</span>
                <span className="mono small">{inr(g.saved)} / {inr(g.target)}</span>
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => go('goals')}>Open the planner →</button>
          </Card>

          <ProfileCard profile={profile} reload={reload} />
        </div>
      </div>
    </div>
  )
}

function BillRow({ b, reload }) {
  const [toggle, pending] = useAction(async () => { await api.patch(`/api/bills/${b.id}`, { autopay: !b.autopay }); reload() })
  return (
    <div className="row-between" style={{ padding: '7px 0', borderBottom: '1px solid var(--rule-2)' }}>
      <div>
        <div style={{ fontSize: 13 }}>{b.name}</div>
        <div className="small">due on the {b.due_day}{['th', 'st', 'nd', 'rd'][b.due_day % 10 > 3 || (b.due_day > 10 && b.due_day < 14) ? 0 : b.due_day % 10]}</div>
      </div>
      <div className="row" style={{ gap: 10 }}>
        <button className={`chip ${b.autopay ? 'chip-good' : ''}`} onClick={toggle} disabled={pending}>
          {b.autopay ? <><Icon.check size={11} /> autopay</> : 'manual'}
        </button>
        <span className="mono" style={{ fontSize: 13, width: 62, textAlign: 'right' }}>{inr(b.amount)}</span>
      </div>
    </div>
  )
}

function ProfileCard({ profile, reload }) {
  const [edit, setEdit] = useState(false)
  const [form, setForm] = useState(profile)
  const [save, saving] = useAction(async () => { await api.patch('/api/profile', form); setEdit(false); reload() })

  if (!edit) {
    return (
      <Card title="About you" action={<button className="btn btn-quiet btn-sm" onClick={() => { setForm(profile); setEdit(true) }}>Edit</button>}>
        <div className="row-between" style={{ padding: '4px 0' }}><span className="small">Life stage</span><span style={{ fontSize: 13 }}>{profile.stage}</span></div>
        <div className="row-between" style={{ padding: '4px 0' }}><span className="small">Take-home</span><span className="mono" style={{ fontSize: 13 }}>{inr(profile.monthly_income)}/mo</span></div>
        <div className="row-between" style={{ padding: '4px 0' }}><span className="small">City</span><span style={{ fontSize: 13 }}>{profile.city}</span></div>
        <div style={{ marginTop: 10 }}>
          <Why claim="Why my life stage changes the advice" context={`stage=${profile.stage}, income=${profile.monthly_income}`} />
        </div>
      </Card>
    )
  }
  return (
    <Card title="About you">
      <div className="stack" style={{ gap: 12 }}>
        <div className="field"><label>Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="field"><label>Life stage</label>
          <select className="select" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
            <option value="student">Student</option><option value="professional">Working professional</option>
          </select>
        </div>
        <div className="field"><label>Monthly take-home (₹)</label><input className="input mono" type="number" value={form.monthly_income} onChange={(e) => setForm({ ...form, monthly_income: e.target.value })} /></div>
        <div className="field"><label>City</label><input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={save} disabled={saving}>Save</button>
          <button className="btn btn-ghost" onClick={() => setEdit(false)}>Cancel</button>
        </div>
      </div>
    </Card>
  )
}
