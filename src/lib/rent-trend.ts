import { CITY, RENT_MONTHS, type AskingPoint } from './metrics'
import { MIN_LISTINGS } from './overlay'

export type TrendPoint = { month: string; value: number; listings: number; thin: boolean }

export type TrendSeries = { key: 'place' | 'city'; name: string; points: TrendPoint[] }

export type RentTrend = {
  months: string[]
  series: TrendSeries[]
  ticks: number[]
  min: number
  max: number
}

function toPoints(series: AskingPoint[]): TrendPoint[] {
  const byMonth = new Map(series.map((p) => [p.month, p]))
  return RENT_MONTHS.flatMap((month) => {
    const point = byMonth.get(month)
    return point ? [{ month, value: point.median1br, listings: point.n, thin: point.n < MIN_LISTINGS }] : []
  })
}

/** Round axis ticks: a 1-2-5 step that gives three to five lines across the range. */
export function niceTicks(low: number, high: number): number[] {
  const span = Math.max(high - low, 1)
  const raw = span / 4
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((f) => f * magnitude).find((s) => span / s <= 5) ?? 10 * magnitude
  const start = Math.floor(low / step) * step
  const end = Math.ceil(high / step) * step
  const ticks: number[] = []
  for (let t = start; t <= end + step / 2; t += step) ticks.push(Math.round(t))
  return ticks
}

/**
 * Monthly median asking rent for a new one-bedroom lease: the chosen place against the city, or the
 * city alone. Months with fewer than MIN_LISTINGS one-bedroom listings are marked thin.
 */
export function rentTrend(place: { name: string; asking1br: AskingPoint[] } | null): RentTrend {
  const series: TrendSeries[] = []
  if (place) series.push({ key: 'place', name: place.name, points: toPoints(place.asking1br) })
  series.push({ key: 'city', name: 'New York City', points: toPoints(CITY.citywide.asking1br) })
  const values = series.flatMap((s) => s.points.map((p) => p.value))
  const ticks = values.length ? niceTicks(Math.min(...values), Math.max(...values)) : [0, 1]
  return { months: RENT_MONTHS, series, ticks, min: ticks[0], max: ticks[ticks.length - 1] }
}
