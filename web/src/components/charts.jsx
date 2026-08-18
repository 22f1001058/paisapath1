// Hand-rolled SVG charts. A chart library would have been one npm install, but
// every one of them arrives with its own visual opinions (rounded bars, drop
// shadows, a default palette) that fight the rest of this design. These are
// ~30 lines each and inherit the page's ink colours directly.

import { inrShort, inkFor } from '../lib/util'

const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')

/* ---------------------------------------------------------------- trend */

export function AreaTrend({ series, compare, height = 132, label, compareLabel }) {
  const w = 640, h = height, pad = { t: 10, r: 4, b: 18, l: 4 }
  const max = Math.max(1, ...series, ...(compare || []))
  const n = Math.max(series.length, compare?.length || 0)
  const x = (i) => pad.l + (i / Math.max(1, n - 1)) * (w - pad.l - pad.r)
  const y = (v) => pad.t + (1 - v / max) * (h - pad.t - pad.b)

  const main = series.map((v, i) => [x(i), y(v)])
  const cmp = (compare || []).map((v, i) => [x(i), y(v)])

  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img"
        aria-label={`${label}: ${inrShort(series.at(-1) || 0)} so far`}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={pad.l} x2={w - pad.r} y1={y(max * f)} y2={y(max * f)} stroke="var(--rule-2)" strokeWidth="1" />
        ))}
        {cmp.length > 1 && <path d={path(cmp)} fill="none" stroke="var(--ink-3)" strokeWidth="1.25" strokeDasharray="3 3" opacity=".7" />}
        {main.length > 1 && (
          <>
            <path d={`${path(main)} L${x(main.length - 1)} ${h - pad.b} L${x(0)} ${h - pad.b} Z`} fill="var(--forest)" opacity=".08" />
            <path d={path(main)} fill="none" stroke="var(--forest)" strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={x(main.length - 1)} cy={y(series.at(-1))} r="3.2" fill="var(--forest)" />
          </>
        )}
      </svg>
      <figcaption className="row small" style={{ gap: 16, marginTop: 4 }}>
        <span className="row" style={{ gap: 6 }}><i className="dot" style={{ background: 'var(--forest)' }} />{label}</span>
        {compare?.length ? <span className="row" style={{ gap: 6 }}><i style={{ width: 12, height: 0, borderTop: '1px dashed var(--ink-3)' }} />{compareLabel}</span> : null}
      </figcaption>
    </figure>
  )
}

/* ---------------------------------------------------------------- donut */

export function Donut({ data, size = 176, centre, sub, onHover }) {
  const total = data.reduce((s, d) => s + d.amount, 0) || 1
  const r = size / 2 - 12, cx = size / 2, cy = size / 2, stroke = 17
  let acc = -Math.PI / 2

  const arcs = data.map((d) => {
    const a = (d.amount / total) * Math.PI * 2
    const [x1, y1] = [cx + r * Math.cos(acc), cy + r * Math.sin(acc)]
    acc += a
    const [x2, y2] = [cx + r * Math.cos(acc), cy + r * Math.sin(acc)]
    return { ...d, d: `M${x1} ${y1} A${r} ${r} 0 ${a > Math.PI ? 1 : 0} 1 ${x2} ${y2}` }
  })

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Spending by category">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--rule-2)" strokeWidth={stroke} />
      {arcs.map((a) => (
        <path key={a.category} d={a.d} fill="none" stroke={inkFor(a.category)} strokeWidth={stroke}
          onMouseEnter={() => onHover?.(a)} onMouseLeave={() => onHover?.(null)}
          style={{ cursor: onHover ? 'pointer' : 'default', transition: 'stroke-width .15s' }}>
          <title>{`${a.category} — ${inrShort(a.amount)}`}</title>
        </path>
      ))}
      <text x={cx} y={cy - 2} textAnchor="middle" className="num" style={{ fontSize: 21, fill: 'var(--ink)' }}>{centre}</text>
      <text x={cx} y={cy + 16} textAnchor="middle" style={{ fontSize: 10.5, fill: 'var(--ink-3)', fontFamily: 'var(--sans)' }}>{sub}</text>
    </svg>
  )
}

/* ---------------------------------------------------------------- score arc */

export function ScoreArc({ score, band, size = 168 }) {
  const r = size / 2 - 14, cx = size / 2, cy = size / 2 + 8, stroke = 11
  const arc = (frac) => {
    const a0 = Math.PI, a1 = Math.PI + Math.PI * frac
    const [x1, y1] = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)]
    const [x2, y2] = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)]
    // The gauge is a half-circle, so the swept angle is frac*π and never exceeds
    // 180° — large-arc must stay 0 or the arc draws the long way round.
    return `M${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2}`
  }
  const ink = score >= 70 ? 'var(--forest)' : score >= 45 ? 'var(--marigold)' : 'var(--terracotta)'

  return (
    <svg viewBox={`0 0 ${size} ${size * 0.68}`} width={size} height={size * 0.68} role="img" aria-label={`Financial health ${score} out of 100, ${band}`}>
      <path d={arc(1)} fill="none" stroke="var(--rule)" strokeWidth={stroke} strokeLinecap="round" />
      <path d={arc(Math.max(0.012, score / 100))} fill="none" stroke={ink} strokeWidth={stroke} strokeLinecap="round"
        style={{ transition: 'd .6s cubic-bezier(.2,.8,.2,1)' }} />
      <text x={cx} y={cy - 12} textAnchor="middle" className="num" style={{ fontSize: 34, fill: 'var(--ink)' }}>{score}</text>
      <text x={cx} y={cy + 6} textAnchor="middle" style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', fill: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>{band}</text>
    </svg>
  )
}

