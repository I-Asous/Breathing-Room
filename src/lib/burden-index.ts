import {
  CITY,
  airAt,
  askingAt,
  burdenShare,
  BURDEN_PERIOD,
  deepPer1k,
  formatPercent,
  formatRate,
  formatRent,
  formatUg,
  last,
  percentChange,
  percentile,
  type Neighborhood,
} from './metrics'
import { ASK_WINDOW, MIN_LISTINGS, monthLabel } from './overlay'

export type BurdenWeights = { air: number; burden: number; rent: number }

export const DEFAULT_WEIGHTS: BurdenWeights = { air: 1, burden: 1, rent: 1 }

/** At or above the middle of the 42 neighborhoods, using a rank where 1 means the heaviest. */
const ABOVE_MIDDLE = 0.5

export const SCORE_MEANS =
  'Heavier means higher 2024 PM2.5, a larger share of renters paying 30% or more of income, and a faster rise in new one-bedroom asks. Each measure is ranked among the 42 neighborhoods, then averaged with the weights below. Equal weights to start. This is not a grade of the people who live here.'

export const SCORE_LIMITS =
  'A rent trend with fewer than 20 listings in either month is left out, and the other weights are rescaled. Geography is the neighborhood, not the block: rent burden is Census ZIP counts summed into the neighborhood, and a listing is placed by its ZIP centroid. This is not a forecast.'

export type BurdenRow = {
  id: string
  name: string
  borough: string
  score: number | null
  airShare: number | null
  burdenShare: number | null
  rentShare: number | null
  pm25: number | null
  no2: number | null
  burdenPct: number | null
  severePct: number | null
  rentChange: number | null
  rentCounted: boolean
  ask: number | null
  askMonth: string | null
}

function rankShare(values: (number | null)[]): (number | null)[] {
  const present = values.filter((value): value is number => value != null)
  return values.map((value) => (value == null ? null : percentile(value, present)))
}

export function weightSplit(weights: BurdenWeights): BurdenWeights | null {
  const air = Math.max(0, weights.air)
  const burden = Math.max(0, weights.burden)
  const rent = Math.max(0, weights.rent)
  const sum = air + burden + rent
  if (sum <= 0) return null
  return { air: air / sum, burden: burden / sum, rent: rent / sum }
}

/** Whole-number percents that add to 100. Rounding error stays on the largest weight. */
export function weightPercents(weights: BurdenWeights): BurdenWeights | null {
  const split = weightSplit(weights)
  if (!split) return null
  const raw = [Math.round(split.air * 100), Math.round(split.burden * 100), Math.round(split.rent * 100)]
  const drift = 100 - raw.reduce((total, value) => total + value, 0)
  const largest = raw.indexOf(Math.max(...raw))
  raw[largest] += drift
  return { air: raw[0], burden: raw[1], rent: raw[2] }
}

function scoreFrom(shares: { air: number | null; burden: number | null; rent: number | null }, weights: BurdenWeights): number | null {
  const parts: [number, number][] = []
  if (shares.air != null && weights.air > 0) parts.push([shares.air, weights.air])
  if (shares.burden != null && weights.burden > 0) parts.push([shares.burden, weights.burden])
  if (shares.rent != null && weights.rent > 0) parts.push([shares.rent, weights.rent])
  const sum = parts.reduce((total, part) => total + part[1], 0)
  if (sum <= 0) return null
  return (100 * parts.reduce((total, part) => total + part[0] * part[1], 0)) / sum
}

