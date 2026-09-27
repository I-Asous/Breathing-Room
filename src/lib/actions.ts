import {
  CITY,
  airAt,
  askingAt,
  deepPer1k,
  formatRate,
  formatRent,
  formatUg,
  last,
  median,
  percentChange,
  type AskingPoint,
  type Neighborhood,
} from './metrics'
import { ASK_WINDOW, formatChange, monthLabel } from './overlay'
import { reportSlug } from './next-steps'

/** EPA primary annual PM2.5 standard, revised in 2024. */
export const EPA_ANNUAL_PM25 = 9

const REPORTS = 'https://a816-dohbesp.nyc.gov/IndicatorPublic/neighborhood-reports'
const MIN_LISTINGS = 20

/** One-year renewal caps that overlap the Feb 2025–Aug 2026 listing window. */
export const RGB_ORDERS = [
  {
    id: '56',
    oneYear: 2.75,
    from: 'October 1, 2024',
    to: 'September 30, 2025',
    href: 'https://rentguidelinesboard.cityofnewyork.us/2024-25-apartment-loft-order-56/',
  },
  {
    id: '57',
    oneYear: 3,
    from: 'October 1, 2025',
    to: 'September 30, 2026',
    href: 'https://rentguidelinesboard.cityofnewyork.us/2025-26-apartment-loft-order-57/',
  },
] as const

export type Lever = { title: string; href: string; note: string }

const AIRNOW = 'https://www.airnow.gov/'

/**
 * Official lookups. None of these are a measured cause of the neighborhood mean.
 */
export const CAUSE_LOOKUPS: Lever[] = [
  {
    title: "Check today's air",
    href: AIRNOW,
    note: 'AirNow is the daily index. This atlas does not have a reading for today.',
  },
  {
    title: 'Report an idling truck',
    href: 'https://portal.311.nyc.gov/article/?kanumber=KA-02222',
    note: 'Idling is illegal after 3 minutes, or 1 minute next to a school. This atlas does not show which trucks idle here.',
  },
  {
    title: 'Report a truck off the truck route',
    href: 'https://portal.311.nyc.gov/article/?kanumber=KA-01957',
    note: 'The complaint is checked against the city truck-route map. This atlas does not draw those routes.',
  },
  {
    title: 'Report a waste transfer station',
    href: 'https://portal.311.nyc.gov/article/?kanumber=KA-02336',
    note: 'Dust, odor, and open gates. This atlas does not locate the stations.',
  },
  {
    title: 'See the peaker plants',
    href: 'https://www.peakcoalition.org/',
    note: 'Peak Coalition maps the plants. This atlas does not score a plant against a neighborhood.',
  },
  {
    title: 'Cooling assistance',
    href: 'https://portal.311.nyc.gov/article/?kanumber=KA-02552',
    note: 'The 2025–26 HEAP cooling window closed June 5, 2026. Check 311 for the next season. That benefit is an air conditioner for an eligible household, not a home purifier.',
  },
  {
    title: 'Street trees',
    href: 'https://portal.311.nyc.gov/article/?kanumber=KA-01895',
    note: 'Parks does not take requests for a new street tree. Planting follows the heat-vulnerability list.',
  },
  {
    title: 'Community board calendar',
    href: 'https://portal.311.nyc.gov/article/?kanumber=KA-01785',
    note: 'Hearing dates are posted by each of the 59 boards. They are not in this atlas.',
  },
]

export function tenantLevers(address: string | null): Lever[] {
  const where = address ? ` Search for ${address}.` : ' Search the building address.'
  return [
    {
      title: 'Request your rent history',
      href: 'https://app.justfix.org/en/rh/splash',
      note: 'JustFix files the request with the state DHCR. The history shows whether this apartment was registered as rent-stabilized. This atlas cannot tell you that.',
    },
    {
      title: 'See if the building registered regulated units',
      href: 'https://hcr.ny.gov/tenants-self-service-applications',
      note: 'The state building search shows registered units. Registration of some units is not the same as every apartment being stabilized.',
    },
    {
      title: 'Look up the landlord',
      href: 'https://whoownswhat.justfix.org/en/',
      note: `Who Owns What shows HPD violations, eviction cases, and other buildings under the same owner.${where}`,
    },
    {
      title: 'Open HPD Online',
      href: 'https://hpdonline.nyc.gov/hpdonline/',
      note: `Complaints, violations, registration, and litigation for the building.${where}`,
    },
    {
      title: 'Ask for a free lawyer',
      href: 'https://portal.311.nyc.gov/article/?kanumber=KA-01041',
      note: 'Right to Counsel is free legal help in an eviction case, in every ZIP code. Call 311 and ask for the Tenant Helpline.',
    },
    {
      title: 'Call a tenant union',
      href: 'https://www.metcouncilonhousing.org/',
      note: 'Met Council on Housing is a citywide tenant union. This atlas does not name a union for each neighborhood.',
    },
    {
      title: 'Enter the affordable housing lotteries',
      href: 'https://housingconnect.nyc.gov/PublicWeb/',
      note: 'Housing Connect is the city lottery. One application covers many buildings. Deeply affordable counts on this page are financed units, not vacant listings.',
    },
  ]
}

