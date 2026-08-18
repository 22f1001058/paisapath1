import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from '../lib/util'

/* ---------------------------------------------------------------- icons */

const I = (d, extra) => (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
    width={p.size || 16} height={p.size || 16} className={p.className} aria-hidden="true">
    {d}{extra}
  </svg>
)

export const Icon = {
  today: I(<><path d="M3 12l9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></>),
  wallet: I(<><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><circle cx="17" cy="14.5" r="1.2" /></>),
  spend: I(<><path d="M4 19V9" /><path d="M9.5 19V5" /><path d="M15 19v-7" /><path d="M20.5 19v-11" /></>),
  budget: I(<><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v8.5l6 4" /></>),
  goal: I(<><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.2" /><circle cx="12" cy="12" r=".8" fill="currentColor" /></>),
  sim: I(<><path d="M4 18l5-6 4 3 7-9" /><path d="M14 6h6v6" /></>),
  mentor: I(<><path d="M4 5h16v11H9l-5 4z" /><path d="M9 10h7" /><path d="M9 13h4" /></>),
  learn: I(<><path d="M3 6.5l9-3.5 9 3.5-9 3.5z" /><path d="M6.5 9v6c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3V9" /></>),
  trust: I(<><path d="M12 3l7.5 3v6c0 4.5-3 7.8-7.5 9-4.5-1.2-7.5-4.5-7.5-9V6z" /><path d="M9.2 12l2 2 3.6-4" /></>),
  spark: I(<><path d="M12 3l1.9 5.4L19 10l-5.1 1.6L12 17l-1.9-5.4L5 10l5.1-1.6z" /></>),
  arrowUp: I(<><path d="M12 19V5" /><path d="M6 11l6-6 6 6" /></>),
  arrowDown: I(<><path d="M12 5v14" /><path d="M6 13l6 6 6-6" /></>),
  check: I(<><path d="M4 12.5l5 5L20 6.5" /></>),
  close: I(<><path d="M6 6l12 12M18 6L6 18" /></>),
  refresh: I(<><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4v5h-5" /></>),
  info: I(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><circle cx="12" cy="7.8" r=".9" fill="currentColor" /></>),
  lock: I(<><rect x="4.5" y="10" width="15" height="10" rx="2" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10" /></>),
  send: I(<><path d="M4.5 12L20 4.5 15 20l-3.5-6.5z" /><path d="M11.5 13.5L20 4.5" /></>),
  moon: I(<><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" /></>),
  sun: I(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>),
  plus: I(<><path d="M12 5v14M5 12h14" /></>),
  trash: I(<><path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M6 7l1 13h10l1-13" /></>),
}

/* ---------------------------------------------------------------- surfaces */

export const Card = ({ title, action, children, pad = true, className = '', style }) => (
  <section className={`card ${className}`} style={style}>
    {title && <header className="card-head"><h3 className="card-title">{title}</h3>{action}</header>}
    <div className={pad ? 'card-pad' : ''}>{children}</div>
  </section>
)

export const Stat = ({ label, value, sub, ink }) => (
  <div>
    <div className="stat-label">{label}</div>
    <div className="stat-value" style={{ color: ink }}>{value}</div>
    {sub && <div className="small" style={{ marginTop: 2 }}>{sub}</div>}
  </div>
)

export const Empty = ({ children }) => <div className="empty">{children}</div>

export const Skeleton = ({ h = 14, w = '100%', mb = 8 }) => (
  <div className="skeleton" style={{ height: h, width: w, marginBottom: mb }} />
)

export const Loading = ({ lines = 3, label }) => (
  <div>
    {label && <div className="small" style={{ marginBottom: 10 }}>{label}</div>}
    {Array.from({ length: lines }, (_, i) => <Skeleton key={i} w={i === lines - 1 ? '62%' : '100%'} />)}
  </div>
)

/** Marks who produced a piece of text. Present on every AI-written block. */
export const SourcePill = ({ source, fallback }) => (
  <span className="pill-source" title={fallback ? 'The AI engine was unavailable, so the built-in rules wrote this.' : `Written by ${source}`}>
    <i className="dot" style={{ background: fallback ? 'var(--marigold)' : 'var(--forest)' }} />
    {fallback ? 'built-in rules' : source}
  </span>
)

export function Drawer({ open, onClose, title, eyebrow, children }) {
  useEffect(() => {
    if (!open) return
    const k = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [open, onClose])
  if (!open) return null
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <header className="drawer-head row-between">
          <div>
            {eyebrow && <div className="eyebrow" style={{ marginBottom: 4 }}>{eyebrow}</div>}
            <h2 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 500 }}>{title}</h2>
          </div>
          <button className="btn btn-quiet" onClick={onClose} aria-label="Close"><Icon.close /></button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </>
  )
}

/* ---------------------------------------------------------------- explain + learn

   Two affordances that exist on every screen:
     <Why claim="..." />     → "Why am I seeing this?"  (HMW 1 + 3)
     <Term>SIP</Term>        → contextual micro-lesson  (HMW 3)
   Both open the same drawer, both hit the AI, both degrade to built-in text.
*/

const ExplainCtx = createContext(null)
export const useExplain = () => useContext(ExplainCtx)

export function ExplainProvider({ children }) {
  const [state, setState] = useState(null)   // { mode, title, payload, loading, error }

  const open = useCallback(async (mode, title, request) => {
    setState({ mode, title, loading: true })
    try {
      setState({ mode, title, payload: await request(), loading: false })
    } catch (e) {
      setState({ mode, title, error: e.message, loading: false })
    }
  }, [])

  const explain = useCallback((claim, context) =>
    open('explain', claim, () => api.post('/api/ai/explain', { claim, context })), [open])

  const learn = useCallback((term, where) =>
    open('learn', term, () => api.post('/api/ai/lesson', { term, where })), [open])

  const p = state?.payload
  return (
    <ExplainCtx.Provider value={{ explain, learn }}>
      {children}
      <Drawer open={!!state} onClose={() => setState(null)}
        eyebrow={state?.mode === 'learn' ? 'In plain English' : 'Why am I seeing this'}
        title={state?.title || ''}>
        {state?.loading && <Loading lines={5} label="Thinking this through…" />}
        {state?.error && <p className="callout callout-warn">{state.error}</p>}

        {p && state.mode === 'explain' && (
          <div className="stack" style={{ gap: 18 }}>
            <Field label="Why you"><p className="callout">{p.why}</p></Field>
            <Field label="What you get"><p>{p.benefit}</p></Field>
            <Field label="The honest downside"><p className="callout callout-warn">{p.risk}</p></Field>
            <Field label="Other ways to do this">
              <div className="stack" style={{ gap: 10 }}>
                {p.alternatives?.map((a, i) => (
                  <div key={i} style={{ borderTop: '1px solid var(--rule-2)', paddingTop: 9 }}>
                    <strong style={{ fontSize: 13 }}>{a.label}</strong>
                    <div className="small" style={{ marginTop: 2 }}>{a.detail}</div>
                  </div>
                ))}
              </div>
            </Field>
            <Field label="Where the numbers came from"><p className="small">{p.basis}</p></Field>
            <div className="row-between" style={{ borderTop: '1px solid var(--rule)', paddingTop: 12 }}>
              <span className="small" style={{ maxWidth: '68%' }}>{p.notAdvice}</span>
              <SourcePill source={p.source} fallback={p.fallback} />
            </div>
          </div>
        )}

        {p && state.mode === 'learn' && (
          <div className="stack" style={{ gap: 18 }}>
            <p style={{ fontSize: 15.5, lineHeight: 1.62 }}>{p.plain}</p>
            <Field label="Why it matters now"><p className="callout">{p.why}</p></Field>
            <Field label="A concrete example"><p>{p.example}</p></Field>
            <Field label="Where people go wrong"><p className="callout callout-warn">{p.mistake}</p></Field>
            <Field label="In India specifically"><p>{p.india}</p></Field>
            <div className="row-between" style={{ borderTop: '1px solid var(--rule)', paddingTop: 12 }}>
              {p.next ? <button className="chip" onClick={() => learn(p.next, 'lesson')}>Next: {p.next} →</button> : <span />}
              <SourcePill source={p.source} fallback={p.fallback} />
            </div>
          </div>
        )}
      </Drawer>
    </ExplainCtx.Provider>
  )
}

const Field = ({ label, children }) => (
  <div>
    <div className="eyebrow" style={{ marginBottom: 6 }}>{label}</div>
    {children}
  </div>
)

export function Why({ claim, context, label = 'Why am I seeing this?' }) {
  const { explain } = useExplain()
  return <button className="why" onClick={() => explain(claim, context)}>{label}</button>
}

export function Term({ children, of }) {
  const { learn } = useExplain()
  const term = of || (typeof children === 'string' ? children : '')
  return <button className="term" onClick={() => learn(term, window.location.hash)}>{children}</button>
}
