import { useFetch, useRoute, useTheme, initials } from './lib/util'
import { ExplainProvider, Icon, Loading } from './components/ui'

import Today from './pages/Today'
import Money from './pages/Money'
import Spending from './pages/Spending'
import Budget from './pages/Budget'
import Goals from './pages/Goals'
import Simulate from './pages/Simulate'
import Mentor from './pages/Mentor'
import Learn from './pages/Learn'
import Trust from './pages/Trust'
import Onboard from './pages/Onboard'

const NAV = [
  { group: 'Now' },
  { id: 'today', label: 'Today', icon: 'today', el: Today },
  { id: 'money', label: 'Money', icon: 'wallet', el: Money },
  { id: 'spending', label: 'Spending', icon: 'spend', el: Spending },
  { group: 'Plan' },
  { id: 'budget', label: 'Budget', icon: 'budget', el: Budget },
  { id: 'goals', label: 'Goals', icon: 'goal', el: Goals },
  { id: 'simulate', label: 'What if…', icon: 'sim', el: Simulate },
  { group: 'Understand' },
  { id: 'mentor', label: 'Mentor', icon: 'mentor', el: Mentor },
  { id: 'learn', label: 'Learn', icon: 'learn', el: Learn },
  { id: 'trust', label: 'Trust centre', icon: 'trust', el: Trust },
  // Reachable at #/start, but kept out of the rail — it is a journey you take
  // once, not a place you navigate to.
  { id: 'start', el: Onboard, hidden: true },
]

export default function App() {
  const [route, go] = useRoute()
  const [theme, toggleTheme] = useTheme()
  const state = useFetch('/api/state')

  const entry = NAV.find((n) => n.id === route) || NAV[1]
  // No profile yet? The questionnaire comes before everything else — every
  // screen is computed from what it collects.
  const Page = state.data && !state.data.profile.onboarded ? Onboard : entry.el
  const s = state.data

  return (
    <ExplainProvider>
      <div className="app">
        <nav className="rail" aria-label="Main">
          <div className="brand">
            <div className="brand-mark">₹</div>
            <div>
              <div className="brand-name">PaisaPath</div>
              <div className="brand-sub">one clear step at a time</div>
            </div>
          </div>

          <div className="nav">
            {NAV.filter((n) => !n.hidden).map((n, i) =>
              n.group ? (
                <div key={`g${i}`} className="nav-group eyebrow">{n.group}</div>
              ) : (
                <button key={n.id} className="nav-item" aria-current={route === n.id ? 'page' : undefined}
                  onClick={() => go(n.id)}>
                  {(() => { const C = Icon[n.icon]; return <C className="ico" /> })()}
                  {n.label}
                  {n.id === 'spending' && s?.uncategorised > 0 && <span className="nav-badge">{s.uncategorised}</span>}
                </button>
              ),
            )}
          </div>

          <div className="rail-foot">
            <div className="row-between">
              <div className="row" style={{ gap: 8 }}>
                <div className="brand-mark" style={{ width: 24, height: 24, fontSize: 12, fontFamily: 'var(--sans)', fontWeight: 600 }}>
                  {initials(s?.profile?.name || 'A')}
                </div>
                <div style={{ lineHeight: 1.25 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{s?.profile?.name || '—'}</div>
                  <div className="small" style={{ fontSize: 11 }}>{s?.profile?.city}</div>
                </div>
              </div>
              <button className="btn btn-quiet" onClick={toggleTheme} aria-label="Switch theme">
                {theme === 'dark' ? <Icon.sun /> : <Icon.moon />}
              </button>
            </div>
          </div>
        </nav>

        <main className="main">
          {state.loading && <div className="page"><Loading lines={6} label="Reading your accounts…" /></div>}
          {state.error && (
            <div className="page">
              <h1 className="page-title">The API is not answering</h1>
              <p className="lede" style={{ marginTop: 8 }}>{state.error}</p>
              <p className="small" style={{ marginTop: 12 }}>Start it with <code className="kbd">npm run dev</code> — that runs the API on :8787 and this UI on :5173.</p>
            </div>
          )}
          {s && <Page state={s} reload={state.reload} go={go} />}
        </main>
      </div>
    </ExplainProvider>
  )
}
