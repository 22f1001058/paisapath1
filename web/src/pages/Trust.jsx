import { useState } from 'react'
import { api, useAction, useFetch } from '../lib/util'
import { Card, Icon, Loading, Stat } from '../components/ui'

const TRANSPORT = {
  'local-cli': 'local subprocess',
  'local-server': 'local server',
  'cloud-api': 'hosted API',
}

export default function Trust({ reload }) {
  const trust = useFetch('/api/trust')
  const engines = useFetch('/api/providers')
  const [tab, setTab] = useState('log')
  const [showAll, setShowAll] = useState(false)

  const [switchTo, switching] = useAction(async (name) => {
    await api.post('/api/provider', { name })
    engines.reload(); trust.reload(); reload()
  })
  const [recheck, rechecking] = useAction(async () => { await api.get('/api/providers?force=1'); engines.reload() })

  const t = trust.data
  const stats = t?.stats || {}

  // Thirteen providers ship in the catalogue; only the ones you can actually use
  // are worth a row until you ask for the rest.
  const listed = engines.data?.providers || []
  const hidden = listed.filter((p) => !p.configured)
  const visible = showAll ? listed : listed.filter((p) => p.configured)

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Trust centre</div>
          <h1 className="page-title" style={{ marginTop: 6 }}>What this app knows, and what it does with it</h1>
          <p className="page-sub">
            Not a privacy policy. A live view of every permission, every AI call it has ever made, and exactly what
            left this machine each time.
          </p>
        </div>
      </header>

      {trust.loading && <Loading lines={6} />}

      {t && (
        <>
          <div className="grid g3" style={{ marginBottom: 20 }}>
            <Card>
              <Stat label="AI calls made" value={stats.n || 0}
                sub={`${stats.ok || 0} succeeded · ${stats.fb || 0} fell back to rules`} />
            </Card>
            <Card>
              <Stat label="Typical response" value={stats.avg ? `${(stats.avg / 1000).toFixed(1)}s` : '—'}
                sub={t.engine ? `${t.engine.label}${t.engine.model ? ` · ${t.engine.model}` : ''}` : 'no provider configured'} />
            </Card>
            <Card>
              <Stat label="Data uploaded to us" value="None" sub="there is no PaisaPath server to upload to" />
            </Card>
          </div>

          <div className="grid g-main">
            <div className="stack">
              <Card title="The AI engine" action={
                <button className="btn btn-quiet btn-sm" onClick={recheck} disabled={rechecking}>
                  <Icon.refresh size={13} className={rechecking ? 'spin' : ''} /> Re-check
                </button>
              }>
                <p className="small" style={{ marginBottom: 14 }}>
                  PaisaPath talks to whichever inference provider you point it at — an agent CLI already installed on
                  this machine, a model server on your own network, or a hosted API. Keys are read from the{' '}
                  <code className="kbd">.env</code> file on this machine: they are never
                  written to the database, never sent to this browser and never committed to the repository.
                </p>
                {engines.loading && <Loading lines={3} />}
                {visible.map((p) => (
                  <div key={p.name} className="row-between" style={{ padding: '11px 0', borderTop: '1px solid var(--rule-2)', opacity: p.configured ? 1 : 0.6 }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                        <i className="dot" style={{ background: p.ok ? 'var(--forest)' : p.configured ? 'var(--terracotta)' : 'var(--ink-3)' }} />
                        <strong style={{ fontSize: 13.5 }}>{p.label}</strong>
                        <span className="small">{p.vendor}</span>
                        <span className="chip chip-static">{TRANSPORT[p.transport] || 'provider'}</span>
                        <code className="kbd">{p.api === 'cli' ? p.bin : p.model}</code>
                      </div>
                      <div className="small" style={{ marginTop: 3, maxWidth: '58ch' }}>
                        {p.configured ? p.detail : p.missing}
                      </div>
                    </div>
                    <div className="row" style={{ gap: 8, flex: 'none' }}>
                      {engines.data.active === p.name
                        ? <span className="chip chip-good chip-static"><Icon.check size={11} /> in use</span>
                        : <button className="btn btn-ghost btn-sm" disabled={!p.ok || switching} onClick={() => switchTo(p.name)}>Use this</button>}
                    </div>
                  </div>
                ))}
                {hidden.length > 0 && (
                  <button className="btn btn-quiet btn-sm" style={{ marginTop: 10 }} onClick={() => setShowAll(!showAll)}>
                    {showAll ? 'Hide' : `Show ${hidden.length} provider${hidden.length === 1 ? '' : 's'} with no key set`}
                  </button>
                )}
                <p className="small" style={{ marginTop: 14 }}>
                  If none of them answers, every screen still works. The numbers are computed locally; only the
                  wording would be written by the built-in rules instead.
                </p>
              </Card>

              <Card pad={false} title="Activity">
                <div className="row" style={{ gap: 8, padding: '12px 20px 0' }}>
                  <div className="seg">
                    <button aria-pressed={tab === 'log'} onClick={() => setTab('log')}>AI calls</button>
                    <button aria-pressed={tab === 'events'} onClick={() => setTab('events')}>App events</button>
                  </div>
                </div>
                <div style={{ padding: '10px 20px 18px' }}>
                  {tab === 'log' && (
                    <table className="ledger">
                      <thead><tr><th>When</th><th>Task</th><th>Engine</th><th>What was sent</th><th className="r">Took</th></tr></thead>
                      <tbody>
                        {t.log.map((l) => (
                          <tr key={l.id}>
                            <td className="mono small" style={{ whiteSpace: 'nowrap' }}>{l.ts.slice(5, 16).replace('T', ' ')}</td>
                            <td>
                              <span className="row" style={{ gap: 7, fontSize: 13 }}>
                                <i className="dot" style={{ background: l.ok ? 'var(--forest)' : l.fallback ? 'var(--marigold)' : 'var(--terracotta)' }} />
                                {l.task}
                              </span>
                              {l.error && <div className="small" style={{ color: 'var(--terracotta)', maxWidth: '44ch' }}>{l.error}</div>}
                            </td>
                            <td className="small">
                              {l.provider}
                              {l.model && <div className="mono small" style={{ opacity: 0.7 }}>{l.model}</div>}
                            </td>
                            <td className="small" style={{ maxWidth: '38ch' }}>{l.shared}</td>
                            <td className="r small">{(l.ms / 1000).toFixed(1)}s</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {tab === 'events' && (
                    <table className="ledger">
                      <thead><tr><th>When</th><th>What happened</th></tr></thead>
                      <tbody>
                        {t.events.map((e) => (
                          <tr key={e.id}>
                            <td className="mono small" style={{ whiteSpace: 'nowrap' }}>{e.ts.slice(5, 16).replace('T', ' ')}</td>
                            <td><div style={{ fontSize: 13 }}>{e.title}</div><div className="small">{e.body}</div></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {tab === 'log' && t.log.length === 0 && <p className="small" style={{ padding: '18px 0' }}>No AI calls yet.</p>}
                </div>
              </Card>
            </div>

            <div className="stack">
              <Card title="Permissions">
                {t.permissions.map((p) => (
                  <div key={p.id} className="row-between" style={{ padding: '10px 0', borderBottom: '1px solid var(--rule-2)', alignItems: 'flex-start', gap: 12 }}>
                    <div>
                      <div className="row" style={{ gap: 7 }}>
                        {p.granted
                          ? <span style={{ color: 'var(--forest)' }}><Icon.check size={13} /></span>
                          : <span style={{ color: 'var(--ink-3)' }}><Icon.lock size={13} /></span>}
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{p.label}</span>
                      </div>
                      <div className="small" style={{ marginTop: 3 }}>{p.why}</div>
                    </div>
                    <span className={`chip chip-static ${p.granted ? 'chip-good' : ''}`} style={{ flex: 'none' }}>
                      {p.granted ? 'on' : p.revocable ? 'off' : 'never'}
                    </span>
                  </div>
                ))}
              </Card>

              <Card title="Connected accounts">
                {t.accounts.map((a) => (
                  <div key={a.id} className="row-between" style={{ padding: '7px 0' }}>
                    <div>
                      <div style={{ fontSize: 13 }}>{a.name}</div>
                      <div className="small">{a.institution} · <span className="mono">{a.masked}</span></div>
                    </div>
                    <span className="chip chip-static">read-only</span>
                  </div>
                ))}
              </Card>

              <Card title="The things apps usually bury">
                {Object.entries({
                  'Sponsored content': t.disclosures.sponsored,
                  'How this app makes money': t.disclosures.revenue,
                  'Advice, legally': t.disclosures.advice,
                  'Who produces the numbers': t.disclosures.numbers,
                  'Where the AI call goes': t.disclosures.engine,
                  'Where your data lives': t.disclosures.storage,
                }).map(([k, v]) => (
                  <div key={k} style={{ padding: '11px 0', borderBottom: '1px solid var(--rule-2)' }}>
                    <div className="eyebrow" style={{ marginBottom: 4 }}>{k}</div>
                    <p className="small" style={{ lineHeight: 1.6 }}>{v}</p>
                  </div>
                ))}
              </Card>

              <Card title="Start over">
                <p className="small" style={{ marginBottom: 10 }}>
                  Re-run the first-salary setup to rebuild your split, budget and goals from scratch. Nothing is
                  written until the last screen.
                </p>
                <button className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}
                  onClick={() => { window.location.hash = '#/start' }}>
                  Run the salary setup
                </button>
                <hr className="rule" style={{ margin: '4px 0 14px' }} />
                <p className="small" style={{ marginBottom: 10 }}>
                  Or wipe everything: chat history, cached explanations, dismissed nudges and the AI log, then reseed
                  the demo data.
                </p>
                <ResetButton onDone={() => { trust.reload(); reload() }} />
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function ResetButton({ onDone }) {
  const [armed, setArmed] = useState(false)
  const [reset, pending] = useAction(async () => { await api.post('/api/reset'); setArmed(false); onDone() })
  if (!armed) return <button className="btn btn-ghost btn-sm" onClick={() => setArmed(true)}>Reset everything</button>
  return (
    <div className="row" style={{ gap: 8 }}>
      <button className="btn btn-sm" style={{ background: 'var(--terracotta)' }} onClick={reset} disabled={pending}>
        {pending ? 'Resetting…' : 'Yes, wipe it'}
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => setArmed(false)}>Cancel</button>
    </div>
  )
}