/* ---------------------------------------------------------------- projection */

export function Projection({ base, after, alt = null, height = 210, labels = ['If you don’t', 'If you do'] }) {
  const w = 660, h = height, pad = { t: 14, r: 52, b: 26, l: 6 }
  const vals = [...base.map((d) => d.net), ...after.map((d) => d.net), ...(alt || []).map((d) => d.net)]
  const max = Math.max(...vals)
  // Anchoring the axis at zero crushes the comparison: on a ₹4L projection a
  // ₹6k gap becomes one pixel and three lines render as one. The gap IS the
  // chart's subject, so the axis zooms to the data — and every gridline is
  // labelled with its real rupee value so the zoom is never hidden.
  const lo = Math.min(...vals)
  const min = lo <= 0 ? Math.min(0, lo) : lo - (max - lo) * 0.25 - max * 0.02
  const x = (i) => pad.l + (i / Math.max(1, base.length - 1)) * (w - pad.l - pad.r)
  const y = (v) => pad.t + (1 - (v - min) / Math.max(1, max - min)) * (h - pad.t - pad.b)

  const b = base.map((d, i) => [x(i), y(d.net)])
  const a = after.map((d, i) => [x(i), y(d.net)])
  // With a third line the dotted baseline is "do neither", so divergence is
  // measured between the two real options instead.
  const c = alt ? alt.map((d, i) => [x(i), y(d.net)]) : null
  const against = c || b
  const diverge = a.findIndex((p, i) => Math.abs(p[1] - against[i][1]) > 1.5)

  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label="Two-year net worth projection">
        {[0, 0.5, 1].map((f) => {
          const v = min + (max - min) * f
          return (
            <g key={f}>
              <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="var(--rule-2)" />
              <text x={w - pad.r + 6} y={y(v) + 3.5} style={{ fontSize: 9.5, fill: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>{inrShort(v)}</text>
            </g>
          )
        })}
        {diverge > 0 && <rect x={x(diverge)} y={pad.t} width={w - pad.r - x(diverge)} height={h - pad.t - pad.b} fill="var(--marigold)" opacity=".055" />}
        <path d={path(b)} fill="none" stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="4 3" />
        {c && <>
          <path d={path(c)} fill="none" stroke="var(--terracotta)" strokeWidth="2.2" strokeLinejoin="round" />
          <circle cx={x(c.length - 1)} cy={c.at(-1)[1]} r="3.4" fill="var(--terracotta)" />
        </>}
        <path d={path(a)} fill="none" stroke="var(--forest)" strokeWidth="2.2" strokeLinejoin="round" />
        <circle cx={x(a.length - 1)} cy={a.at(-1)[1]} r="3.4" fill="var(--forest)" />
        {[0, 6, 12, 18, 23].map((m) => (
          <text key={m} x={x(m)} y={h - 8} textAnchor="middle" style={{ fontSize: 9.5, fill: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>
            {m === 0 ? 'now' : `${m}mo`}
          </text>
        ))}
      </svg>
      <figcaption className="row small wrap" style={{ gap: 16, marginTop: 2 }}>
        {c
          ? <>
            <span className="row" style={{ gap: 6 }}><i style={{ width: 14, height: 2, background: 'var(--terracotta)' }} />{labels[0]}</span>
            <span className="row" style={{ gap: 6 }}><i style={{ width: 14, height: 2, background: 'var(--forest)' }} />{labels[1]}</span>
            <span className="row" style={{ gap: 6 }}><i style={{ width: 14, height: 0, borderTop: '1.5px dashed var(--ink-3)' }} />If you do neither</span>
          </>
          : <>
            <span className="row" style={{ gap: 6 }}><i style={{ width: 14, height: 0, borderTop: '1.5px dashed var(--ink-3)' }} />{labels[0]}</span>
            <span className="row" style={{ gap: 6 }}><i style={{ width: 14, height: 2, background: 'var(--forest)' }} />{labels[1]}</span>
          </>}
      </figcaption>
    </figure>
  )
}

/* ---------------------------------------------------------------- misc */

export function Sparkline({ values, width = 84, height = 22, ink = 'var(--forest)' }) {
  const max = Math.max(1, ...values), min = Math.min(...values)
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * width, height - ((v - min) / Math.max(1, max - min)) * (height - 3) - 1.5])
  return <svg width={width} height={height} aria-hidden="true"><path d={path(pts)} fill="none" stroke={ink} strokeWidth="1.4" strokeLinejoin="round" /></svg>
}

export function Bar({ value, max, ink = 'var(--forest)', height = 5 }) {
  return (
    <div className="bar-track" style={{ height }}>
      <div className="bar-fill" style={{ width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%`, background: ink }} />
    </div>
  )
}
