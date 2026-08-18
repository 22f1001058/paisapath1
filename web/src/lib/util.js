import { useCallback, useEffect, useState } from 'react'

/* ------------------------------------------------------------------ money */

export const inr = (n, { sign = false } = {}) => {
  const v = Math.round(Math.abs(n || 0))
  const s = `₹${v.toLocaleString('en-IN')}`
  if (!sign) return s
  return n < 0 ? `−${s}` : `+${s}`
}

/** ₹1,23,456 → ₹1.23L / ₹12.3L / ₹1.2Cr — Indian units, not K/M/B. */
export const inrShort = (n) => {
  const v = Math.abs(n || 0)
  const s = n < 0 ? '−₹' : '₹'
  if (v >= 1e7) return `${s}${(v / 1e7).toFixed(v >= 1e8 ? 0 : 2)}Cr`
  if (v >= 1e5) return `${s}${(v / 1e5).toFixed(v >= 1e6 ? 1 : 2)}L`
  if (v >= 1000) return `${s}${(v / 1000).toFixed(v >= 1e4 ? 0 : 1)}k`
  return `${s}${Math.round(v)}`
}

export const pct = (n) => `${Math.round((n || 0) * 100)}%`

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const monthName = (m, short = false) => {
  const n = MONTH_NAMES[+m.slice(5, 7) - 1]
  return `${short ? n.slice(0, 3) : n} ${m.slice(0, 4)}`
}
export const dayLabel = (d) => `${+d.slice(8, 10)} ${MONTH_NAMES[+d.slice(5, 7) - 1].slice(0, 3)}`

export const initials = (name = '') => name.trim().slice(0, 1).toUpperCase()

/* ------------------------------------------------------------------ api */

async function req(path, opts) {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `${r.status} ${r.statusText}`)
  return r.json()
}

export const api = {
  get: (p) => req(p),
  post: (p, body) => req(p, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: (p, body) => req(p, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del: (p) => req(p, { method: 'DELETE' }),
}

/** Fetch-on-mount with reload(). Deliberately not a cache library. */
export function useFetch(path, deps = []) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    if (!path) return
    setLoading(true)
    api.get(path).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false))
  }, [path])

  useEffect(load, [load, ...deps])
  return { data, error, loading, reload: load, set: setData }
}

/** POST that reports its own pending state — used for every "ask the AI" button. */
export function useAction(fn) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const call = useCallback(async (...a) => {
    setPending(true); setError(null)
    try { return await fn(...a) } catch (e) { setError(e.message); throw e } finally { setPending(false) }
  }, [fn])
  return [call, pending, error]
}

/* ------------------------------------------------------------------ hash router */

// A hash router is 20 lines and gives us back/forward and deep links for free.
export function useRoute() {
  const read = () => window.location.hash.replace(/^#\/?/, '') || 'today'
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const on = () => { setRoute(read()); window.scrollTo({ top: 0 }) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return [route, (r) => { window.location.hash = `/${r}` }]
}

/* ------------------------------------------------------------------ theme */

export function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('pp-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('pp-theme', theme)
  }, [theme])
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))]
}

/* ------------------------------------------------------------------ colour */

export const CATEGORY_INK = {
  'Food & Dining': '#C8891F', Groceries: '#6E8B3D', Transport: '#3F5262', Rent: '#14493C',
  'Bills & Utilities': '#7A6A55', Shopping: '#AB4326', Subscriptions: '#8A5A83', Health: '#2E7D74',
  Education: '#4A5FA5', Entertainment: '#B5732E', 'Family & Gifts': '#9A4B6B',
  Investments: '#1F6B57', Savings: '#3E8E6E', Income: '#1F6B57', Other: '#857D6E',
}
export const inkFor = (c) => CATEGORY_INK[c] || '#857D6E'
