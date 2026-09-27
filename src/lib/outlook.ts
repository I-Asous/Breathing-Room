import { MIN_LISTINGS, monthLabel } from './overlay'
import {
  BURDEN_PERIOD,
  CITY,
  airAt,
  askingAt,
  burdenShare,
  deepPer1k,
  first,
  formatPercent,
  formatRent,
  formatUg,
  last,
  median,
  type AirPoint,
  type AskingPoint,
  type Neighborhood,
} from './metrics'

/** A straight line through published points. The band is the miss against those same points. */
export type LineFit = {
  n: number
  slope: number
  intercept: number
  r2: number
  residualSd: number
}

export type AirContinuation = {
  n: number
  firstYear: number
  lastYear: number
  lastValue: number
  slopePerYear: number
  r2: number
  nextYear: number
  continuation: number
  band: number
}

export type RentPair = {
  earlierMonth: string
  laterMonth: string
  earlier: number
  later: number
  changePct: number
}

export type RentOutlook = {
  points: number
  startMonth: string
  endMonth: string
  endAsk: number
  pairs: RentPair[]
  medianChange: number | null
  latestPair: RentPair | null
  nextMonth: string
  precedent: { month: string; ask: number; n: number } | null
  line: LineFit | null
  lineNext: number | null
}

export type EquityRecord = {
  burdenPeriod: string
  burdenPct: number | null
  asthmaPeriod: string | null
  asthmaRate: number | null
  deepPer1k: number | null
}

export const AIR_HOLD =
  'Neighborhood air ends in 2024, the year before congestion pricing, and does not show whether the toll changed the air.'

export const RENT_HOLD =
  'It is one observation of the season, not a forecast of what a new lease will ask, and not what a tenant already in place pays.'

export const EQUITY_HOLD =
  'Rent burden, financed affordable homes, and child asthma are each one published period. This page does not extend them.'

export function fitLine(points: { x: number; y: number }[]): LineFit | null {
  if (points.length < 3) return null
  const n = points.length
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / n
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / n
  let ssxx = 0
  let ssxy = 0
  let ssyy = 0
  for (const point of points) {
    const dx = point.x - meanX
    const dy = point.y - meanY
    ssxx += dx * dx
    ssxy += dx * dy
    ssyy += dy * dy
  }
  if (ssxx === 0) return null
  const slope = ssxy / ssxx
  const intercept = meanY - slope * meanX
  let sse = 0
  for (const point of points) {
    const error = point.y - (intercept + slope * point.x)
    sse += error * error
  }
  return {
    n,
    slope,
    intercept,
    r2: ssyy === 0 ? 1 : 1 - sse / ssyy,
    residualSd: Math.sqrt(sse / (n - 2)),
  }
}

