import {
  CITY,
  airAt,
  askingAt,
  formatRent,
  formatUg,
  last,
  percentChange,
  percentile,
  toneIndex,
  type Neighborhood,
  type Reading,
} from './metrics'
import { reportSlug } from './next-steps'

export type Measure = 'pm25' | 'no2' | 'asking'

const REPORTS = 'https://a816-dohbesp.nyc.gov/IndicatorPublic/neighborhood-reports'

/** Latest-month listings below this are too thin to call a rent rise. */
export const MIN_LISTINGS = 20
/** Percentage points a neighborhood must beat the citywide asking-rent change. */
const RISE_MARGIN = 1

export const ASK_WINDOW = {
  start: CITY.citywide.asking1br[0]?.month ?? '',
  end: last(CITY.citywide.asking1br)?.month ?? '',
}

export function monthLabel(month: string): string {
  const [year, raw] = month.split('-').map(Number)
  if (!year || !raw) return month
  return new Date(Date.UTC(year, raw - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function formatChange(value: number): string {
  const rounded = Math.round(value * 10) / 10
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded.toFixed(1)}%`
}

function tenthAbove(value: number, city: number): boolean {
  return Number(value.toFixed(1)) > Number(city.toFixed(1))
}

function tenthAtMost(value: number, city: number): boolean {
  return Number(value.toFixed(1)) <= Number(city.toFixed(1))
}

function measureValue(neighborhood: Neighborhood, measure: Measure, period: string): number | null {
  if (measure === 'asking') return askingAt(neighborhood.asking1br, period)?.median1br ?? null
  return airAt(measure === 'pm25' ? neighborhood.pm25 : neighborhood.no2, period)
}

function measureLabel(measure: Measure, value: number): string {
  if (measure === 'asking') return formatRent(value)
  if (measure === 'pm25') return `${formatUg(value)} µg/m³`
  return `${formatUg(value)} ppb`
}

export function readingsFor(
  measure: Measure,
  period: string,
  peers: Neighborhood[] = CITY.neighborhoods,
): Map<string, Reading> {
  const values = peers
    .map((neighborhood) => measureValue(neighborhood, measure, period))
    .filter((value): value is number => value != null)
  const map = new Map<string, Reading>()
  for (const neighborhood of peers) {
    const value = measureValue(neighborhood, measure, period)
    if (value == null) {
      map.set(neighborhood.id, { tone: null, label: 'No reading' })
      continue
    }
    map.set(neighborhood.id, {
      tone: toneIndex(percentile(value, values)),
      label: measureLabel(measure, value),
    })
  }
  return map
}

export function measureRange(
  measure: Measure,
  period: string,
  peers: Neighborhood[] = CITY.neighborhoods,
): { low: string; high: string } | null {
  const values = peers
    .map((neighborhood) => measureValue(neighborhood, measure, period))
    .filter((value): value is number => value != null)
  if (!values.length) return null
  return {
    low: measureLabel(measure, Math.min(...values)),
    high: measureLabel(measure, Math.max(...values)),
  }
}

export type PressurePlace = {
  id: string
  name: string
  borough: string
  askPct: number
  cityAskPct: number
  askEnd: number
  listings: number
  pm25: number
  no2: number
  pmAbove: boolean
  no2Above: boolean
  insight: { title: string; href: string; note: string }
}

/**
 * Neighborhoods where new one-bedroom asks rose faster than the city and 2024
 * PM2.5 or NO2 is still above the city mean. Air mostly fell from 2019 to 2024;
 * a rise is named only when it is large enough to read on the survey.
 */
export function rentPressure(peers: Neighborhood[] = CITY.neighborhoods): PressurePlace[] {
  const { start, end } = ASK_WINDOW
  const cityAskPct = percentChange(
    askingAt(CITY.citywide.asking1br, start)?.median1br ?? null,
    askingAt(CITY.citywide.asking1br, end)?.median1br ?? null,
  )
  const cityPm = airAt(CITY.citywide.pm25, '2024')
  const cityNo = airAt(CITY.citywide.no2, '2024')
  if (cityAskPct == null || cityPm == null || cityNo == null) return []

  const places: PressurePlace[] = []
  for (const neighborhood of peers) {
    const opening = askingAt(neighborhood.asking1br, start)
    const closing = askingAt(neighborhood.asking1br, end)
    const askPct = percentChange(opening?.median1br ?? null, closing?.median1br ?? null)
    const pm = airAt(neighborhood.pm25, '2024')
    const no = airAt(neighborhood.no2, '2024')
    const pmThen = airAt(neighborhood.pm25, '2019')
    const noThen = airAt(neighborhood.no2, '2019')
    if (askPct == null || closing == null || pm == null || no == null) continue
    if (closing.n < MIN_LISTINGS || askPct < cityAskPct + RISE_MARGIN) continue
    const pmAbove = tenthAbove(pm, cityPm)
    const no2Above = tenthAbove(no, cityNo)
    if (!pmAbove && !no2Above) continue

    const airBits = [
      pmAbove ? `2024 PM2.5 is ${formatUg(pm)} µg/m³, above the city mean of ${formatUg(cityPm)}` : null,
      no2Above ? `2024 NO2 is ${formatUg(no)} ppb, above the city mean of ${formatUg(cityNo)}` : null,
    ].filter((bit): bit is string => bit != null)
    const pmDelta = pmThen == null ? null : pm - pmThen
    const noDelta = noThen == null ? null : no - noThen
    const trend =
      pmDelta != null && pmDelta >= 0.2
        ? 'PM2.5 rose from 2019 to 2024.'
        : noDelta != null && noDelta >= 0.5
          ? 'NO2 rose from 2019 to 2024.'
          : pmAbove && pmDelta != null && pmDelta < 0
            ? `PM2.5 fell ${formatUg(Math.abs(pmDelta))} µg/m³ from 2019 to 2024 and is still above the city mean.`
            : ''

    places.push({
      id: neighborhood.id,
      name: neighborhood.name,
      borough: neighborhood.borough,
      askPct,
      cityAskPct,
      askEnd: closing.median1br,
      listings: closing.n,
      pm25: pm,
      no2: no,
      pmAbove,
      no2Above,
      insight: {
        title: `Read the ${neighborhood.name} asthma report`,
        href: `${REPORTS}/${reportSlug(neighborhood.name)}/asthma_and_the_environment/`,
        note: `New one-bedroom asks rose ${formatChange(askPct)} from ${monthLabel(start)} to ${monthLabel(end)}, against ${formatChange(cityAskPct)} citywide. ${airBits.join('. ')}. ${trend} The air record ends in 2024 and does not show whether the toll changed the air.`
          .replace(/\s+/g, ' ')
          .trim(),
      },
    })
  }
  places.sort((a, b) => b.askPct - a.askPct || a.name.localeCompare(b.name))
  return places
}

export type BudgetRow = {
  id: string
  name: string
  borough: string
  ask: number
  listings: number
  pm25: number
  no2: number
}

export type BudgetBracket = {
  budget: number
  month: string
  cityPm: number
  cityNo: number
  rows: BudgetRow[]
  reachesCityAir: boolean
  insight: { title: string; href: string; note: string } | null
}

/** Neighborhoods whose latest one-bedroom ask is at or under the budget, cleanest PM2.5 first. */
export function neighborhoodsForBudget(
  budget: number,
  peers: Neighborhood[] = CITY.neighborhoods,
): BudgetBracket | null {
  if (!Number.isFinite(budget) || budget <= 0) return null
  const month = ASK_WINDOW.end
  const cityPm = airAt(CITY.citywide.pm25, '2024')
  const cityNo = airAt(CITY.citywide.no2, '2024')
  if (!month || cityPm == null || cityNo == null) return null

  const rows: BudgetRow[] = []
  for (const neighborhood of peers) {
    const ask = askingAt(neighborhood.asking1br, month)
    const pm = airAt(neighborhood.pm25, '2024')
    const no = airAt(neighborhood.no2, '2024')
    if (!ask || pm == null || no == null || ask.median1br > budget) continue
    rows.push({
      id: neighborhood.id,
      name: neighborhood.name,
      borough: neighborhood.borough,
      ask: ask.median1br,
      listings: ask.n,
      pm25: pm,
      no2: no,
    })
  }
  rows.sort((a, b) => a.pm25 - b.pm25 || a.no2 - b.no2 || b.listings - a.listings || a.name.localeCompare(b.name))

  const best = rows[0] ?? null
  const worst = rows[rows.length - 1] ?? null
  const reachesCityAir = rows.some((row) => tenthAtMost(row.pm25, cityPm))
  const thin =
    best && best.listings < MIN_LISTINGS
      ? ` ${best.name} has ${best.listings} listings in ${monthLabel(month)}, so that median is thin.`
      : ''

  let insight: BudgetBracket['insight'] = null
  if (best && worst && !reachesCityAir) {
    insight = {
      title: `Read the ${best.name} asthma report`,
      href: `${REPORTS}/${reportSlug(best.name)}/asthma_and_the_environment/`,
      note: `At ${formatRent(budget)}, every neighborhood in this bracket has 2024 PM2.5 above the city mean of ${formatUg(cityPm)} µg/m³. The lowest is ${formatUg(best.pm25)} µg/m³ in ${best.name}, with NO2 at ${formatUg(best.no2)} ppb.${thin} Asking rent is for a new one-bedroom lease, not what a sitting tenant pays.`,
    }
  } else if (best && worst) {
    const spread =
      worst.id === best.id
        ? ''
        : ` The same budget also reaches ${worst.name} at ${formatUg(worst.pm25)} µg/m³.`
    insight = {
      title: `Look at new leases in ${best.name}`,
      href: `/?n=${best.id}&b=${encodeURIComponent(best.borough)}`,
      note: `${best.name} asks ${formatRent(best.ask)}. Its 2024 PM2.5 is ${formatUg(best.pm25)} µg/m³, at or under the city mean of ${formatUg(cityPm)}, with NO2 at ${formatUg(best.no2)} ppb.${spread}${thin} Asking rent is for a new one-bedroom lease, not what a sitting tenant pays.`,
    }
  }

  return { budget, month, cityPm, cityNo, rows, reachesCityAir, insight }
}