export function burdenRows(weights: BurdenWeights = DEFAULT_WEIGHTS): BurdenRow[] {
  const hoods = CITY.neighborhoods
  const start = ASK_WINDOW.start
  const end = ASK_WINDOW.end
  const pm = hoods.map((neighborhood) => airAt(neighborhood.pm25, '2024'))
  const no2 = hoods.map((neighborhood) => airAt(neighborhood.no2, '2024'))
  const burden = hoods.map((neighborhood) => burdenShare([neighborhood]))
  const severe = hoods.map((neighborhood) => burdenShare([neighborhood], 'severe'))
  const rentChange = hoods.map((neighborhood) => {
    const from = askingAt(neighborhood.asking1br, start)
    const to = askingAt(neighborhood.asking1br, end)
    if (!from || !to || from.n < MIN_LISTINGS || to.n < MIN_LISTINGS) return null
    return percentChange(from.median1br, to.median1br)
  })
  const airShare = rankShare(pm)
  const burdenRank = rankShare(burden)
  const rentShare = rankShare(rentChange)

  return hoods
    .map((neighborhood, index) => {
      const ask = askingAt(neighborhood.asking1br, end) ?? last(neighborhood.asking1br)
      const shares = {
        air: airShare[index] ?? null,
        burden: burdenRank[index] ?? null,
        rent: rentShare[index] ?? null,
      }
      return {
        id: neighborhood.id,
        name: neighborhood.name,
        borough: neighborhood.borough,
        score: scoreFrom(shares, weights),
        airShare: shares.air,
        burdenShare: shares.burden,
        rentShare: shares.rent,
        pm25: pm[index] ?? null,
        no2: no2[index] ?? null,
        burdenPct: burden[index] ?? null,
        severePct: severe[index] ?? null,
        rentChange: rentChange[index] ?? null,
        rentCounted: rentChange[index] != null,
        ask: ask?.median1br ?? null,
        askMonth: ask?.month ?? null,
      }
    })
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name))
}

export function carriesAllThree(row: BurdenRow): boolean {
  return (
    (row.airShare ?? -1) >= ABOVE_MIDDLE &&
    (row.burdenShare ?? -1) >= ABOVE_MIDDLE &&
    (row.rentShare ?? -1) >= ABOVE_MIDDLE
  )
}

export function togetherLine(rows: BurdenRow[]): { names: BurdenRow[]; sentence: string } {
  const names = rows.filter(carriesAllThree).sort((a, b) => a.name.localeCompare(b.name))
  if (!names.length) {
    return {
      names,
      sentence:
        'No neighborhood is above the middle of the 42 on all three: 2024 PM2.5, the share of renters paying 30% or more of income, and the rise in new-lease asks.',
    }
  }
  return {
    names,
    sentence:
      'Above the middle of the 42 neighborhoods on all three — 2024 PM2.5, the share of renters paying 30% or more of income, and the rise in new-lease asks:',
  }
}

/** Signed percent apart from the city. Under 1% reads as about the same. */
export function apartFromCity(value: number, city: number, cityLabel: string): string {
  if (city === 0) return `the city average is ${cityLabel}`
  const pct = Math.round(((value - city) / Math.abs(city)) * 100)
  if (Math.abs(pct) < 1) return `about the same as the city average of ${cityLabel}`
  return `${Math.abs(pct)}% ${pct > 0 ? 'higher' : 'lower'} than the city average of ${cityLabel}`
}

export function pointsFromCity(value: number, city: number): string {
  const gap = Math.round(value) - Math.round(city)
  const cityLabel = `${Math.round(city)}%`
  if (gap === 0) return `about the same as the city's ${cityLabel}`
  return `${Math.abs(gap)} percentage points ${gap > 0 ? 'above' : 'below'} the city's ${cityLabel}`
}

export function rentAgainstAsk(paid: number, ask: number): string {
  if (ask === 0) return `The median new one-bedroom ask is ${formatRent(ask)}.`
  const pct = Math.round(((paid - ask) / ask) * 100)
  const askLabel = formatRent(ask)
  if (Math.abs(pct) < 1) {
    return `${formatRent(paid)} matches the median new one-bedroom ask of ${askLabel}. That ask is what listings requested, not what a sitting tenant pays.`
  }
  return `${formatRent(paid)} is ${Math.abs(pct)}% ${pct > 0 ? 'above' : 'below'} the median new one-bedroom ask of ${askLabel}. That ask is what listings requested, not what a sitting tenant pays.`
}

export type PlaceRead = {
  airMeans: string
  airLine: string
  no2Line: string | null
  asthmaLine: string | null
  burdenMeans: string
  burdenLine: string
  burdenCaveat: string
  deepLine: string | null
  rentMeans: string
  rentLine: string
  rentMove: string
}

