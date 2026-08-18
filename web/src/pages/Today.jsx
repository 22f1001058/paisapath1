import { useState } from 'react'
import { api, inr, inrShort, monthName, useFetch, useAction } from '../lib/util'
import { Card, Icon, Loading, SourcePill, Stat, Term, Why } from '../components/ui'
import { AreaTrend, Bar, ScoreArc } from '../components/charts'

export default function Today({ state, go }) {
  const { profile, sts, health, summary, prevSummary, bills, milestones, month, today } = state
  const day = +today.slice(8, 10)
  const upcoming = bills.filter((b) => b.due_day >= day).slice(0, 4)
  const greeting = 'Here is where you stand'

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">{monthName(month)} · day {day}</div>
          <h1 className="page-title" style={{ marginTop: 6 }}>{greeting}, {profile.name}.</h1>
          <p className="page-sub">
            Everything below is computed from your own transactions. Nothing here is an estimate you cannot check.
          </p>
        </div>
        <button className="btn" onClick={() => go('mentor')}><Icon.mentor size={15} /> Ask the mentor</button>
      </header>

      <Nudges go={go} />

      <div className="grid g-main">
        <div className="stack">
          <SafeToSpend sts={sts} />
          <Priorities go={go} />
          <Card title={`Spending through ${monthName(month, true)}`}
            action={<button className="btn btn-quiet btn-sm" onClick={() => go('spending')}>All transactions →</button>}>
            <div className="row-between" style={{ marginBottom: 14, alignItems: 'flex-start' }}>
              <Stat label="Spent so far" value={inr(summary.spend)}
                sub={`${summary.spend > prevSummary.spend ? 'Ahead of' : 'Behind'} last month by ${inr(Math.abs(summary.spend - prevSummary.spend))}`} />
              <Stat label="Kept" value={inr(summary.net)} ink={summary.net >= 0 ? 'var(--in)' : 'var(--warn)'}
                sub={`${Math.round((summary.net / Math.max(1, summary.income)) * 100)}% of what came in`} />
              <Stat label="Transactions" value={summary.count} sub={`across ${summary.categories.length} categories`} />
            </div>
            <AreaTrend series={summary.cumulative.slice(0, day)} compare={prevSummary.cumulative}
              label={monthName(month, true)} compareLabel={`${monthName(prevSummary.month, true)} (full month)`} />
          </Card>
        </div>

        <div className="stack">
          {state.assessment && <ProfileCard assessment={state.assessment} go={go} />}
          <HealthCard health={health} />
          <Card title="Bills still to come">
            {upcoming.length === 0 && <p className="small">Every bill this month is already paid.</p>}
            {upcoming.map((b) => (
              <div key={b.id} className="row-between" style={{ padding: '7px 0', borderBottom: '1px solid var(--rule-2)' }}>
                <div>
                  <div style={{ fontSize: 13 }}>{b.name}</div>
                  <div className="small">
                    {b.due_day - day <= 0 ? 'due today' : `in ${b.due_day - day} day${b.due_day - day > 1 ? 's' : ''}`}
                    {b.autopay ? ' · autopay' : ' · manual'}
                  </div>
                </div>
                <span className="mono" style={{ fontSize: 13 }}>{inr(b.amount)}</span>
              </div>
            ))}
            <div className="small" style={{ marginTop: 12 }}>
              {bills.filter((b) => !b.autopay).length} bills are still manual. <Term of="Autopay">Autopay</Term> removes the late fee risk.
            </div>
          </Card>

          <Card title="Worth celebrating">
            {milestones.slice(0, 4).map((m) => (
              <div key={m.id} className="row" style={{ gap: 10, padding: '7px 0', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--marigold)', marginTop: 1 }}><Icon.spark size={14} /></span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{m.title}</div>
                  <div className="small">{m.body}</div>
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- nudges */

const SEVERITY = {
  act: { ink: 'var(--terracotta)', label: 'worth doing now' },
  watch: { ink: 'var(--marigold)', label: 'worth a look' },
  good: { ink: 'var(--forest)', label: 'good moment' },
}

function Nudges({ go }) {
  const { data, loading, reload } = useFetch('/api/nudges')
  const [dismiss] = useAction(async (id) => { await api.post(`/api/nudges/${encodeURIComponent(id)}/dismiss`); reload() })

  if (loading || !data?.nudges?.length) return null

  return (
    <div className="stack" style={{ gap: 10, marginBottom: 22 }}>
      {data.nudges.slice(0, 3).map((n) => {
        const sev = SEVERITY[n.severity] || SEVERITY.watch
        return (
          <div key={n.id} className="card rise" style={{ borderLeft: `2px solid ${sev.ink}`, padding: '13px 18px' }}>
            <div className="row-between wrap" style={{ gap: 14, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="row" style={{ gap: 8, marginBottom: 3 }}>
                  <span className="eyebrow" style={{ color: sev.ink }}>{sev.label}</span>
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: '-0.01em' }}>{n.title}</div>
                <p style={{ marginTop: 4, color: 'var(--ink-2)', maxWidth: '74ch' }}>{n.body}</p>
                <p className="small" style={{ marginTop: 6 }}><strong>What triggered this:</strong> {n.evidence}</p>
              </div>
              <div className="row" style={{ gap: 8, flex: 'none' }}>
                {n.cta && <button className="btn btn-ghost btn-sm" onClick={() => go(n.cta.route)}>{n.cta.label}</button>}
                <button className="btn btn-quiet btn-sm" onClick={() => dismiss(n.id)} aria-label="Dismiss">
                  <Icon.close size={13} />
                </button>
              </div>
            </div>
          </div>
        )
      })}
      {data.nudges.length > 3 && (
        <div className="small" style={{ paddingLeft: 18 }}>
          {data.nudges.length - 3} more, held back so this screen stays readable.
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- safe to spend */

function SafeToSpend({ sts }) {
  const [open, setOpen] = useState(false)
  return (
    <Card pad={false}>
      <div style={{ padding: '22px 24px 20px' }}>
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="eyebrow">Safe to spend</div>
            <div className="display" style={{ fontSize: 58, marginTop: 8, color: 'var(--forest)' }}>{inr(sts.safe)}</div>
            <p className="lede" style={{ marginTop: 10, maxWidth: '42ch' }}>
              That is what is left after this month's bills, savings and everything you have already spent —
              about <strong className="mono">{inr(sts.perDay)}</strong> a day for the {sts.daysLeft} days remaining.
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="stat-label">Already spent</div>
            <div className="num" style={{ fontSize: 22 }}>{inr(sts.spentSoFar)}</div>
            <div className="small" style={{ marginTop: 8 }}>of {inr(sts.income)} in</div>
            <div style={{ width: 120, marginTop: 6 }}>
              <Bar value={sts.spentSoFar} max={sts.income} ink="var(--marigold)" />
            </div>
          </div>
        </div>

        <div className="row wrap" style={{ gap: 14, marginTop: 18 }}>
          <button className="why" onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide the arithmetic' : 'Show me the arithmetic'}
          </button>
          <Why claim="Your Safe-to-Spend figure" context="Shown as the primary number on the Today screen" />
        </div>

        {open && (
          <div className="rise" style={{ marginTop: 16, borderTop: '1px solid var(--rule)', paddingTop: 14 }}>
            <table className="ledger">
              <tbody>
                {sts.ledger.map((l) => (
                  <tr key={l.label}>
                    <td style={{ fontSize: 13 }}>{l.label}</td>
                    <td className="r" style={{ color: l.amount < 0 ? 'var(--ink-2)' : 'var(--in)' }}>
                      {l.sign} {inr(l.amount)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td style={{ fontWeight: 600, paddingTop: 12 }}>Safe to spend</td>
                  <td className="r" style={{ fontWeight: 700, paddingTop: 12, color: 'var(--forest)' }}>{inr(sts.safe)}</td>
                </tr>
              </tbody>
            </table>
            <p className="small" style={{ marginTop: 12 }}>
              Bills that have not been charged yet are reserved in full, not averaged across the month.
              That makes this number deliberately cautious — it is meant to be a floor you can trust, not a target.
            </p>
          </div>
        )}
      </div>
    </Card>
  )
}

/* ---------------------------------------------------------------- AI priorities */

function Priorities({ go }) {
  const { data, loading, error, reload } = useFetch('/api/ai/priorities')
  const [refresh, refreshing] = useAction(() => api.get('/api/ai/priorities?refresh=1').then(reload))

  return (
    <Card
      title="Your next three moves"
      action={
        <div className="row" style={{ gap: 8 }}>
          {data && <SourcePill source={data.source} fallback={data.fallback} />}
          <button className="btn btn-quiet btn-sm" onClick={refresh} disabled={refreshing || loading}>
            <Icon.refresh size={13} className={refreshing ? 'spin' : ''} /> Rethink
          </button>
        </div>
      }
    >
      {(loading || refreshing) && <Loading lines={4} label="Working through your numbers…" />}
      {error && <p className="callout callout-warn">{error}</p>}

      {data && !refreshing && (
        <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {data.steps?.map((s, i) => (
            <li key={i} style={{ padding: '14px 0', borderTop: i ? '1px solid var(--rule-2)' : 0 }}>
              <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                <span className="num" style={{ fontSize: 22, color: 'var(--rule)', lineHeight: 1, width: 22, flex: 'none' }}>{i + 1}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="row-between" style={{ alignItems: 'flex-start', gap: 12 }}>
                    <h4 style={{ fontSize: 15.5, fontFamily: 'var(--serif)', fontWeight: 600 }}>{s.title}</h4>
                    {s.effort && <span className="chip chip-static">{s.effort}</span>}
                  </div>
                  <p style={{ marginTop: 5, color: 'var(--ink-2)' }}>{s.body}</p>
                  <p className="callout callout-forest" style={{ marginTop: 9 }}>{s.why}</p>
                  <div className="row wrap" style={{ gap: 14, marginTop: 10 }}>
                    <Why claim={s.title} context={`${s.body} — ${s.why}`} />
                    {s.risk && <span className="small">⚠ {s.risk}</span>}
                  </div>
                  {s.alternative && (
                    <div className="small" style={{ marginTop: 6 }}><strong>Smaller version:</strong> {s.alternative}</div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      {data?.fallback && (
        <p className="small" style={{ marginTop: 14, borderTop: '1px solid var(--rule-2)', paddingTop: 10 }}>
          The AI engine did not answer, so the built-in rules wrote this instead. The ordering is identical — only the
          wording would have differed. <button className="why" onClick={() => go('trust')}>See what happened</button>
        </p>
      )}
    </Card>
  )
}

/* ---------------------------------------------------------------- health */

function ProfileCard({ assessment, go }) {
  const { profile, scores } = assessment
  const [open, setOpen] = useState(false)
  return (
    <Card title="Your profile" action={<button className="btn btn-quiet btn-sm" onClick={() => go('start')}>Retake</button>}>
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 26, lineHeight: 1 }}>{profile.emoji}</span>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontFamily: 'var(--serif)', fontSize: 19, fontWeight: 500, color: 'var(--forest)' }}>{profile.name}</h3>
          <p className="small" style={{ marginTop: 3, fontStyle: 'italic' }}>{profile.tagline}</p>
        </div>
      </div>

      <div className="stack" style={{ gap: 9, marginTop: 14 }}>
        {[['capacity', 'Capacity'], ['appetite', 'Risk appetite'], ['awareness', 'Awareness']].map(([k, label]) => (
          <div key={k} className="row" style={{ gap: 10 }}>
            <span className="small" style={{ width: 84, flex: 'none' }}>{label}</span>
            <Bar value={scores[k]} max={100} height={5}
              ink={scores[k] > 66 ? 'var(--forest)' : scores[k] > 33 ? 'var(--marigold)' : 'var(--terracotta)'} />
            <span className="mono small" style={{ width: 24, textAlign: 'right' }}>{scores[k]}</span>
          </div>
        ))}
      </div>

      <div className="row wrap" style={{ gap: 14, marginTop: 14 }}>
        <button className="why" onClick={() => setOpen(!open)}>{open ? 'Hide the reasoning' : 'Why this profile?'}</button>
        <Why claim={`Your profile: ${profile.name}`} context={profile.reasons.join(' ')} />
      </div>

      {open && (
        <div className="rise" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--rule-2)' }}>
          <ul style={{ margin: 0, paddingLeft: 17 }}>
            {profile.reasons.map((r, i) => <li key={i} className="small" style={{ marginBottom: 4 }}>{r}</li>)}
          </ul>
          <p className="callout callout-warn" style={{ fontSize: 13, marginTop: 10 }}>{profile.watch}</p>
          <p className="small" style={{ marginTop: 8 }}><strong>What moves you out of it:</strong> {profile.exit}</p>
        </div>
      )}
    </Card>
  )
}

function HealthCard({ health }) {
  const [openKey, setOpenKey] = useState(null)
  const selfReported = health.basis === 'self-reported'
  return (
    <Card title="Financial health"
      action={selfReported
        ? <span className="chip chip-note chip-static" title="Built from your questionnaire answers, not your transactions">self-reported</span>
        : <span className="chip chip-static" title="Computed from your actual transactions">measured</span>}>
      <div style={{ display: 'grid', placeItems: 'center', paddingBottom: 6 }}>
        <ScoreArc score={health.total} band={health.band} />
      </div>
      <div>
        {health.pillars.map((p) => (
          <div key={p.key}>
            <button
              className="meter"
              style={{ width: '100%', background: 'none', border: 0, borderBottom: '1px solid var(--rule-2)', cursor: 'pointer', textAlign: 'left', padding: '9px 0' }}
              onClick={() => setOpenKey(openKey === p.key ? null : p.key)}
              aria-expanded={openKey === p.key}
            >
              <span style={{ fontSize: 12.5 }}>{p.label}</span>
              <Bar value={p.score} max={1} ink={p.score > 0.66 ? 'var(--forest)' : p.score > 0.33 ? 'var(--marigold)' : 'var(--terracotta)'} />
              <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', width: 30, textAlign: 'right' }}>{Math.round(p.score * p.weight)}/{p.weight}</span>
            </button>
            {openKey === p.key && (
              <div className="rise" style={{ padding: '4px 0 12px' }}>
                <div className="small" style={{ marginBottom: 5 }}>{p.detail}</div>
                <p className="callout" style={{ fontSize: 13 }}>{p.reason}</p>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="row-between" style={{ marginTop: 14 }}>
        <Why claim={`Your financial health score of ${health.total} out of 100`} context={health.pillars.map((p) => `${p.label}: ${p.detail}`).join('; ')} />
        <span className="small">Weighted across five pillars</span>
      </div>
      {selfReported && (
        <p className="small" style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--rule-2)' }}>
          Built from your questionnaire answers, because there is not enough transaction history to measure yet.
          It switches to a measured score on its own — and the two may disagree, which is worth knowing rather than hiding.
        </p>
      )}
    </Card>
  )
}
