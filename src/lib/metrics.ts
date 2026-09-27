import city from '../data/city.json'
import households from '../data/households.json'
import rentBurden from '../data/rent-burden.json'

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

export type Layer = 'air' | 'rent' | 'burden' | 'pair' | 'gap'

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
  /** Rent third and child-asthma third (0 low, 2 high), set only on the pair layer. */
  pair?: { rent: number; asthma: number }
}

const THIRD_NAMES = ['low', 'middle', 'high']

/** Which third of the peers a value falls in: 0, 1, or 2. */
export function thirdIndex(share: number): number {
  if (!Number.isFinite(share)) return 0
  return Math.max(0, Math.min(2, Math.floor(share * 3)))
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

  if (layer === 'burden') {
    const share = burdenShare([neighborhood])
    if (share == null) return { tone: null, label: 'No rent-burden estimate' }
    const all = peers.map((n) => burdenShare([n])).filter((v): v is number => v != null)
    return { tone: toneIndex(percentile(share, all)), label: `${formatShare(share)} of renters pay 30%+ of income` }
  }

  if (layer === 'pair') {
    const rent = latestAsking(neighborhood, rentMonth)
    const asthma = last(neighborhood.asthmaChild)?.value
    if (rent == null || asthma == null) return { tone: null, label: 'Missing rent or asthma' }
    const rents = peers
      .map((n) => latestAsking(n, rentMonth))
      .filter((v): v is number => v != null)
    const asthmas = peers
      .map((n) => last(n.asthmaChild)?.value)
      .filter((v): v is number => v != null)
    const pair = {
      rent: thirdIndex(percentile(rent, rents)),
      asthma: thirdIndex(percentile(asthma, asthmas)),
    }
    return {
      tone: null,
      pair,
      label: `Asking rent for new leases ${THIRD_NAMES[pair.rent]} (${formatRent(rent)}), child asthma ${
        THIRD_NAMES[pair.asthma]
      } (${formatCount(Math.round(asthma))} per 100,000)`,
    }
  }

  const gap = equityGap(neighborhood, peers, rentMonth)
  if (gap == null) return { tone: null, label: 'Not enough rent data' }
  return {
    tone: toneIndex((gap + 1) / 2),
    label: gap >= 0.15 ? 'Rent high, deep units thin' : gap <= -0.15 ? 'More deep units' : 'Closer to the pack',
  }
}

/** Lowest and highest value on a single-measure layer, for the legend ends. */
export function layerRange(
  layer: Layer,
  airYear: string,
  rentMonth: string,
  peers: Neighborhood[],
): { low: string; high: string } | null {
  const values =
    layer === 'air'
      ? peers.map((n) => airAt(n.pm25, airYear))
      : layer === 'rent'
        ? peers.map((n) => askingAt(n.asking1br, rentMonth)?.median1br ?? null)
        : layer === 'burden'
          ? peers.map((n) => burdenShare([n]))
          : []
  const found = values.filter((v): v is number => v != null)
  if (!found.length) return null
  const low = Math.min(...found)
  const high = Math.max(...found)
  return layer === 'air'
    ? { low: `${formatUg(low)} µg/m³`, high: `${formatUg(high)} µg/m³` }
    : layer === 'burden'
      ? { low: `${formatShare(low)} burdened`, high: `${formatShare(high)} burdened` }
      : { low: formatRent(low), high: formatRent(high) }
}

function latestAsking(neighborhood: Neighborhood, month: string): number | null {
  return askingAt(neighborhood.asking1br, month)?.median1br ?? last(neighborhood.asking1br)?.median1br ?? null
}

type BurdenRow = { renters: number; burdened: number; severe: number }
const BURDEN: Record<string, BurdenRow> = rentBurden.byUhf
export const BURDEN_PERIOD = rentBurden.period
export const BURDEN_CITY = rentBurden.city
export const BURDEN_CHECK = rentBurden.check

/**
 * Share of renter households paying 30% or more of income on gross rent, in percent, summed over a
 * set of neighborhoods (so a borough is its renters, not the median of its neighborhoods).
 */
export function burdenShare(rows: Neighborhood[], key: 'burdened' | 'severe' = 'burdened'): number | null {
  let renters = 0
  let count = 0
  for (const n of rows) {
    const row = BURDEN[n.id]
    if (!row) continue
    renters += row.renters
    count += row[key]
  }
  return renters ? (100 * count) / renters : null
}

