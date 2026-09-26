import {
  CITY,
  deepPer1k,
  equityGap,
  formatRate,
  last,
  percentile,
  thirdIndex,
  type Neighborhood,
} from './metrics'

export type NextStep = {
  kind: 'air' | 'housing' | 'tenant' | 'council'
  title: string
  href: string
  note: string
}

const REPORTS = 'https://a816-dohbesp.nyc.gov/IndicatorPublic/neighborhood-reports'

// NYC Health shortens a few UHF names in its report URLs.
const REPORT_SLUGS: Record<string, string> = {
  'Fordham - Bronx Park': 'fordham_bronx_pk',
  'Washington Heights - Inwood': 'washington_heights',
  Rockaway: 'rockaways',
}

export function reportSlug(name: string): string {
  return REPORT_SLUGS[name] ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function councilStep(district: number | null): NextStep {
  if (district != null && Number.isInteger(district) && district >= 1 && district <= 51) {
    return {
      kind: 'council',
      title: `Write Council District ${district}`,
      href: `https://council.nyc.gov/district-${district}/`,
      note: `This address is District ${district}. They vote on rezonings, housing, and truck routes.`,
    }
  }
  return {
    kind: 'council',
    title: 'Find your council member',
    href: 'https://council.nyc.gov/districts/',
    note: 'Look up the member for your block. They vote on rezonings, housing, and truck routes.',
  }
}

/**
 * Three places to act on what the map shows for one neighborhood. The order follows its record:
 * asthma above the city comes first; otherwise housing does. A council district is named only
 * when an address has been placed in one.
 */
export function nextSteps(
  neighborhood: Neighborhood,
  peers: Neighborhood[] = CITY.neighborhoods,
  councilDistrict: number | null = null,
): NextStep[] {
  const asthma = last(neighborhood.asthmaChild)
  const cityAsthma = last(CITY.citywide.asthmaChild)
  const asthmaAbove = asthma != null && cityAsthma != null && asthma.value > cityAsthma.value

  const air: NextStep = {
    kind: 'air',
    title: `Read the ${neighborhood.name} asthma report`,
    href: `${REPORTS}/${reportSlug(neighborhood.name)}/asthma_and_the_environment/`,
    note:
      asthma && cityAsthma
        ? 'Covers what is driving the visits.'
        : 'Air, housing conditions, and asthma for this neighborhood.',
  }

  const rent = last(neighborhood.asking1br)?.median1br ?? null
  const rents = peers.map((n) => last(n.asking1br)?.median1br).filter((v): v is number => v != null)
  const rentHigh = rent != null && thirdIndex(percentile(rent, rents)) === 2
  const gap = equityGap(neighborhood, peers, last(neighborhood.asking1br)?.month ?? '')
  const deepThin = gap != null && gap >= 0.15

  const housing: NextStep =
    rentHigh || deepThin
      ? {
          kind: 'housing',
          title: 'Enter the affordable housing lotteries',
          href: 'https://housingconnect.nyc.gov/PublicWeb/',
          note: `${formatRate(deepPer1k([neighborhood]))} deep units per 1,000 households since 2014. One application covers many buildings.`,
        }
      : {
          kind: 'tenant',
          title: 'Call 311, Tenant Helpline',
          href: 'https://www.nyc.gov/content/tenantprotection/pages/',
          note: 'Free help with rent stabilization, repairs, and eviction.',
        }

  const council = councilStep(councilDistrict)

  return asthmaAbove ? [air, housing, council] : [housing, air, council]
}
