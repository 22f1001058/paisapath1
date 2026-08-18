import { useMemo, useState } from 'react'
import { api, inr, useAction, useFetch } from '../lib/util'
import { Card, Icon, Loading, SourcePill, Term } from '../components/ui'
import { Bar, ScoreArc } from '../components/charts'

/* The onboarding questionnaire.

   Every question is rendered from the data the server hands back, so there is no
   per-question JSX to keep in sync with the scoring. Four sections, then the
   profile, then the salary split. Nothing is written until the very last screen. */

const GOAL_IDEAS = [
  { emoji: '📱', name: 'New phone', target: 45000, months: 10 },
  { emoji: '💻', name: 'Laptop', target: 80000, months: 14 },
  { emoji: '🏔️', name: 'A trip', target: 60000, months: 12 },
  { emoji: '🎓', name: 'Higher studies', target: 400000, months: 36 },
  { emoji: '🛵', name: 'Two-wheeler', target: 120000, months: 18 },
  { emoji: '🎁', name: 'Something for family', target: 30000, months: 8 },
]

export default function Onboard({ reload, go }) {
  const { data, loading } = useFetch('/api/onboard/questions')
  const [step, setStep] = useState(0)
  const [a, setA] = useState({})
  const [picked, setPicked] = useState([])
  const [assessment, setAssessment] = useState(null)
  const [note, setNote] = useState(null)
  const [split, setSplit] = useState(null)
  const [plan, setPlan] = useState(null)

  const sections = data?.sections ?? []
  const qFor = (key) => (data?.questions ?? []).filter((q) => q.section === key)
  // sections, then the profile reveal, then the split
  const steps = [...sections.map((s) => ({ kind: 'section', ...s })), { kind: 'profile' }, { kind: 'split' }]
  const cur = steps[step]

  const missing = useMemo(() => {
    if (cur?.kind !== 'section') return []
    return qFor(cur.key).filter((q) => q.required && (a[q.id] == null || a[q.id] === ''))
  }, [cur, a, data])

  const [reveal, revealing] = useAction(async () => {
    const r = await api.post('/api/onboard/assess', { answers: a })
    setAssessment(r)
    setStep(sections.length)
    api.post('/api/ai/profile-note', { answers: a, assessment: r }).then(setNote).catch(() => {})
  })

  const [loadSplit, loadingSplit] = useAction(async () => {
    const qs = new URLSearchParams({
      income: a.income || 0,
      stage: a.stage === 'student' ? 'student' : 'professional',
      ...(a.rent && { rent: a.rent }),
    })
    const r = await api.get(`/api/onboard/split?${qs}`)
    setSplit(r.split)
    setStep(sections.length + 1)
    api.post('/api/ai/onboard-plan', { stage: a.stage, city: a.city, income: +a.income, split: r.split })
      .then(setPlan).catch(() => {})
  })

  const [finish, finishing] = useAction(async () => {
    await api.post('/api/onboard', {
      answers: a, payDay: 1, split,
      goals: picked.map((g) => ({ name: g.name, target: g.target, emoji: g.emoji, priority: 3, target_date: monthsFromNow(g.months) })),
    })
    reload()
    go('today')
  })

  if (loading || !data) return <div className="page"><Loading lines={6} label="Loading the questions…" /></div>

  const answered = Object.keys(a).filter((k) => a[k] !== '' && a[k] != null).length
  const total = data.questions.length

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <header style={{ marginBottom: 26 }}>
        <div className="row-between">
          <div className="eyebrow">
            {cur.kind === 'section' ? `Step ${step + 1} of ${steps.length} · ${cur.title}`
              : cur.kind === 'profile' ? 'Your profile' : 'Your plan'}
          </div>
          {cur.kind === 'section' && <div className="small mono">{answered}/{total} answered</div>}
        </div>
        <h1 className="page-title" style={{ marginTop: 6 }}>
          {cur.kind === 'section' ? cur.title
            : cur.kind === 'profile' ? 'This is where you stand today.'
              : 'And here is where your salary goes.'}
        </h1>
        <p className="page-sub">
          {cur.kind === 'section' ? cur.blurb
            : cur.kind === 'profile' ? 'Worked out from your answers by a rule you can read, not by a model guessing at you.'
              : 'Drag anything that looks wrong. This is a starting position, not a verdict.'}
        </p>
        <div className="row" style={{ gap: 5, marginTop: 16 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ height: 3, flex: 1, borderRadius: 2, background: i <= step ? 'var(--forest)' : 'var(--rule)', transition: 'background .3s' }} />
          ))}
        </div>
      </header>

      {cur.kind === 'section' && (
        <Card>
          <div className="stack" style={{ gap: 26 }}>
            {qFor(cur.key).map((q, i) => (
              <Question key={q.id} q={q} n={i + 1} value={a[q.id]} onChange={(v) => setA({ ...a, [q.id]: v })} />
            ))}
          </div>
        </Card>
      )}

      {cur.kind === 'profile' && (
        <div className="stack">
          {revealing && <Card><Loading lines={5} label="Working out your profile…" /></Card>}
          {assessment && <ProfileReveal assessment={assessment} note={note} />}
          <Card title="What are you saving towards?">
            <div className="row wrap" style={{ gap: 10 }}>
              {GOAL_IDEAS.map((g) => {
                const on = picked.some((p) => p.name === g.name)
                return (
                  <button key={g.name} className={`chip ${on ? 'chip-good' : ''}`} style={{ padding: '8px 13px', fontSize: 13 }}
                    onClick={() => setPicked(on ? picked.filter((p) => p.name !== g.name) : [...picked, g])}>
                    {on ? <Icon.check size={12} /> : <span>{g.emoji}</span>} {g.name}
                    <span className="muted mono" style={{ fontSize: 11 }}>{inr(g.target)}</span>
                  </button>
                )
              })}
            </div>
            <p className="small" style={{ marginTop: 14 }}>
              Optional. An emergency fund is set up either way — it is the one everything else depends on.
            </p>
          </Card>
        </div>
      )}

      {cur.kind === 'split' && (
        <div className="stack">
          {loadingSplit && <Card><Loading lines={5} label="Working out a starting split…" /></Card>}
          {split && <SplitEditor split={split} income={+a.income || 0} onChange={setSplit} plan={plan} />}
        </div>
      )}

      <div className="row-between wrap" style={{ marginTop: 24, gap: 12 }}>
        <button className="btn btn-ghost" onClick={() => (step === 0 ? go('today') : setStep(step - 1))}>
          {step === 0 ? 'Not now' : 'Back'}
        </button>

        <div className="row" style={{ gap: 12 }}>
          {cur.kind === 'section' && missing.length > 0 && (
            <span className="small">{missing.length} still to answer</span>
          )}
          {cur.kind === 'section' && (
            <button className="btn" disabled={missing.length > 0 || revealing}
              onClick={() => (step === sections.length - 1 ? reveal() : setStep(step + 1))}>
              {step === sections.length - 1 ? 'See my profile' : 'Continue'}
            </button>
          )}
          {cur.kind === 'profile' && <button className="btn" disabled={loadingSplit} onClick={loadSplit}>Build my plan</button>}
          {cur.kind === 'split' && (
            <button className="btn" disabled={finishing || !split} onClick={finish}>
              {finishing ? 'Setting up…' : 'Use this plan'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- question */

function Question({ q, n, value, onChange }) {
  return (
    <div>
      <div className="row" style={{ gap: 10, alignItems: 'flex-start', marginBottom: q.help ? 4 : 9 }}>
        <span className="num" style={{ fontSize: 15, color: 'var(--rule)', width: 20, flex: 'none', lineHeight: 1.4 }}>{n}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <label htmlFor={q.id} style={{ fontSize: 14.5, fontWeight: 500, letterSpacing: '-0.005em' }}>
            {q.label}{!q.required && <span className="muted" style={{ fontWeight: 400 }}> · optional</span>}
          </label>
          {q.help && <p className="small" style={{ marginTop: 3, marginBottom: 9, maxWidth: '62ch' }}>{q.help}</p>}

          {q.type === 'choice' ? (
            <div className="stack" style={{ gap: 6 }}>
              {q.options.map((o) => (
                <button key={o.value} onClick={() => onChange(o.value)}
                  aria-pressed={value === o.value}
                  style={{
                    textAlign: 'left', padding: '9px 13px', fontSize: 13.5, cursor: 'pointer',
                    borderRadius: 'var(--radius)', transition: 'background .12s, border-color .12s',
                    border: `1px solid ${value === o.value ? 'var(--forest)' : 'var(--rule)'}`,
                    background: value === o.value ? 'var(--forest-3)' : 'var(--card)',
                    color: value === o.value ? 'var(--forest)' : 'var(--ink-2)',
                    fontWeight: value === o.value ? 600 : 400,
                  }}>
                  {o.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="row" style={{ gap: 8 }}>
              {q.prefix && <span className="muted mono" style={{ fontSize: 15 }}>{q.prefix}</span>}
              <input
                id={q.id} className={`input ${q.type === 'number' ? 'mono' : ''}`}
                type={q.type === 'date' ? 'date' : q.type === 'number' ? 'number' : 'text'}
                value={value ?? ''} placeholder={q.placeholder} min={q.min} max={q.max}
                onChange={(e) => onChange(e.target.value)}
                style={{ maxWidth: q.type === 'text' ? 340 : 240 }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- profile reveal */

const AXES = [
  { key: 'capacity', label: 'Capacity to absorb a shock', note: 'Buffer, fixed costs, dependants and how steady your income is.' },
  { key: 'appetite', label: 'Appetite for risk', note: 'What you said you would actually do, not what sounds disciplined.' },
  { key: 'awareness', label: 'Financial awareness', note: 'Six questions with real answers.' },
]

function ProfileReveal({ assessment, note }) {
  const { profile, scores, health } = assessment
  return (
    <>
      <Card pad={false} className="rise">
        <div style={{ padding: '24px 24px 20px' }}>
          <div className="row-between wrap" style={{ gap: 20, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 34, lineHeight: 1 }}>{profile.emoji}</div>
              <h2 className="display" style={{ fontSize: 32, marginTop: 10, color: 'var(--forest)' }}>{profile.name}</h2>
              <p className="lede" style={{ marginTop: 6, fontStyle: 'italic', maxWidth: '46ch' }}>{profile.tagline}</p>
            </div>
            <div style={{ textAlign: 'center', flex: 'none' }}>
              <ScoreArc score={health.total} band={health.band} size={150} />
              <div className="small" style={{ marginTop: -4 }}>financial health</div>
            </div>
          </div>

          <p style={{ marginTop: 16, fontSize: 14.5, lineHeight: 1.65, color: 'var(--ink-2)' }}>
            {note?.opening || profile.meaning}
          </p>

          <div className="stack" style={{ gap: 14, marginTop: 22 }}>
            {AXES.map((ax) => (
              <div key={ax.key}>
                <div className="row-between" style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{ax.label}</span>
                  <span className="mono small">{scores[ax.key]}/100</span>
                </div>
                <Bar value={scores[ax.key]} max={100} height={6}
                  ink={scores[ax.key] > 66 ? 'var(--forest)' : scores[ax.key] > 33 ? 'var(--marigold)' : 'var(--terracotta)'} />
                <div className="small" style={{ marginTop: 3 }}>{ax.note}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--rule)' }}>
            <div className="eyebrow" style={{ marginBottom: 7 }}>Why this profile and not another</div>
            <ul style={{ margin: 0, paddingLeft: 17 }}>
              {profile.reasons.map((r, i) => <li key={i} className="small" style={{ marginBottom: 4 }}>{r}</li>)}
            </ul>
          </div>
        </div>
      </Card>

      <div className="grid g2">
        <Card title="Where to start">
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {profile.first.map((s, i) => <li key={i} style={{ fontSize: 13.5, marginBottom: 7 }}>{s}</li>)}
          </ol>
          {note?.thisWeek && <p className="callout callout-forest" style={{ marginTop: 12 }}><strong>This week:</strong> {note.thisWeek}</p>}
        </Card>

        <Card title="The honest bits" action={note && <SourcePill source={note.source} fallback={note.fallback} />}>
          {note?.strength && <>
            <div className="eyebrow" style={{ marginBottom: 4 }}>What is working</div>
            <p className="callout callout-forest" style={{ fontSize: 13 }}>{note.strength}</p>
          </>}
          <div className="eyebrow" style={{ margin: '14px 0 4px' }}>What to watch</div>
          <p className="callout callout-warn" style={{ fontSize: 13 }}>{note?.blindspot || profile.watch}</p>
          <div className="eyebrow" style={{ margin: '14px 0 4px' }}>What moves you out of this profile</div>
          <p className="small">{profile.exit}</p>
        </Card>
      </div>

      {assessment.scores.gaps?.length > 0 && (
        <Card title={`${assessment.scores.gaps.length} things worth learning first`}>
          <p className="small" style={{ marginBottom: 12 }}>
            From the knowledge questions — you answered {assessment.scores.correctCount} of {assessment.scores.totalAwareness}.
            Nothing here is a judgement; it is just the shortest path to a better score next time.
          </p>
          <div className="row wrap" style={{ gap: 8 }}>
            {assessment.scores.gaps.map((g) => <Term key={g} of={g}><span className="chip">{g}</span></Term>)}
          </div>
        </Card>
      )}

      <Card>
        <p className="small">
          This score is built from what you told us, not from your transactions — it says <strong>self-reported</strong>
          {' '}wherever it appears. Once your accounts have a few weeks of history, it is replaced by a measured one, and
          the two may well disagree. That is useful information rather than a bug.
        </p>
      </Card>
    </>
  )
}

/* ---------------------------------------------------------------- split editor */

function SplitEditor({ split, income, onChange, plan }) {
  const total = split.reduce((x, b) => x + b.amount, 0)
  const left = income - total

  const setBucket = (key, amount) => {
    const next = split.map((b) => (b.key === key ? { ...b, amount: Math.max(0, Math.round(amount / 100) * 100) } : b))
    if (key !== 'discretionary') {
      const fixed = next.filter((b) => b.key !== 'discretionary').reduce((x, b) => x + b.amount, 0)
      next.find((b) => b.key === 'discretionary').amount = Math.max(0, income - fixed)
    }
    onChange(next.map((b) => ({ ...b, share: b.amount / Math.max(1, income) })))
  }

  return (
    <>
      {plan && (
        <Card className="rise">
          <div className="row-between" style={{ marginBottom: 8 }}>
            <span className="eyebrow">What this plan is doing</span>
            <SourcePill source={plan.source} fallback={plan.fallback} />
          </div>
          <p style={{ fontFamily: 'var(--serif)', fontSize: 16, lineHeight: 1.5 }}>{plan.headline}</p>
          {plan.firstStep && <p className="callout callout-forest" style={{ marginTop: 10 }}><strong>Do this first:</strong> {plan.firstStep}</p>}
          {plan.watchFor && <p className="callout callout-warn" style={{ marginTop: 8 }}><strong>Most likely to break:</strong> {plan.watchFor}</p>}
        </Card>
      )}

      <Card>
        {split.map((b) => (
          <div key={b.key} style={{ padding: '14px 0', borderBottom: '1px solid var(--rule-2)' }}>
            <div className="row-between" style={{ marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{b.label}</div>
                <div className="small" style={{ maxWidth: '56ch' }}>{plan?.notes?.[b.key] || b.note}</div>
              </div>
              <div style={{ textAlign: 'right', flex: 'none' }}>
                <div className="num" style={{ fontSize: 19 }}>{inr(b.amount)}</div>
                <div className="small">{Math.round(b.share * 100)}%</div>
              </div>
            </div>
            <input type="range" min="0" max={income} step="500" value={b.amount}
              onChange={(e) => setBucket(b.key, +e.target.value)}
              disabled={b.key === 'discretionary'}
              style={{ width: '100%', accentColor: 'var(--forest)' }}
              aria-label={`${b.label} amount`} />
          </div>
        ))}

        <div className="row-between" style={{ marginTop: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Allocated</span>
          <span className="mono" style={{ fontWeight: 600, color: left < 0 ? 'var(--terracotta)' : 'var(--ink)' }}>
            {inr(total)} of {inr(income)}
          </span>
        </div>
        <p className="small" style={{ marginTop: 8 }}>
          Everyday spending absorbs whatever the other four leave behind — that is the honest direction of the trade.
          If it drops to zero, something above it is too ambitious to survive month one.
        </p>
      </Card>
    </>
  )
}

const monthsFromNow = (n) => {
  const d = new Date()
  d.setMonth(d.getMonth() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