export function readPlace(neighborhood: Neighborhood, row: BurdenRow): PlaceRead {
  const cityPm = airAt(CITY.citywide.pm25, '2024')
  const cityNo2 = airAt(CITY.citywide.no2, '2024')
  const cityBurden = burdenShare(CITY.neighborhoods)
  const cityAsk = last(CITY.citywide.asking1br)
  const cityStart = askingAt(CITY.citywide.asking1br, ASK_WINDOW.start)
  const cityEnd = askingAt(CITY.citywide.asking1br, ASK_WINDOW.end)
  const cityRentChange =
    cityStart && cityEnd ? percentChange(cityStart.median1br, cityEnd.median1br) : null
  const asthma = last(neighborhood.asthmaChild)
  const cityAsthma = last(CITY.citywide.asthmaChild)
  const deep = deepPer1k([neighborhood])
  const cityDeep = deepPer1k(CITY.neighborhoods)

  const airLine =
    row.pm25 != null && cityPm != null
      ? `${formatUg(row.pm25)} µg/m³ in 2024, ${apartFromCity(row.pm25, cityPm, `${formatUg(cityPm)} µg/m³`)}.`
      : 'No 2024 PM2.5 mean for this neighborhood.'

  const no2Line =
    row.no2 != null && cityNo2 != null
      ? `NO2, the traffic pollutant, was ${formatUg(row.no2)} ppb in 2024, ${apartFromCity(row.no2, cityNo2, `${formatUg(cityNo2)} ppb`)}. The survey does not measure distance to a highway.`
      : null

  const asthmaLine =
    asthma && cityAsthma
      ? `Child asthma emergency visits tied to PM2.5 were ${Math.round(asthma.value)} per 100,000 in ${asthma.period}, ${apartFromCity(asthma.value, cityAsthma.value, `${Math.round(cityAsthma.value)} per 100,000`)}. That record ends in ${asthma.period}.`
      : null

  const burdenLine =
    row.burdenPct != null && cityBurden != null
      ? `${Math.round(row.burdenPct)}% of renter households pay 30% or more of income, ${pointsFromCity(row.burdenPct, cityBurden)}.${
          row.severePct != null ? ` ${Math.round(row.severePct)}% pay half or more.` : ''
        }`
      : 'No rent-burden estimate for this neighborhood.'

  const deepLine =
    deep != null && cityDeep != null
      ? `${formatRate(deep)} deeply affordable homes were financed per 1,000 households since 2014, against ${formatRate(cityDeep)} citywide. That is production, not vacant apartments.`
      : null

  const rentLine =
    row.ask != null && cityAsk
      ? `${formatRent(row.ask)} in ${row.askMonth ? monthLabel(row.askMonth) : 'the latest month'}, ${apartFromCity(row.ask, cityAsk.median1br, formatRent(cityAsk.median1br))}.`
      : 'No new one-bedroom asking rent for this neighborhood.'

  const rentMove = row.rentCounted
    ? `New asks ${formatPercent(row.rentChange)} since ${monthLabel(ASK_WINDOW.start)}${
        cityRentChange != null ? `, against ${formatPercent(cityRentChange)} citywide` : ''
      }.`
    : 'Fewer than 20 listings in a month this comparison needs, so the rise is left out of the score.'

  return {
    airMeans: 'Fine particles averaged across 2024. This is not a reading for today.',
    airLine,
    no2Line,
    asthmaLine,
    burdenMeans: 'The share of renter households paying at least 30% of income on rent and utilities.',
    burdenLine,
    burdenCaveat: `American Community Survey 5-year estimate, ${BURDEN_PERIOD}, summed from ZIP codes into this neighborhood. The Census publishes a margin of error on each ZIP. This page does not carry that margin.`,
    deepLine,
    rentMeans:
      'The median asking rent for a new one-bedroom listing. Tenants already in place, including rent-stabilized ones, often pay less.',
    rentLine,
    rentMove,
  }
}
