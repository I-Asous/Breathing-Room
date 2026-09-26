import city from '../data/city.json'

export type AirPoint = { period: string; value: number }
export type ZoriPoint = { year: number; value: number }
export type AskingPoint = { month: string; median1br: number; medianAll: number | null; n: number }
export type Housing = {
  eli: number
  vli: number
  low: number
  counted: number
  projects: number
  since2014eli: number
  since2014counted: number
}

export type Neighborhood = {
  id: string
  name: string
  borough: string
  pm25: AirPoint[]
  no2: AirPoint[]
  asthmaChild: AirPoint[]
  asthmaAdult: AirPoint[]
  zori: ZoriPoint[]
  asking1br: AskingPoint[]
  housing: Housing
}

export type MonitorPoint = { year: number; value: number; certified: boolean }
export type AirMonitor = {
  id: string
  name: string
  borough: string
  lat: number
  lon: number
  pm25: MonitorPoint[]
  no2: MonitorPoint[]
}
export type TrafficNote = {
  headline: string
  source: string
  href: string
  measured: { latestMonth: string; latestMonthEntries: number; note: string }
} | Record<string, never>

export type CityData = {
  zoriLatest: string
  citywide: {
    pm25: AirPoint[]
    no2: AirPoint[]
    asthmaChild: AirPoint[]
    zori: ZoriPoint[]
    asking1br: AskingPoint[]
  }
  neighborhoods: Neighborhood[]
  airMonitors: AirMonitor[]
  trafficNote: TrafficNote
  sources: { name: string; publisher: string; href: string }[]
}

export const CITY = city as CityData

export function monitorLabel(monitor: AirMonitor): string {
  const pm = last(monitor.pm25)
  if (!pm) return 'No PM2.5 reading'
  return `PM2.5 ${formatUg(pm.value)} µg/m³, ${pm.year}${pm.certified ? '' : ' (preliminary)'}`
}

export const AIR_YEARS = Array.from(
  new Set(CITY.neighborhoods.flatMap((n) => n.pm25.map((p) => p.period))),
).sort()

export const RENT_MONTHS = CITY.citywide.asking1br.map((p) => p.month)

export type Layer = 'stack' | 'air' | 'rent' | 'gap'

export function airAt(series: AirPoint[], period: string): number | null {
  return series.find((p) => p.period === period)?.value ?? null
}

export function askingAt(series: AskingPoint[], month: string): AskingPoint | null {
  return series.find((p) => p.month === month) ?? null
}

export function last<T>(series: T[]): T | null {
  return series.length ? series[series.length - 1] : null
}

export function first<T>(series: T[]): T | null {
  return series.length ? series[0] : null
}

/** Share of observations strictly below `value`. One neighborhood maps to 0. */
export function percentile(value: number, all: number[]): number {
  if (all.length <= 1) return 0
  const below = all.filter((v) => v < value).length
  return below / (all.length - 1)
}

export function toneIndex(share: number): number {
  if (!Number.isFinite(share)) return 0
  return Math.max(0, Math.min(7, Math.round(share * 7)))
}

export function formatUg(value: number | null): string {
  if (value == null) return '—'
  return value.toFixed(1)
}

export function formatRent(value: number | null): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

export function percentChange(from: number | null, to: number | null): number | null {
  if (from == null || to == null || from === 0) return null
  return ((to - from) / from) * 100
}

