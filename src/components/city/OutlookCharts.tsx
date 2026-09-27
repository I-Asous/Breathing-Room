import { MIN_LISTINGS, monthLabel } from '@/lib/overlay'
import {
  CITY,
  deepPer1k,
  formatRate,
  formatRent,
  formatShare,
  formatUg,
  last,
  type AirPoint,
  type AskingPoint,
} from '@/lib/metrics'
import type { AirContinuation, EquityRecord, LineFit, RentOutlook } from '@/lib/outlook'

const W = 640
const H = 214
const M = { top: 16, right: 14, bottom: 30, left: 58 }
const PLOT_W = W - M.left - M.right
const PLOT_H = H - M.top - M.bottom

const SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })

function shortMonth(month: string): string {
  const [year, mm] = month.split('-').map(Number)
  return SHORT.format(new Date(Date.UTC(year, mm - 1, 1)))
}

function fittedAir(fit: AirContinuation, year: number): number {
  return fit.continuation - fit.slopePerYear * (fit.nextYear - year)
}

function domain(values: number[]): { min: number; max: number } {
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = (hi - lo) * 0.12 || 1
  return { min: lo - pad, max: hi + pad }
}

function ticks(min: number, max: number, step: number): number[] {
  const out: number[] = []
  const start = Math.ceil(min / step) * step
  for (let value = start; value < max - step * 0.05; value += step) out.push(Number(value.toFixed(2)))
  return out
}

function pathOf(points: { x: number; y: number }[]): string {
  return points
    .map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ')
}

export function AirOutlookChart({
  citySeries,
  cityFit,
  placeName,
  placeSeries,
  placeFit,
}: {
  citySeries: AirPoint[]
  cityFit: AirContinuation
  placeName: string | null
  placeSeries: AirPoint[] | null
  placeFit: AirContinuation | null
}) {
  const focus = placeFit ?? cityFit
  const values = [
    ...citySeries.map((point) => point.value),
    ...(placeSeries?.map((point) => point.value) ?? []),
    focus.continuation - focus.band,
    focus.continuation + focus.band,
    fittedAir(focus, focus.firstYear),
  ]
  const { min, max } = domain(values)
  const span = max - min || 1
  const x = (year: number) => M.left + ((year - focus.firstYear) / (focus.nextYear - focus.firstYear)) * PLOT_W
  const y = (value: number) => M.top + PLOT_H - ((value - min) / span) * PLOT_H
  const years = [focus.firstYear, Math.round((focus.firstYear + focus.lastYear) / 2), focus.lastYear]
  const yTicks = ticks(min, max, span > 6 ? 2 : 1)

  const published = (series: AirPoint[], tone: 'city' | 'place') => {
    const points = series
      .map((point) => ({ year: Number(point.period), value: point.value }))
      .filter((point) => Number.isFinite(point.year))
      .sort((a, b) => a.year - b.year)
    const line = pathOf(points.map((point) => ({ x: x(point.year), y: y(point.value) })))
    return { tone, line, points }
  }

  const fitLine = (fit: AirContinuation, tone: 'city' | 'place') => {
    const samples = []
    for (let year = fit.firstYear; year <= fit.nextYear; year += 1) {
      samples.push({ x: x(year), y: y(fittedAir(fit, year)) })
    }
    return { tone, d: pathOf(samples), fit }
  }

  const cityDrawn = published(citySeries, 'city')
  const placeDrawn = placeSeries && placeFit ? published(placeSeries, 'place') : null
  const lines = [fitLine(cityFit, 'city'), ...(placeFit ? [fitLine(placeFit, 'place')] : [])]
  const band = [
    [x(focus.firstYear), y(fittedAir(focus, focus.firstYear) + focus.band)],
    [x(focus.nextYear), y(focus.continuation + focus.band)],
    [x(focus.nextYear), y(focus.continuation - focus.band)],
    [x(focus.firstYear), y(fittedAir(focus, focus.firstYear) - focus.band)],
  ]
    .map((pair, index) => `${index ? 'L' : 'M'}${pair[0].toFixed(1)} ${pair[1].toFixed(1)}`)
    .join(' ')
  const focusTone = placeFit ? 'place' : 'city'

  return (
    <figure className="outlook-chart">
      <ul className="outlook-legend" aria-hidden="true">
        <li>
          <i className={`swatch solid ${focusTone}`} /> Published annual mean
        </li>
        <li>
          <i className={`swatch dashed ${focusTone}`} /> Line through those years
        </li>
        <li>
          <i className={`swatch open ${focusTone}`} /> {focus.nextYear}, if the line continued
        </li>
      </ul>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`PM2.5 from ${focus.firstYear} to ${focus.lastYear}, a straight line through those years, and an open circle for ${focus.nextYear} if the line continued. The shaded band is the give-or-take. ${focus.nextYear} is not a published survey year.`}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line className="grid" x1={M.left} x2={M.left + PLOT_W} y1={y(tick)} y2={y(tick)} />
            <text className="tick" x={M.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">
              {formatUg(tick)}
            </text>
          </g>
        ))}
        <line className="record-end" x1={x(focus.lastYear)} x2={x(focus.lastYear)} y1={M.top} y2={M.top + PLOT_H} />
        <path className={`band ${focusTone}`} d={`${band} Z`} />
        {lines.map((line) => (
          <path key={line.tone} className={`fit ${line.tone}`} d={line.d} />
        ))}
        <path className={`published ${cityDrawn.tone}`} d={cityDrawn.line} />
        {cityDrawn.points.map((point) => (
          <circle key={`city-${point.year}`} className="fill city" cx={x(point.year)} cy={y(point.value)} r={3.2}>
            <title>
              City {point.year}: {formatUg(point.value)} µg/m³
            </title>
          </circle>
        ))}
        <circle className="open city" cx={x(cityFit.nextYear)} cy={y(cityFit.continuation)} r={4.5}>
          <title>
            If the city line continued, {cityFit.nextYear} would sit near {formatUg(cityFit.continuation)} µg/m³. Not a
            published year.
          </title>
        </circle>
        {placeDrawn && placeFit && (
          <>
            <path className="published place" d={placeDrawn.line} />
            {placeDrawn.points.map((point) => (
              <circle key={`place-${point.year}`} className="fill place" cx={x(point.year)} cy={y(point.value)} r={3.2}>
                <title>
                  {placeName} {point.year}: {formatUg(point.value)} µg/m³
                </title>
              </circle>
            ))}
            <circle className="open place" cx={x(placeFit.nextYear)} cy={y(placeFit.continuation)} r={4.5}>
              <title>
                If the {placeName} line continued, {placeFit.nextYear} would sit near {formatUg(placeFit.continuation)}{' '}
                µg/m³. Not a published year.
              </title>
            </circle>
          </>
        )}
        {years.map((year) => (
          <text key={year} className="tick" x={x(year)} y={H - 8} textAnchor={year === focus.lastYear ? 'end' : 'start'}>
            {year}
          </text>
        ))}
      </svg>
      <figcaption className="text-xs text-muted-foreground">
        µg/m³. Solid is the survey. The dashed line runs one year past {focus.lastYear}. The shade is how far that line
        missed the years it was drawn through.
        {placeName ? ` ${placeName} is brick. The city is blue.` : ''}
      </figcaption>
    </figure>
  )
}

