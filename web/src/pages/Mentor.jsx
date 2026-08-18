import { useEffect, useRef, useState } from 'react'
import { api, inr, useFetch } from '../lib/util'
import { Card, Icon, SourcePill, Term } from '../components/ui'

const OPENERS = [
  'Can I afford a ₹45,000 phone right now?',
  'Should I start investing or finish my emergency fund first?',
  'Where is my money actually going every month?',
  'How much should someone on my salary be saving?',
  'Is taking an EMI ever a good idea?',
  'What should I do with my first bonus?',
]

export default function Mentor({ state }) {
  const history = useFetch('/api/chat')
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [live, setLive] = useState('')
  const [engine, setEngine] = useState(null)
  const scroller = useRef(null)

  useEffect(() => { if (history.data) setMessages(history.data) }, [history.data])
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }) }, [messages, live])

  async function send(question) {
    if (!question.trim() || streaming) return
    setDraft(''); setStreaming(true); setLive('')
    setMessages((m) => [...m, { id: `tmp${Date.now()}`, role: 'user', content: question }])

    let acc = ''
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''

      // Minimal SSE parse — EventSource cannot POST, and this is 15 lines.
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const frames = buf.split('\n\n')
        buf = frames.pop()
        for (const f of frames) {
          const ev = f.match(/^event: (.+)$/m)?.[1]
          const raw = f.match(/^data: ([\s\S]*)$/m)?.[1]
          if (!ev || raw === undefined) continue
          const data = JSON.parse(raw)
          if (ev === 'meta') setEngine(data)
          if (ev === 'chunk') { acc += data; setLive(acc) }
          if (ev === 'done') acc = data.text
          if (ev === 'error') acc = data.message
        }
      }
    } catch (e) {
      acc = `Something broke on the way to the AI engine: ${e.message}`
    }
    setMessages((m) => [...m, { id: `tmpa${Date.now()}`, role: 'assistant', content: acc }])
    setLive(''); setStreaming(false)
  }

  const clear = async () => { await api.del('/api/chat'); setMessages([]) }
  const empty = messages.length === 0 && !streaming

  return (
    <div className="page" style={{ paddingBottom: 24 }}>
      <header className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <div className="eyebrow">Mentor</div>
          <h1 className="page-title" style={{ marginTop: 6 }}>Ask anything about your money</h1>
          <p className="page-sub">
            It can see your balances, spending and goals — so it answers with your numbers, not generic advice.
            It will not name a fund or a policy to buy; it will tell you how to judge one.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {engine && <SourcePill source={engine.model ? `${engine.label} · ${engine.model}` : engine.label} />}
          {messages.length > 0 && <button className="btn btn-ghost btn-sm" onClick={clear}>Clear</button>}
        </div>
      </header>

      <div className="chat-wrap">
        <div className="chat-scroll" ref={scroller}>
          {empty && (
            <div style={{ maxWidth: 640, padding: '24px 0 8px' }}>
              <div className="row" style={{ gap: 10, marginBottom: 16 }}>
                <span style={{ color: 'var(--marigold)' }}><Icon.spark size={18} /></span>
                <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 500 }}>
                  You have {inr(state.sts.safe)} safe to spend and {state.health.monthsCovered.toFixed(1)} months of cover.
                </h2>
              </div>
              <p className="lede" style={{ marginBottom: 20 }}>
                That is the context this conversation already has. Start anywhere.
              </p>
              <div className="row wrap" style={{ gap: 8 }}>
                {OPENERS.map((o) => <button key={o} className="chip" onClick={() => send(o)}>{o}</button>)}
              </div>
              <p className="small" style={{ marginTop: 24, maxWidth: '58ch' }}>
                What gets sent: your question, the last few turns, and the summary figures on your Today screen.
                Not your transaction list, not your account numbers. <Term of="Data minimisation">Why that matters</Term>
              </p>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`msg ${m.role === 'user' ? 'msg-user' : 'msg-ai'} rise`}>
              {m.role === 'assistant' && <div className="eyebrow" style={{ marginBottom: 6 }}>Mentor</div>}
              {m.content}
            </div>
          ))}

          {streaming && (
            <div className="msg msg-ai">
              <div className="eyebrow" style={{ marginBottom: 6 }}>Mentor</div>
              {live ? <span className="caret">{live}</span> : <span className="small">reading your numbers…</span>}
            </div>
          )}
        </div>

        <div className="composer">
          <form className="row" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); send(draft) }}>
            <input className="input" placeholder="Ask about a decision you are actually facing…"
              value={draft} onChange={(e) => setDraft(e.target.value)} disabled={streaming} />
            <button className="btn" type="submit" disabled={streaming || !draft.trim()}>
              {streaming ? <Icon.refresh size={15} className="spin" /> : <Icon.send size={15} />}
            </button>
          </form>
          <p className="small" style={{ marginTop: 8 }}>
            Guidance, not regulated financial advice. PaisaPath is not a SEBI-registered adviser and earns nothing from
            what it suggests.
          </p>
        </div>
      </div>
    </div>
  )
}