export type AirAdvice = {
  pm25: number
  cityPm: number
  aboveStandard: boolean
  asthmaAbove: boolean
  summary: string
  sensitive: string
  report: Lever
}

export function airAdvice(neighborhood: Neighborhood): AirAdvice | null {
  const pm = airAt(neighborhood.pm25, '2024')
  const cityPm = airAt(CITY.citywide.pm25, '2024')
  const asthma = last(neighborhood.asthmaChild)
  const cityAsthma = last(CITY.citywide.asthmaChild)
  if (pm == null || cityPm == null || !asthma || !cityAsthma) return null

  const aboveStandard = Number(pm.toFixed(1)) > EPA_ANNUAL_PM25
  const asthmaAbove = asthma.value > cityAsthma.value
  const pmAbove = Number(pm.toFixed(1)) > Number(cityPm.toFixed(1))
  const place = `${formatUg(pm)} µg/m³ in 2024, against a city mean of ${formatUg(cityPm)}`
  const standard = aboveStandard
    ? `That annual mean is above the EPA annual standard of ${EPA_ANNUAL_PM25.toFixed(1)} µg/m³.`
    : `That annual mean is under the EPA annual standard of ${EPA_ANNUAL_PM25.toFixed(1)} µg/m³.`

  let sensitive: string
  if (aboveStandard) {
    sensitive = `People with asthma, children, and older adults: use AirNow for the day before outdoor exercise. The 2024 mean is not a reading for this hour. The air record does not show whether the toll changed the air.`
  } else if (asthmaAbove) {
    sensitive = `Child asthma visits in ${asthma.period} are ${Math.round(asthma.value)} per 100,000, above the city ${Math.round(cityAsthma.value)}. Sensitive groups already show up in that record. Use AirNow for the day. The air record does not show whether the toll changed the air.`
  } else if (pmAbove) {
    sensitive = `The year is higher than the city mean. Sensitive groups should use AirNow, not this average, to decide on outdoor exercise. The air record does not show whether the toll changed the air.`
  } else {
    sensitive = `The annual record is not above the city mean, and child asthma visits in ${asthma.period} are not above the city. For the day, use AirNow.`
  }

  return {
    pm25: pm,
    cityPm,
    aboveStandard,
    asthmaAbove,
    summary: `The 2024 annual PM2.5 mean in ${neighborhood.name} is ${place}. ${standard}`,
    sensitive,
    report: {
      title: `Read the ${neighborhood.name} asthma report`,
      href: `${REPORTS}/${reportSlug(neighborhood.name)}/asthma_and_the_environment/`,
      note: 'NYC Health describes what is driving visits in this neighborhood. It is not a list of trucks or plants on one block.',
    },
  }
}

export type StackPlace = {
  id: string
  name: string
  borough: string
  pm25: number
  asthma: number
  asthmaPeriod: string
  asthmaAbove: boolean
  ask: number
  listings: number
  deepPer1k: number
}

/**
 * Neighborhoods whose latest new one-bedroom ask is above the city and whose
 * 2024 PM2.5 is above the city. Eviction filings and rent burden are not here.
 */
export function higherAskHigherAir(peers: Neighborhood[] = CITY.neighborhoods): StackPlace[] {
  const cityPm = airAt(CITY.citywide.pm25, '2024')
  const cityAsk = last(CITY.citywide.asking1br)
  const cityAsthma = last(CITY.citywide.asthmaChild)
  const month = ASK_WINDOW.end
  if (cityPm == null || !cityAsk || !cityAsthma || !month) return []

  const places: StackPlace[] = []
  for (const neighborhood of peers) {
    const pm = airAt(neighborhood.pm25, '2024')
    const asthma = last(neighborhood.asthmaChild)
    const ask = askingAt(neighborhood.asking1br, month)
    const deep = deepPer1k([neighborhood])
    if (pm == null || !asthma || !ask || deep == null) continue
    if (ask.n < MIN_LISTINGS || ask.median1br <= cityAsk.median1br) continue
    if (Number(pm.toFixed(1)) <= Number(cityPm.toFixed(1))) continue
    places.push({
      id: neighborhood.id,
      name: neighborhood.name,
      borough: neighborhood.borough,
      pm25: pm,
      asthma: asthma.value,
      asthmaPeriod: asthma.period,
      asthmaAbove: asthma.value > cityAsthma.value,
      ask: ask.median1br,
      listings: ask.n,
      deepPer1k: deep,
    })
  }
  places.sort((a, b) => b.pm25 - a.pm25 || a.name.localeCompare(b.name))
  return places
}

