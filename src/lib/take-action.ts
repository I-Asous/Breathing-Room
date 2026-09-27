import {
  CAUSE_LOOKUPS,
  EPA_ANNUAL_PM25,
  airAdvice,
  rentGuidelineGap,
  tenantLevers,
} from './actions'
import {
  CITY,
  airAt,
  burdenShare,
  deepPer1k,
  formatRent,
  formatUg,
  last,
  type Neighborhood,
} from './metrics'

export type TakeAction = {
  id: string
  why: string
  title: string
  href: string
  note: string
}

const AIRNOW = CAUSE_LOOKUPS.find((lever) => lever.href.includes('airnow.gov'))
const IDLING = CAUSE_LOOKUPS.find((lever) => lever.href.includes('KA-02222'))

/**
 * The three steps a renter can take for this neighborhood, ordered by what its
 * numbers actually show. A searched address pulls in the council district.
 */
export function actionsToTake(
  neighborhood: Neighborhood,
  options: { address?: string | null; district?: number | null; paid?: number | null } = {},
): TakeAction[] {
  const address = options.address?.trim() || null
  const district = options.district ?? null
  const paid = options.paid != null && Number.isFinite(options.paid) && options.paid > 0 ? options.paid : null
  const advice = airAdvice(neighborhood)
  const gap = rentGuidelineGap(neighborhood)
  const levers = tenantLevers(address)
  const history = levers.find((lever) => lever.href.includes('justfix.org/en/rh'))
  const lottery = levers.find((lever) => lever.href.includes('housingconnect'))
  const lawyer = levers.find((lever) => lever.href.includes('KA-01041'))
  const landlord = levers.find((lever) => lever.href.includes('whoownswhat'))
  const ask = last(neighborhood.asking1br)
  const cityAsk = last(CITY.citywide.asking1br)
  const burden = burdenShare([neighborhood])
  const cityBurden = burdenShare(CITY.neighborhoods)
  const deep = deepPer1k([neighborhood])
  const cityDeep = deepPer1k(CITY.neighborhoods)
  const pmAbove = advice != null && advice.pm25 > advice.cityPm
  const askAbove = ask != null && cityAsk != null && ask.median1br > cityAsk.median1br
  const burdenAbove = burden != null && cityBurden != null && Math.round(burden) > Math.round(cityBurden)
  const deepThin = deep != null && cityDeep != null && deep < cityDeep
  const rosePastCap = gap != null && gap.askPct > 3

  const ranked: { priority: number; action: TakeAction }[] = []

  if (AIRNOW && advice) {
    const why = advice.aboveStandard
      ? `The 2024 average is ${formatUg(advice.pm25)} µg/m³, above the EPA standard of ${EPA_ANNUAL_PM25.toFixed(1)}. Check today's air before outdoor exercise. The annual mean is not today. The air record does not show whether the toll changed the air.`
      : advice.asthmaAbove
        ? `Child asthma visits are above the city. Check today's air before outdoor time. The 2024 mean is not today. The air record does not show whether the toll changed the air.`
        : pmAbove
          ? `The 2024 average is higher than the city's. Check today's air before outdoor time. This page has no reading for today. The air record does not show whether the toll changed the air.`
          : `The 2024 average is not above the city. For the day itself, check AirNow. This page has no reading for today.`
    ranked.push({
      priority: 40 + (advice.aboveStandard ? 30 : 0) + (advice.asthmaAbove ? 20 : 0) + (pmAbove ? 10 : 0),
      action: {
        id: 'air-today',
        why,
        title: "Check today's air",
        href: AIRNOW.href,
        note: 'AirNow is the daily index. This atlas does not have a reading for today.',
      },
    })
  }

  if (advice?.asthmaAbove) {
    ranked.push({
      priority: 72,
      action: {
        id: 'asthma-report',
        why: advice.sensitive,
        title: advice.report.title,
        href: advice.report.href,
        note: advice.report.note,
      },
    })
  }

  if (history && ask) {
    const why = rosePastCap
      ? `New one-bedroom asks rose past the 3% cap on a stabilized renewal. Request the state rent history before you treat ${formatRent(ask.median1br)} as your rent.`
      : paid != null && paid > ask.median1br
        ? `${formatRent(paid)} is above the median new one-bedroom ask of ${formatRent(ask.median1br)}. The rent history shows whether this apartment was registered as stabilized.`
        : `The state rent history shows whether this apartment was registered as stabilized. This page cannot tell you that.`
    ranked.push({
      priority: 50 + (rosePastCap ? 35 : 0) + (paid != null && paid > ask.median1br ? 20 : 0) + (address ? 10 : 0),
      action: {
        id: 'rent-history',
        why: address ? `${why} Search for ${address}.` : why,
        title: 'Request your rent history',
        href: history.href,
        note: history.note,
      },
    })
  }

  if (lawyer && burdenAbove) {
    ranked.push({
      priority: 68,
      action: {
        id: 'lawyer',
        why: 'A larger share of renters here pay 30% or more of income. If an eviction case is filed, a free lawyer is available in every ZIP. Call 311 and ask for the Tenant Helpline.',
        title: 'Ask for a free lawyer',
        href: lawyer.href,
        note: 'This page does not count eviction filings in this neighborhood.',
      },
    })
  }

  if (lottery && (askAbove || deepThin)) {
    ranked.push({
      priority: 30 + (askAbove ? 28 : 0) + (deepThin ? 18 : 0),
      action: {
        id: 'lottery',
        why: askAbove
          ? `New one-bedroom asks are above the city. Housing Connect is one application for many buildings.`
          : `Fewer deeply affordable homes were financed here, per household, than in the city. Housing Connect lists the open lotteries.`,
        title: 'Look at affordable housing lotteries',
        href: lottery.href,
        note: 'This page does not say what you qualify for. Financed homes are not vacant listings.',
      },
    })
  }

  if (IDLING && (pmAbove || (advice != null && advice.aboveStandard))) {
    ranked.push({
      priority: 36,
      action: {
        id: 'idling',
        why: 'Idling is illegal after 3 minutes, or 1 minute next to a school. A 311 report is the way to record a truck that is doing it.',
        title: 'Report an idling truck',
        href: IDLING.href,
        note: 'This page does not show which trucks idle here.',
      },
    })
  }

  if (landlord && address) {
    ranked.push({
      priority: 44,
      action: {
        id: 'landlord',
        why: `Who Owns What lists HPD violations, eviction cases, and other buildings under the same owner. Search for ${address}.`,
        title: 'Look up the landlord',
        href: landlord.href,
        note: 'The record is the building, not a guess about this apartment.',
      },
    })
  }

  const council: TakeAction =
    district != null
      ? {
          id: 'council',
          why: `This address is in Council District ${district}. The member's name is on that page. They vote on housing, rezonings, and truck routes.`,
          title: `Write Council District ${district}`,
          href: `https://council.nyc.gov/district-${district}/`,
          note: 'This page does not name the member.',
        }
      : {
          id: 'council',
          why: 'Search an address to open the council district for that block.',
          title: 'Find your council member',
          href: 'https://council.nyc.gov/districts/',
          note: 'This page does not name the member.',
        }
  ranked.push({ priority: district != null ? 60 : 12, action: council })

  ranked.sort((a, b) => b.priority - a.priority || a.action.id.localeCompare(b.action.id))
  const picked = ranked.slice(0, 3).map((item) => item.action)
  if (district != null && !picked.some((action) => action.id === 'council')) {
    picked[picked.length - 1] = council
  }
  return picked
}
