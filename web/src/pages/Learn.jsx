import { useState } from 'react'
import { Card, Icon, Term } from '../components/ui'

// Organised by the moment the term becomes relevant, not alphabetically.
// A glossary you have to go and read is a glossary nobody reads.
const MOMENTS = [
  {
    id: 'first-salary', when: 'Your first salary lands',
    blurb: 'The month everything gets decided by default unless you decide it on purpose.',
    where: 'Today',
    terms: ['CTC vs take-home', 'TDS', 'Provident Fund', 'Form 16', 'Standard deduction'],
  },
  {
    id: 'safety', when: 'Before you invest anything',
    blurb: 'The unglamorous layer that decides whether one bad month becomes one bad year.',
    where: 'Goals',
    terms: ['Emergency fund', 'Term insurance', 'Health insurance deductible', 'Liquid fund', 'Sweep-in FD'],
  },
  {
    id: 'spending', when: 'You are trying to spend less',
    blurb: 'Most of the money is not lost to big decisions. It is lost to small automatic ones.',
    where: 'Spending',
    terms: ['Lifestyle inflation', 'Subscription creep', 'Fixed costs ratio', 'Zero-based budgeting', '50-30-20 rule'],
  },
  {
    id: 'invest', when: 'You start investing',
    blurb: 'Four ideas cover most of what a first-time investor needs. The rest is marketing.',
    where: 'What if…',
    terms: ['SIP', 'Index fund', 'Expense ratio', 'Compounding', 'Nominal vs real returns', 'Asset allocation'],
  },
  {
    id: 'borrow', when: 'Someone offers you credit',
    blurb: 'Credit is not free money and not evil either. It is a price, and the price is knowable.',
    where: 'What if…',
    terms: ['EMI', 'Credit score', 'Credit utilisation', 'No-cost EMI', 'Minimum amount due', 'Personal loan APR'],
  },
  {
    id: 'tax', when: 'March gets close',
    blurb: 'Tax planning done in March is not planning. It is damage control.',
    where: 'Money',
    terms: ['Old vs new tax regime', 'Section 80C', 'ELSS', 'Capital gains on equity', 'Advance tax'],
  },
]

export default function Learn() {
  const [open, setOpen] = useState('first-salary')

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Learn</div>
          <h1 className="page-title" style={{ marginTop: 6 }}>Explained when it matters</h1>
          <p className="page-sub">
            You will meet most of these inside the app, at the moment they become relevant — a dashed underline
            anywhere in PaisaPath opens the same explanation. This page exists for when you want to go looking.
          </p>
        </div>
      </header>

      <div className="grid g-main">
        <div className="stack">
          {MOMENTS.map((m) => (
            <Card key={m.id} pad={false}>
              <button
                className="row-between" aria-expanded={open === m.id}
                style={{ width: '100%', background: 'none', border: 0, padding: '16px 20px', cursor: 'pointer', textAlign: 'left' }}
                onClick={() => setOpen(open === m.id ? null : m.id)}
              >
                <div>
                  <h3 style={{ fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 500 }}>{m.when}</h3>
                  <p className="small" style={{ marginTop: 3, maxWidth: '60ch' }}>{m.blurb}</p>
                </div>
                <span className="row" style={{ gap: 10, flex: 'none' }}>
                  <span className="chip chip-static">{m.terms.length} ideas</span>
                  <span style={{ color: 'var(--ink-3)', transform: open === m.id ? 'rotate(180deg)' : '', transition: 'transform .15s' }}>
                    <Icon.arrowDown size={15} />
                  </span>
                </span>
              </button>

              {open === m.id && (
                <div className="rise" style={{ padding: '0 20px 18px' }}>
                  <div className="row wrap" style={{ gap: 8 }}>
                    {m.terms.map((t) => (
                      <Term key={t} of={t}>
                        <span className="chip" style={{ borderStyle: 'solid' }}>{t}</span>
                      </Term>
                    ))}
                  </div>
                  <p className="small" style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--rule-2)' }}>
                    These also surface on the <strong>{m.where}</strong> screen, underlined, exactly where the decision
                    they belong to happens.
                  </p>
                </div>
              )}
            </Card>
          ))}
        </div>

        <div className="stack">
          <Card title="How these are written">
            <p className="small" style={{ lineHeight: 1.65 }}>
              Each explanation is generated on demand for your situation — your life stage and city go into the request,
              nothing else. Every one has the same five parts: what it is, why it matters to you now, a worked example
              in rupees, the mistake people make, and the India-specific detail that generic finance content leaves out.
            </p>
            <p className="small" style={{ marginTop: 10 }}>
              Explanations are cached after the first read, so opening the same term twice costs nothing.
            </p>
          </Card>

          <Card title="What this page will not do">
            <ul style={{ margin: 0, paddingLeft: 17 }}>
              <li className="small" style={{ marginBottom: 7 }}>Name a fund, stock, insurer or bank to buy from.</li>
              <li className="small" style={{ marginBottom: 7 }}>Promise a return, or show a past return as an expectation.</li>
              <li className="small" style={{ marginBottom: 7 }}>Present an affiliate link as education. There are none anywhere in this app.</li>
              <li className="small">Replace a fee-only adviser or a CA when your situation gets genuinely complicated.</li>
            </ul>
          </Card>

          <Card title="Start here if you are new">
            <div className="stack" style={{ gap: 9 }}>
              {['Emergency fund', 'CTC vs take-home', 'SIP', 'Credit score', 'Compounding'].map((t, i) => (
                <div key={t} className="row" style={{ gap: 10 }}>
                  <span className="num" style={{ color: 'var(--rule)', fontSize: 15, width: 14 }}>{i + 1}</span>
                  <Term of={t}><span style={{ fontSize: 13.5 }}>{t}</span></Term>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
