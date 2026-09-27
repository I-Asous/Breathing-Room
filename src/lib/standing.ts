import {
  CITY,
  airAt,
  askingAt,
  burdenShare,
  deepPer1k,
  formatRate,
  formatShare,
  formatRent,
  last,
  percentChange,
  type Neighborhood,
} from './metrics'
import { MIN_LISTINGS, monthLabel } from './overlay'

export type Lean = 'better' | 'worse' | 'even'

export type StandingPart = { lean: Lean; text: string }

/** Within this share of the city value, a neighborhood reads as "about the same". */
const EVEN = { air: 0.03, rent: 0.05, burden: 0.05, homes: 0.1 }

function lean(value: number, city: number, band: number, higherIsWorse: boolean): Lean {
  const ratio = value / city - 1
  if (Math.abs(ratio) <= band) return 'even'
  return ratio > 0 === higherIsWorse ? 'worse' : 'better'
}

/** The month twelve months before `month` ("2026-08" → "2025-08"). */
function yearBefore(month: string): string {
  const [year, mm] = month.split('-')
  return `${Number(year) - 1}-${mm}`
}

/**
 * One plain line per theme, each against the city: 2024 air, the latest new-lease ask and its
 * one-year change, the share of renters who are rent-burdened, and deeply affordable homes per
 * household. Parts with no data are left out.
 */
export function standingFor(neighborhood: Neighborhood): StandingPart[] {
  const parts: StandingPart[] = []

  const pm = airAt(neighborhood.pm25, '2024')
  const cityPm = airAt(CITY.citywide.pm25, '2024')
  if (pm != null && cityPm != null) {
    const l = lean(pm, cityPm, EVEN.air, true)
    parts.push({
      lean: l,
      text: l === 'even' ? 'Air about the city average' : l === 'better' ? 'Cleaner air than the city' : 'Dirtier air than the city',
    })
  }

  const ask = last(neighborhood.asking1br)
  const cityAsk = last(CITY.citywide.asking1br)
  if (ask && cityAsk) {
    const l = lean(ask.median1br, cityAsk.median1br, EVEN.rent, true)
    const level =
      l === 'even'
        ? `new leases ask about the city's ${formatRent(cityAsk.median1br)}`
        : `new leases ask ${formatRent(ask.median1br)}, ${l === 'better' ? 'under' : 'over'} the city's ${formatRent(cityAsk.median1br)}`
    const before = askingAt(neighborhood.asking1br, yearBefore(ask.month))
    const change = before && ask.n >= MIN_LISTINGS ? percentChange(before.median1br, ask.median1br) : null
    const since = before ? monthLabel(before.month) : ''
    const trend =
      change == null
        ? ''
        : Math.abs(change) < 1
          ? `, flat since ${since}`
          : `, ${change > 0 ? 'up' : 'down'} ${Math.round(Math.abs(change))}% since ${since}`
    parts.push({ lean: l, text: `${level}${trend}` })
  }

  const burden = burdenShare([neighborhood])
  const cityBurden = burdenShare(CITY.neighborhoods)
  if (burden != null && cityBurden != null) {
    const l = lean(burden, cityBurden, EVEN.burden, true)
    const share = `${formatShare(burden)} of renters pay 30%+ of income on rent`
    parts.push({
      lean: l,
      text: l === 'even' ? `${share}, about the city's ${formatShare(cityBurden)}` : `${share}, ${l === 'worse' ? 'more' : 'less'} than the city's ${formatShare(cityBurden)}`,
    })
  }

  const homes = deepPer1k([neighborhood])
  const cityHomes = deepPer1k(CITY.neighborhoods)
  if (homes != null && cityHomes != null) {
    const l = lean(homes, cityHomes, EVEN.homes, false)
    const verb = l === 'even' ? 'about as many' : l === 'better' ? 'more' : 'fewer'
    parts.push({
      lean: l,
      text:
        homes === 0
          ? `no deeply affordable homes started since 2014 (city: ${formatRate(cityHomes)} per 1,000 households)`
          : `${verb} affordable homes per household ${l === 'even' ? 'as' : 'than'} the city (${formatRate(homes)} vs ${formatRate(cityHomes)} per 1,000)`,
    })
  }

  return parts
}