export function EquityMeters({
  record,
  city,
  name,
}: {
  record: EquityRecord
  city: EquityRecord
  name: string | null
}) {
  const asthmaMax = Math.max(...CITY.neighborhoods.map((n) => last(n.asthmaChild)?.value ?? 0), 1)
  const deepMax = Math.max(...CITY.neighborhoods.map((n) => deepPer1k([n]) ?? 0), 1)
  const rows = [
    record.burdenPct != null
      ? {
          key: 'burden',
          label: 'Rent burden',
          period: record.burdenPeriod,
          value: record.burdenPct,
          city: city.burdenPct,
          max: 100,
          figure: formatShare(record.burdenPct),
          note: 'of renter households',
        }
      : null,
    record.asthmaRate != null
      ? {
          key: 'asthma',
          label: 'Child asthma',
          period: record.asthmaPeriod ?? '',
          value: record.asthmaRate,
          city: city.asthmaRate,
          max: asthmaMax,
          figure: String(Math.round(record.asthmaRate)),
          note: 'visits per 100,000',
        }
      : null,
    record.deepPer1k != null
      ? {
          key: 'deep',
          label: 'Deeply affordable homes',
          period: 'Since 2014',
          value: record.deepPer1k,
          city: city.deepPer1k,
          max: deepMax,
          figure: formatRate(record.deepPer1k),
          note: 'per 1,000 households',
        }
      : null,
  ].filter((row) => row != null)

  return (
    <figure className={`outlook-meters ${name ? '' : 'is-city'}`}>
      <div className="outlook-meter-grid">
        {rows.map((row) => (
          <div key={row.key} className="outlook-meter">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">{row.label}</p>
            <p className="outlook-figure">{row.figure}</p>
            <p className="text-xs text-muted-foreground">{row.note}</p>
            <div className="track" aria-hidden="true">
              <span className="fill" style={{ width: `${Math.min(100, (row.value / row.max) * 100)}%` }} />
              {name && row.city != null && (
                <span className="city-mark" style={{ left: `${Math.min(100, (row.city / row.max) * 100)}%` }} />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{row.period}. The bar stops here.</p>
          </div>
        ))}
      </div>
      <figcaption className="text-xs text-muted-foreground">
        Rent burden is on a scale of 0 to 100. Asthma and deeply affordable homes run to the highest of the 42
        neighborhoods.
        {name ? ` The bar is ${name}. The blue mark is the city.` : ' The bar is the city.'}
      </figcaption>
    </figure>
  )
}

export function RentOutlookChart({
  series,
  outlook,
  name,
}: {
  series: AskingPoint[]
  outlook: RentOutlook
  name: string
}) {
  const extended = outlook.line != null && outlook.lineNext != null
  const count = series.length + (extended ? 1 : 0)
  const values = series.map((point) => point.median1br)
  if (extended && outlook.lineNext != null) values.push(outlook.lineNext)
  const { min, max } = domain(values)
  const span = max - min || 1
  const step = span > 2000 ? 500 : span > 800 ? 250 : span > 300 ? 100 : 50
  const x = (index: number) => M.left + (count > 1 ? (index / (count - 1)) * PLOT_W : PLOT_W / 2)
  const y = (value: number) => M.top + PLOT_H - ((value - min) / span) * PLOT_H
  const yTicks = ticks(min, max, step)
  const precedentIndex = outlook.precedent ? series.findIndex((point) => point.month === outlook.precedent?.month) : -1

  const solid: string[] = []
  let drawing = ''
  let pen = false
  series.forEach((point, index) => {
    if (point.n < MIN_LISTINGS) {
      if (drawing) solid.push(drawing)
      drawing = ''
      pen = false
      return
    }
    drawing += `${pen ? 'L' : 'M'}${x(index).toFixed(1)} ${y(point.median1br).toFixed(1)} `
    pen = true
  })
  if (drawing) solid.push(drawing)

  const dashed = extended && outlook.line ? fitPath(outlook.line, series.length, x, y) : null

  return (
    <figure className="outlook-chart">
      <ul className="outlook-legend" aria-hidden="true">
        <li>
          <i className="swatch solid place" /> Ask, 20 or more listings
        </li>
        {series.some((point) => point.n < MIN_LISTINGS) && (
          <li>
            <i className="swatch thin" /> Fewer than 20
          </li>
        )}
        {outlook.precedent && (
          <li>
            <i className="swatch ring" /> Same month a year earlier
          </li>
        )}
        {extended && (
          <li>
            <i className="swatch dashed place" /> Untested next month
          </li>
        )}
      </ul>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${name} new one-bedroom asking rent from ${monthLabel(outlook.startMonth)} to ${monthLabel(outlook.endMonth)}.${
          outlook.precedent
            ? ` ${monthLabel(outlook.precedent.month)} is marked as the only matching month a year earlier.`
            : ' No next-month ask is drawn.'
        }${extended ? ' An open circle is one more month on the straight line, and that step has not been checked against a later year.' : ''}`}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line className="grid" x1={M.left} x2={M.left + PLOT_W} y1={y(tick)} y2={y(tick)} />
            <text className="tick" x={M.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">
              {formatRent(tick)}
            </text>
          </g>
        ))}
        {dashed && <path className="fit place" d={dashed} />}
        {solid.map((d, index) => (
          <path key={index} className="published place" d={d} />
        ))}
        {series.map((point, index) => (
          <circle
            key={point.month}
            className={point.n < MIN_LISTINGS ? 'thin' : 'fill place'}
            cx={x(index)}
            cy={y(point.median1br)}
            r={point.n < MIN_LISTINGS ? 2.6 : 3.2}
          >
            <title>
              {monthLabel(point.month)}: {formatRent(point.median1br)}, {point.n} listings
            </title>
          </circle>
        ))}
        {precedentIndex >= 0 && outlook.precedent && (
          <circle
            className="ring"
            cx={x(precedentIndex)}
            cy={y(outlook.precedent.ask)}
            r={7}
          >
            <title>
              {monthLabel(outlook.precedent.month)} is the same month a year before the next step, at{' '}
              {formatRent(outlook.precedent.ask)}.
            </title>
          </circle>
        )}
        {extended && outlook.lineNext != null && (
          <circle className="open place" cx={x(series.length)} cy={y(outlook.lineNext)} r={4.5}>
            <title>
              One more month on the straight line would be {formatRent(outlook.lineNext)}. That step has not been
              checked against a later year.
            </title>
          </circle>
        )}
        <text className="tick" x={x(0)} y={H - 8} textAnchor="start">
          {shortMonth(outlook.startMonth)}
        </text>
        <text className="tick" x={x(series.length - 1)} y={H - 8} textAnchor="end">
          {shortMonth(outlook.endMonth)}
        </text>
      </svg>
      <figcaption className="text-xs text-muted-foreground">
        Median asking rent for a new one-bedroom. Hollow dots have fewer than 20 listings.
        {extended
          ? ' The open circle is the next month on the straight line, drawn through the only seasonal cycle on record.'
          : ' No next month is drawn.'}
      </figcaption>
    </figure>
  )
}

function fitPath(
  line: LineFit,
  lastIndex: number,
  x: (index: number) => number,
  y: (value: number) => number,
): string {
  const points = []
  for (let index = 0; index <= lastIndex; index += 1) {
    points.push({ x: x(index), y: y(line.intercept + line.slope * index) })
  }
  return pathOf(points)
}
