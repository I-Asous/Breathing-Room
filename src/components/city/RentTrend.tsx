import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { formatCount, formatPercent, formatRent, percentChange, type AskingPoint } from '@/lib/metrics'
import { monthLabel } from '@/lib/overlay'
import { rentTrend, type TrendPoint } from '@/lib/rent-trend'

// Chart box in viewBox units; the SVG scales to the panel width.
const W = 360
const H = 170
const M = { top: 12, right: 58, bottom: 24, left: 46 }
const PLOT_W = W - M.left - M.right
const PLOT_H = H - M.top - M.bottom
// End labels closer than this (in viewBox units) would collide; the legend carries identity instead.
const LABEL_GAP = 13

const SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const shortMonth = (month: string) => {
  const [year, mm] = month.split('-').map(Number)
  return SHORT.format(new Date(Date.UTC(year, mm - 1, 1)))
}

export default function RentTrend({ place }: { place: { name: string; asking1br: AskingPoint[] } | null }) {
  const trend = useMemo(() => rentTrend(place), [place])
  const [active, setActive] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const plotRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const [tipX, setTipX] = useState(0)

  const { months, series, ticks, min, max } = trend
  const x = (index: number) => M.left + (months.length > 1 ? (index / (months.length - 1)) * PLOT_W : PLOT_W / 2)
  const y = (value: number) => M.top + PLOT_H - ((value - min) / (max - min || 1)) * PLOT_H
  const indexOf = (month: string) => months.indexOf(month)

  const paths = series.map((s) => ({
    ...s,
    d: s.points.map((p, i) => `${i ? 'L' : 'M'}${x(indexOf(p.month)).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' '),
    end: s.points[s.points.length - 1] as TrendPoint | undefined,
  }))
  const ends = paths.map((p) => (p.end ? y(p.end.value) : null))
  const labelEnds = ends.length < 2 || ends.some((e) => e == null) || Math.abs((ends[0] ?? 0) - (ends[1] ?? 0)) >= LABEL_GAP

  const placeSeries = series.find((s) => s.key === 'place')
  const lead = placeSeries ?? series[0]
  const first = lead.points[0]
  const last = lead.points[lead.points.length - 1]
  const change = first && last ? percentChange(first.value, last.value) : null
  const cityChange = placeSeries
    ? (() => {
        const city = series.find((s) => s.key === 'city')!.points
        return city.length ? percentChange(city[0].value, city[city.length - 1].value) : null
      })()
    : null

  function monthAt(clientX: number): number | null {
    const svg = svgRef.current
    if (!svg) return null
    const box = svg.getBoundingClientRect()
    const vx = ((clientX - box.left) / box.width) * W
    const index = Math.round(((vx - M.left) / PLOT_W) * (months.length - 1))
    return Math.max(0, Math.min(months.length - 1, index))
  }

  function onKey(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const step = event.key === 'ArrowLeft' ? -1 : 1
    setActive((current) => Math.max(0, Math.min(months.length - 1, (current ?? months.length - 1) + step)))
  }

  const hover = active == null ? null : months[active]
  const hoverRows = hover
    ? series.map((s) => ({ s, point: s.points.find((p) => p.month === hover) ?? null }))
    : []

  // Keep the tooltip beside the crosshair and inside the plot: right of it when it fits, else left, else clamped.
  useLayoutEffect(() => {
    const plot = plotRef.current
    const tip = tipRef.current
    if (active == null || !plot || !tip) return
    const width = plot.clientWidth
    const at = (x(active) / W) * width
    const tipWidth = tip.offsetWidth
    let left = at + 12
    if (left + tipWidth > width) left = at - 12 - tipWidth
    setTipX(Math.max(0, Math.min(left, width - tipWidth)))
  }, [active])

  return (
    <figure className="rent-trend">
      <figcaption>
        <p className="text-sm">
          <strong>Asking rent for a new 1-bedroom lease, by month</strong>
        </p>
        {change != null && first && last && (
          <p className="text-sm text-muted-foreground">
            {lead.name === 'New York City' ? 'Citywide' : lead.name}: {formatRent(first.value)} in {monthLabel(first.month)} to{' '}
            {formatRent(last.value)} in {monthLabel(last.month)} ({formatPercent(change)})
            {cityChange != null ? `, against ${formatPercent(cityChange)} citywide` : ''}.
          </p>
        )}
      </figcaption>

      {series.length > 1 && (
        <ul className="rent-trend-legend" aria-hidden="true">
          {series.map((s) => (
            <li key={s.key}>
              <i className={`key key-${s.key}`} />
              {s.name}
            </li>
          ))}
        </ul>
      )}

      <div className="rent-trend-plot" ref={plotRef}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Line chart of monthly asking rent, ${series.map((s) => s.name).join(' and ')}. Use the arrow keys to read each month.`}
          tabIndex={0}
          onPointerMove={(event: PointerEvent<SVGSVGElement>) => setActive(monthAt(event.clientX))}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive((current) => current ?? months.length - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={onKey}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={M.left} x2={M.left + PLOT_W} y1={y(t)} y2={y(t)} />
              <text className="tick" x={M.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle">
                {formatRent(t)}
              </text>
            </g>
          ))}
          <text className="tick" x={x(0)} y={H - 6} textAnchor="start">
            {shortMonth(months[0])}
          </text>
          <text className="tick" x={x(months.length - 1)} y={H - 6} textAnchor="end">
            {shortMonth(months[months.length - 1])}
          </text>

          {paths.map((p) => (
            <path key={p.key} className={`line line-${p.key}`} d={p.d} />
          ))}
          {paths.map(
            (p) =>
              p.end && (
                <g key={`end-${p.key}`}>
                  <circle className={`dot dot-${p.key}`} cx={x(indexOf(p.end.month))} cy={y(p.end.value)} r={4} />
                  {labelEnds && (
                    <text className="end-label" x={x(indexOf(p.end.month)) + 8} y={y(p.end.value)} dominantBaseline="middle">
                      {formatRent(p.end.value)}
                    </text>
                  )}
                </g>
              ),
          )}

          {active != null && (
            <g className="crosshair">
              <line x1={x(active)} x2={x(active)} y1={M.top} y2={M.top + PLOT_H} />
              {hoverRows.map(
                ({ s, point }) =>
                  point && <circle key={s.key} className={`dot dot-${s.key}`} cx={x(active)} cy={y(point.value)} r={4} />,
              )}
            </g>
          )}
          {/* A wide invisible hit area so the whole plot answers the pointer, not just the 2px lines. */}
          <rect className="hit" x={M.left} y={M.top} width={PLOT_W} height={PLOT_H} />
        </svg>

        {hover && (
          <div className="rent-trend-tip" ref={tipRef} style={{ left: tipX }} role="status">
            <p className="text-xs text-muted-foreground">{monthLabel(hover)}</p>
            {hoverRows.map(({ s, point }) => (
              <p key={s.key} className="text-sm">
                <i className={`key key-${s.key}`} aria-hidden="true" /> {s.key === 'city' ? 'City' : s.name}:{' '}
                {point ? (
                  <>
                    <strong>{formatRent(point.value)}</strong>
                    <span className="text-muted-foreground">
                      {' '}
                      · {formatCount(point.listings)} listings{point.thin ? ', thin' : ''}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">no listings</span>
                )}
              </p>
            ))}
          </div>
        )}
      </div>

      <details className="rent-trend-table">
        <summary className="text-xs text-muted-foreground">Show as a table</summary>
        <table>
          <thead>
            <tr>
              <th>Month</th>
              {series.map((s) => (
                <th key={s.key}>{s.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {months.map((month) => (
              <tr key={month}>
                <td>{shortMonth(month)}</td>
                {series.map((s) => {
                  const point = s.points.find((p) => p.month === month)
                  return (
                    <td key={s.key}>
                      {point ? `${formatRent(point.value)} (${formatCount(point.listings)})` : '—'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground mt-1">
          Median asking rent on one-bedroom listings; listing counts in parentheses. Months under 20 listings are thin.
          Not what a sitting tenant pays.
        </p>
      </details>
    </figure>
  )
}