export function airContinuation(series: AirPoint[]): AirContinuation | null {
  const points = series
    .map((point) => ({ x: Number(point.period), y: point.value }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .sort((a, b) => a.x - b.x)
  const fit = fitLine(points)
  const lastPoint = points.at(-1)
  const firstPoint = points[0]
  if (!fit || !lastPoint || !firstPoint) return null
  const nextYear = lastPoint.x + 1
  return {
    n: fit.n,
    firstYear: firstPoint.x,
    lastYear: lastPoint.x,
    lastValue: lastPoint.y,
    slopePerYear: fit.slope,
    r2: fit.r2,
    nextYear,
    continuation: fit.intercept + fit.slope * nextYear,
    band: fit.residualSd,
  }
}

export function describeAirSlope(slope: number): string {
  const rounded = Math.round(Math.abs(slope) * 10) / 10
  if (rounded === 0) return 'The line is flat across these years.'
  const direction = slope < 0 ? 'lower' : 'higher'
  return `The line runs about ${rounded.toFixed(1)} µg/m³ ${direction} each year.`
}

export function addMonths(month: string, delta: number): string {
  const [year, raw] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, raw - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export function rentOutlook(series: AskingPoint[]): RentOutlook | null {
  const start = first(series)
  const end = last(series)
  if (!start || !end) return null
  const pairs: RentPair[] = []
  for (const point of series) {
    const earlierMonth = addMonths(point.month, -12)
    const earlier = askingAt(series, earlierMonth)
    if (!earlier || earlier.n < MIN_LISTINGS || point.n < MIN_LISTINGS) continue
    const changePct = ((point.median1br - earlier.median1br) / earlier.median1br) * 100
    if (!Number.isFinite(changePct)) continue
    pairs.push({
      earlierMonth,
      laterMonth: point.month,
      earlier: earlier.median1br,
      later: point.median1br,
      changePct,
    })
  }
  const nextMonth = addMonths(end.month, 1)
  const precedentPoint = askingAt(series, addMonths(nextMonth, -12))
  const precedent =
    precedentPoint && precedentPoint.n >= MIN_LISTINGS
      ? { month: precedentPoint.month, ask: precedentPoint.median1br, n: precedentPoint.n }
      : null
  const indexed = series
    .map((point, index) => ({ x: index, y: point.median1br, n: point.n }))
    .filter((point) => point.n >= MIN_LISTINGS)
  const line = end.n >= MIN_LISTINGS && indexed.length >= 3 ? fitLine(indexed) : null
  return {
    points: series.length,
    startMonth: start.month,
    endMonth: end.month,
    endAsk: end.median1br,
    pairs,
    medianChange: median(pairs.map((pair) => pair.changePct)),
    latestPair: pairs.at(-1) ?? null,
    nextMonth,
    precedent,
    line,
    lineNext: line ? line.intercept + line.slope * series.length : null,
  }
}

export function equityRecord(rows: Neighborhood[]): EquityRecord {
  const asthma = last(rows === CITY.neighborhoods ? CITY.citywide.asthmaChild : rows[0]?.asthmaChild ?? [])
  const cityAsthma = rows !== CITY.neighborhoods ? last(CITY.citywide.asthmaChild) : asthma
  return {
    burdenPeriod: BURDEN_PERIOD,
    burdenPct: burdenShare(rows),
    asthmaPeriod: asthma?.period ?? cityAsthma?.period ?? null,
    asthmaRate: asthma?.value ?? null,
    deepPer1k: deepPer1k(rows),
  }
}

export function cityAir(): AirContinuation | null {
  return airContinuation(CITY.citywide.pm25)
}

export function placeAir(neighborhood: Neighborhood): AirContinuation | null {
  return airContinuation(neighborhood.pm25)
}

export function airSentence(fit: AirContinuation): string {
  return `If the ${fit.firstYear}–${fit.lastYear} line continued, ${fit.nextYear} would sit near ${formatUg(fit.continuation)} µg/m³, give or take ${formatUg(fit.band)} µg/m³. The give-or-take is how far the line missed the years it was drawn through. It has not been checked against a year the survey has not published. ${AIR_HOLD}`
}

export function rentSentence(outlook: RentOutlook): string {
  if (!outlook.precedent) {
    return `${monthLabel(outlook.endMonth)} is the last month with a published ask. No earlier ${monthLabel(outlook.nextMonth).replace(/ \d{4}$/, '')} has at least ${MIN_LISTINGS} one-bedroom listings, so this page does not name a next-month ask.`
  }
  const paired =
    outlook.medianChange == null
      ? ''
      : ` Where the same month appears a year apart, the median change is ${formatPercent(outlook.medianChange)}.`
  const monthName = monthLabel(outlook.precedent.month).replace(/ \d{4}$/, '')
  return `The record ends in ${monthLabel(outlook.endMonth)} at ${formatRent(outlook.endAsk)}. ${monthLabel(outlook.precedent.month)} is the only ${monthName} in the record, and the median new one-bedroom ask was ${formatRent(outlook.precedent.ask)}. ${RENT_HOLD}${paired}`
}

export function lineSentence(outlook: RentOutlook): string | null {
  if (!outlook.line || outlook.lineNext == null) return null
  const perMonth = Math.round(outlook.line.slope)
  const direction = perMonth < 0 ? 'lower' : perMonth > 0 ? 'higher' : 'flat'
  const step =
    direction === 'flat'
      ? 'A straight line through these months is flat.'
      : `A straight line through these months runs about ${formatRent(Math.abs(perMonth))} ${direction} each month.`
  return `${step} One more month on that line would be ${formatRent(outlook.lineNext)}, give or take ${formatRent(outlook.line.residualSd)}. That line was drawn through the only seasonal cycle on record, so it has not been checked against a year it did not see.`
}

/** 2024 city mean, used so a place line can sit next to the published city figure. */
export function cityPm2024(): number | null {
  return airAt(CITY.citywide.pm25, '2024')
}