export function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const rounded = Math.round(value)
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded}%`
}

export type Reading = {
  tone: number | null
  label: string
}

export function readingFor(
  neighborhood: Neighborhood,
  layer: Layer,
  airYear: string,
  rentMonth: string,
  peers: Neighborhood[],
): Reading {
  if (layer === 'air') {
    const value = airAt(neighborhood.pm25, airYear)
    if (value == null) return { tone: null, label: 'No PM2.5 this year' }
    const all = peers
      .map((n) => airAt(n.pm25, airYear))
      .filter((v): v is number => v != null)
    return { tone: toneIndex(percentile(value, all)), label: `${formatUg(value)} µg/m³` }
  }

  if (layer === 'rent') {
    const point = askingAt(neighborhood.asking1br, rentMonth)
    if (!point) return { tone: null, label: 'No listings this month' }
    const all = peers
      .map((n) => askingAt(n.asking1br, rentMonth)?.median1br)
      .filter((v): v is number => v != null)
    return {
      tone: toneIndex(percentile(point.median1br, all)),
      label: formatRent(point.median1br),
    }
  }

  if (layer === 'gap') {
    const gap = equityGap(neighborhood, peers, rentMonth)
    if (gap == null) return { tone: null, label: 'Not enough rent data' }
    return {
      tone: toneIndex((gap + 1) / 2),
      label: gap >= 0.15 ? 'Rent high, deep units thin' : gap <= -0.15 ? 'More deep units' : 'Closer to the pack',
    }
  }

  const share = stackShare(neighborhood, peers)
  if (share == null) return { tone: null, label: 'Incomplete record' }
  return { tone: toneIndex(share), label: 'Combined pressure' }
}

function latestAsking(neighborhood: Neighborhood, month: string): number | null {
  return askingAt(neighborhood.asking1br, month)?.median1br ?? last(neighborhood.asking1br)?.median1br ?? null
}

export function equityGap(
  neighborhood: Neighborhood,
  peers: Neighborhood[],
  rentMonth: string,
): number | null {
  const rent = latestAsking(neighborhood, rentMonth)
  if (rent == null) return null
  const rents = peers
    .map((n) => latestAsking(n, rentMonth))
    .filter((v): v is number => v != null)
  const units = peers.map((n) => n.housing.since2014eli)
  const rentShare = percentile(rent, rents)
  const unitShare = percentile(neighborhood.housing.since2014eli, units)
  return rentShare - unitShare
}

export function stackShare(neighborhood: Neighborhood, peers: Neighborhood[]): number | null {
  const parts: number[] = []
  const pm = airAt(neighborhood.pm25, '2024') ?? last(neighborhood.pm25)?.value
  if (pm != null) {
    const all = peers
      .map((n) => airAt(n.pm25, '2024') ?? last(n.pm25)?.value)
      .filter((v): v is number => v != null)
    parts.push(percentile(pm, all))
  }
  const rent = last(neighborhood.asking1br)?.median1br
  if (rent != null) {
    const all = peers
      .map((n) => last(n.asking1br)?.median1br)
      .filter((v): v is number => v != null)
    parts.push(percentile(rent, all))
  }
  const asthma = last(neighborhood.asthmaChild)?.value
  if (asthma != null) {
    const all = peers
      .map((n) => last(n.asthmaChild)?.value)
      .filter((v): v is number => v != null)
    parts.push(percentile(asthma, all))
  }
  if (!parts.length) return null
  return parts.reduce((sum, n) => sum + n, 0) / parts.length
}

export type BriefFacts = {
  name: string
  borough: string
  pm25_2024: number | null
  pm25_2009: number | null
  no2_2024: number | null
  no2_2009: number | null
  asthma_child: number | null
  asthma_period: string | null
  city_pm25_2024: number | null
  city_asthma: number | null
  city_asthma_period: string | null
  asking_1br: number | null
  asking_month: string | null
  asking_n: number | null
  asking_start: number | null
  asking_start_month: string | null
  city_asking_1br: number | null
  zori_first: number | null
  zori_first_year: number | null
  zori_2019: number | null
  zori_last: number | null
  zori_last_year: number | null
  deep_units: number
  counted_units: number
}

export function factsFor(neighborhood: Neighborhood): BriefFacts {
  const ask = last(neighborhood.asking1br)
  const askStart = first(neighborhood.asking1br)
  const zoriStart = first(neighborhood.zori)
  const zoriEnd = last(neighborhood.zori)
  const cityAsk = last(CITY.citywide.asking1br)
  const cityAsthma = last(CITY.citywide.asthmaChild)
  const asthma = last(neighborhood.asthmaChild)
  return {
    name: neighborhood.name,
    borough: neighborhood.borough,
    pm25_2024: airAt(neighborhood.pm25, '2024'),
    pm25_2009: airAt(neighborhood.pm25, '2009'),
    no2_2024: airAt(neighborhood.no2, '2024'),
    no2_2009: airAt(neighborhood.no2, '2009'),
    asthma_child: asthma?.value ?? null,
    asthma_period: asthma?.period ?? null,
    city_pm25_2024: airAt(CITY.citywide.pm25, '2024'),
    city_asthma: cityAsthma?.value ?? null,
    city_asthma_period: cityAsthma?.period ?? null,
    asking_1br: ask?.median1br ?? null,
    asking_month: ask?.month ?? null,
    asking_n: ask?.n ?? null,
    asking_start: askStart?.median1br ?? null,
    asking_start_month: askStart?.month ?? null,
    city_asking_1br: cityAsk?.median1br ?? null,
    zori_first: zoriStart?.value ?? null,
    zori_first_year: zoriStart?.year ?? null,
    zori_2019: neighborhood.zori.find((p) => p.year === 2019)?.value ?? null,
    zori_last: zoriEnd?.value ?? null,
    zori_last_year: zoriEnd?.year ?? null,
    deep_units: neighborhood.housing.since2014eli,
    counted_units: neighborhood.housing.since2014counted,
  }
}

export function neighborhoodById(id: string | null): Neighborhood | null {
  if (!id) return null
  return CITY.neighborhoods.find((n) => n.id === id) ?? null
}