export const STACK_ABSENT =
  'Eviction filings and the share of income that goes to rent are not in this atlas. The city publishes eviction filings separately, and Right to Counsel is the legal help in those cases.'

export const STACK_LINKS: Lever[] = [
  {
    title: 'Open the city eviction filings',
    href: 'https://data.cityofnewyork.us/City-Government/Evictions/6z8x-wfk4',
    note: 'NYC Open Data. This atlas does not total them by neighborhood.',
  },
  {
    title: 'Ask for a free lawyer',
    href: 'https://portal.311.nyc.gov/article/?kanumber=KA-01041',
    note: 'Right to Counsel covers an eviction case in every ZIP code.',
  },
]

export type RentGap = {
  askPct: number
  endAsk: number
  listings: number
  note: string
  orderHref: string
}

export function rentGuidelineGap(neighborhood: Neighborhood): RentGap | null {
  const { start, end } = ASK_WINDOW
  const opening = askingAt(neighborhood.asking1br, start)
  const closing = askingAt(neighborhood.asking1br, end)
  const askPct = percentChange(opening?.median1br ?? null, closing?.median1br ?? null)
  if (!opening || !closing || askPct == null || closing.n < MIN_LISTINGS) return null
  const earlier = RGB_ORDERS[0]
  const later = RGB_ORDERS[1]
  const relation =
    askPct > later.oneYear
      ? `rose ${formatChange(askPct)}, more than that one-year cap`
      : `changed ${formatChange(askPct)}, which is within that one-year cap`
  return {
    askPct,
    endAsk: closing.median1br,
    listings: closing.n,
    orderHref: later.href,
    note: `New one-bedroom asks in ${neighborhood.name} ${relation} from ${monthLabel(start)} to ${monthLabel(end)} (${formatRent(opening.median1br)} to ${formatRent(closing.median1br)}, ${closing.n} listings in the last month). A rent-stabilized one-year renewal was capped at ${earlier.oneYear}% under Order ${earlier.id} (${earlier.from}–${earlier.to}) and at ${later.oneYear}% under Order ${later.id} (${later.from}–${later.to}). A new listing is not a stabilized renewal, and it is not what a sitting tenant pays.`,
  }
}

const WINTER = ['2025-11', '2025-12', '2026-01', '2026-02']
const EARLY_SUMMER = ['2025-06', '2025-07', '2025-08']
const LATE_SUMMER = ['2026-06', '2026-07', '2026-08']

function seasonMedian(series: AskingPoint[], months: string[], minN: number): number | null {
  const values = months
    .map((month) => askingAt(series, month))
    .filter((point): point is AskingPoint => point != null && point.n >= minN)
    .map((point) => point.median1br)
  return median(values)
}

export type SigningHint = {
  winter: number
  earlySummer: number
  lateSummer: number
  dipped: boolean
  note: string
}

function hintNote(name: string, winter: number, earlySummer: number, lateSummer: number): string {
  return `From November 2025 through February 2026, new one-bedroom asks in ${name} had a median of ${formatRent(winter)}. June–August 2025 was ${formatRent(earlySummer)}, and June–August 2026 was ${formatRent(lateSummer)}. The series contains one winter, so this is not a forecast that the next winter will be cheaper.`
}

export function signingHint(neighborhood: Neighborhood | null = null): SigningHint | null {
  const city = seasonWindow(CITY.citywide.asking1br, 1)
  if (!city) return null
  if (!neighborhood) {
    return { ...city, note: hintNote('the city', city.winter, city.earlySummer, city.lateSummer) }
  }
  const local = seasonWindow(neighborhood.asking1br, MIN_LISTINGS)
  if (!local) {
    return {
      ...city,
      note: `${neighborhood.name} does not have ${MIN_LISTINGS} listings in each of those seasons. ${hintNote('the city', city.winter, city.earlySummer, city.lateSummer)}`,
    }
  }
  return { ...local, note: hintNote(neighborhood.name, local.winter, local.earlySummer, local.lateSummer) }
}

function seasonWindow(series: AskingPoint[], minN: number): Omit<SigningHint, 'note'> | null {
  const winter = seasonMedian(series, WINTER, minN)
  const earlySummer = seasonMedian(series, EARLY_SUMMER, minN)
  const lateSummer = seasonMedian(series, LATE_SUMMER, minN)
  if (winter == null || earlySummer == null || lateSummer == null) return null
  return { winter, earlySummer, lateSummer, dipped: winter < earlySummer && winter < lateSummer }
}

/** 30% of yearly income, as a monthly rent. A budgeting rule, not a legal cap. */
export function rentCapForIncome(annual: number): number | null {
  if (!Number.isFinite(annual) || annual <= 0) return null
  return (annual * 0.3) / 12
}

export function formatDeep(value: number): string {
  return `${formatRate(value)} per 1,000 households`
}