export function formatShare(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${Math.round(value)}%`
}

const HOUSEHOLDS: Record<string, number> = households.byUhf
export const HOUSEHOLDS_PERIOD = households.period

/** Households in a set of neighborhoods, from the ACS 5-year ZIP counts. */
export function householdsIn(rows: Neighborhood[]): number {
  return rows.reduce((sum, n) => sum + (HOUSEHOLDS[n.id] ?? 0), 0)
}

/** Deeply affordable units started since 2014 per 1,000 households, so large and small places compare. */
export function deepPer1k(rows: Neighborhood[]): number | null {
  const count = householdsIn(rows)
  if (!count) return null
  return (1000 * rows.reduce((sum, n) => sum + n.housing.since2014eli, 0)) / count
}

export function formatRate(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value < 10 ? value.toFixed(1) : String(Math.round(value))
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
  const rates = peers.map((n) => deepPer1k([n])).filter((v): v is number => v != null)
  const rate = deepPer1k([neighborhood])
  if (rate == null) return null
  const rentShare = percentile(rent, rents)
  const unitShare = percentile(rate, rates)
  return rentShare - unitShare
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
  deep_per_1k_households: number | null
  rent_burden_pct: number | null
  rent_burden_severe_pct: number | null
  city_rent_burden_pct: number | null
  rent_burden_period: string
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
    deep_per_1k_households: deepPer1k([neighborhood]),
    rent_burden_pct: burdenShare([neighborhood]),
    rent_burden_severe_pct: burdenShare([neighborhood], 'severe'),
    city_rent_burden_pct: burdenShare(CITY.neighborhoods),
    rent_burden_period: rentBurden.period,
    counted_units: neighborhood.housing.since2014counted,
  }
}

export const BOROUGHS = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'] as const

export type Borough = (typeof BOROUGHS)[number]

export function isBorough(value: string | null): value is Borough {
  return value != null && (BOROUGHS as readonly string[]).includes(value)
}

export function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Median across neighborhoods at each period, keeping only periods some neighborhood reports. */
function medianSeries<P, K extends string | number>(
  lists: P[][],
  key: (point: P) => K,
  value: (point: P) => number,
): { key: K; value: number; points: P[] }[] {
  const byKey = new Map<K, P[]>()
  for (const list of lists) {
    for (const point of list) {
      const k = key(point)
      byKey.set(k, [...(byKey.get(k) ?? []), point])
    }
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, points]) => ({ key: k, value: median(points.map(value)) ?? 0, points }))
}

export type AreaSummary = CityData['citywide'] & { deep: number; deepPer1k: number | null; count: number }

/** A borough read as the median of its neighborhoods, the same way the borough table reads it. */
export function boroughSummary(borough: Borough): AreaSummary {
  const rows = CITY.neighborhoods.filter((n) => n.borough === borough)
  const air = (pick: (n: Neighborhood) => AirPoint[]) =>
    medianSeries(rows.map(pick), (p) => p.period, (p) => p.value).map(({ key, value }) => ({
      period: key,
      value,
    }))
  return {
    pm25: air((n) => n.pm25),
    no2: air((n) => n.no2),
    asthmaChild: air((n) => n.asthmaChild),
    zori: medianSeries(rows.map((n) => n.zori), (p) => p.year, (p) => p.value).map(({ key, value }) => ({
      year: key,
      value,
    })),
    asking1br: medianSeries(rows.map((n) => n.asking1br), (p) => p.month, (p) => p.median1br).map(
      ({ key, value, points }) => ({
        month: key,
        median1br: value,
        medianAll: null,
        n: points.reduce((sum, p) => sum + p.n, 0),
      }),
    ),
    deep: rows.reduce((sum, n) => sum + n.housing.since2014eli, 0),
    deepPer1k: deepPer1k(rows),
    count: rows.length,
  }
}

export function neighborhoodById(id: string | null): Neighborhood | null {
  if (!id) return null
  return CITY.neighborhoods.find((n) => n.id === id) ?? null
}

function milesBetween(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** EPA PM2.5 monitors near an address. The neighborhood color is still the survey, not these dots. */
export function nearestPmMonitors(lon: number, lat: number, radiusMiles = 2) {
  const ranked = CITY.airMonitors
    .map((monitor) => {
      const latest = last(monitor.pm25)
      if (!latest) return null
      return {
        name: monitor.name,
        miles: milesBetween(lon, lat, monitor.lon, monitor.lat),
        year: latest.year,
        value: latest.value,
      }
    })
    .filter((monitor): monitor is NonNullable<typeof monitor> => monitor != null)
    .sort((a, b) => a.miles - b.miles)
  const nearest = ranked[0]
  if (!nearest) return null
  return {
    citywide: ranked.length,
    within: ranked.filter((monitor) => monitor.miles <= radiusMiles).length,
    radiusMiles,
    nearest,
  }
}
