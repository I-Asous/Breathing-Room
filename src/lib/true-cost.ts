import {
  BURDEN_PERIOD,
  CITY,
  airAt,
  burdenShare,
  formatPercent,
  formatRent,
  formatUg,
  last,
  percentChange,
  percentile,
  thirdIndex,
  type Neighborhood,
} from './metrics'

/** WHO global air quality guideline for annual mean PM2.5, 2021. Not a daily count. */
export const WHO_ANNUAL_PM25 = 5

/** EPA primary annual PM2.5 standard, 2024. */
export const EPA_ANNUAL_PM25 = 9

export const ZORI_FROM = 2023
export const ZORI_TO = 2026

const COOLING_CENTERS = 'https://www.nyc.gov/site/em/ready/extreme-heat.page'
const PARKS = 'https://www.nycgovparks.org/facilities'
const VIOLATIONS = 'https://whoownswhat.justfix.org/en/'
const HPD = 'https://hpdonline.nyc.gov/hpdonline/'

export type CostRecord = {
  id: string
  name: string
  borough: string
  paid: number
  ask: number | null
  askMonth: string | null
  cityAsk: number | null
  pm: number | null
  cityPm: number | null
  asthma: number | null
  asthmaPeriod: string | null
  cityAsthma: number | null
  zoriChange: number | null
  cityZoriChange: number | null
  burden: number | null
  cityBurden: number | null
}

function zoriAt(series: { year: number; value: number }[], year: number): number | null {
  return series.find((point) => point.year === year)?.value ?? null
}

export function zoriChange(series: { year: number; value: number }[]): number | null {
  return percentChange(zoriAt(series, ZORI_FROM), zoriAt(series, ZORI_TO))
}

export function costRecord(neighborhood: Neighborhood, paid: number): CostRecord {
  const ask = last(neighborhood.asking1br)
  const cityAsk = last(CITY.citywide.asking1br)
  const asthma = last(neighborhood.asthmaChild)
  const cityAsthma = last(CITY.citywide.asthmaChild)
  return {
    id: neighborhood.id,
    name: neighborhood.name,
    borough: neighborhood.borough,
    paid,
    ask: ask?.median1br ?? null,
    askMonth: ask?.month ?? null,
    cityAsk: cityAsk?.median1br ?? null,
    pm: airAt(neighborhood.pm25, '2024'),
    cityPm: airAt(CITY.citywide.pm25, '2024'),
    asthma: asthma?.value ?? null,
    asthmaPeriod: asthma?.period ?? null,
    cityAsthma: cityAsthma?.value ?? null,
    zoriChange: zoriChange(neighborhood.zori),
    cityZoriChange: zoriChange(CITY.citywide.zori),
    burden: burdenShare([neighborhood]),
    cityBurden: burdenShare(CITY.neighborhoods),
  }
}

export type CoOccur = {
  id: string
  name: string
  borough: string
  zoriChange: number
  pm: number
}

/** Top third on both the 2023–2026 rent-index rise and the 2024 PM2.5 annual mean. */
export function coOccurPlaces(): CoOccur[] {
  const rows = CITY.neighborhoods.flatMap((neighborhood) => {
    const change = zoriChange(neighborhood.zori)
    const pm = airAt(neighborhood.pm25, '2024')
    if (change == null || pm == null) return []
    return [{ neighborhood, change, pm }]
  })
  const changes = rows.map((row) => row.change)
  const pms = rows.map((row) => row.pm)
  return rows.flatMap((row) => {
    if (thirdIndex(percentile(row.change, changes)) < 2) return []
    if (thirdIndex(percentile(row.pm, pms)) < 2) return []
    return [
      {
        id: row.neighborhood.id,
        name: row.neighborhood.name,
        borough: row.neighborhood.borough,
        zoriChange: row.change,
        pm: row.pm,
      },
    ]
  })
}

function placeLine(record: CostRecord, address: string | null): string {
  return address ? `${address}, in ${record.name}` : record.name
}

export function dossierText(record: CostRecord, address: string | null): string {
  const lines = [
    `Breathing Room dossier — ${placeLine(record, address)}`,
    '',
    `Monthly rent entered: ${formatRent(record.paid)}. This is the number typed on the page, not a city record.`,
    record.ask != null
      ? `Latest new one-bedroom ask in ${record.name}: ${formatRent(record.ask)} (${record.askMonth}). City ask ${formatRent(record.cityAsk)}. A new lease, not the rent a tenant already in place pays.`
      : 'This neighborhood has no latest new one-bedroom ask in the listing extract.',
    record.zoriChange != null
      ? `Zillow Observed Rent Index, ${ZORI_FROM} to ${ZORI_TO}: ${formatPercent(record.zoriChange)}. City index ${formatPercent(record.cityZoriChange)}. This is not the listing ask.`
      : `Zillow Observed Rent Index is missing for ${ZORI_FROM} or ${ZORI_TO} in this neighborhood, so this page does not state a three-year change.`,
    record.burden != null
      ? `Rent burden, ${BURDEN_PERIOD}: ${Math.round(record.burden)}% of renter households pay 30% or more of income. City ${record.cityBurden == null ? '—' : `${Math.round(record.cityBurden)}%`}. The Census publishes a margin of error. This page does not carry it.`
      : 'No rent-burden estimate for this neighborhood.',
    record.pm != null
      ? `2024 PM2.5 annual mean: ${formatUg(record.pm)} µg/m³. City ${formatUg(record.cityPm)}. WHO annual guideline ${WHO_ANNUAL_PM25}. EPA annual standard ${EPA_ANNUAL_PM25.toFixed(1)}. This is not a reading for today, and it does not count days above either line. It does not show whether the toll changed the air.`
      : 'No 2024 PM2.5 annual mean for this neighborhood.',
    record.asthma != null
      ? `Child asthma visits: ${Math.round(record.asthma)} per 100,000, ${record.asthmaPeriod}. City ${record.cityAsthma == null ? '—' : Math.round(record.cityAsthma)}.`
      : 'No child-asthma estimate for this neighborhood.',
    '',
    'This atlas does not contain an eviction rate or a code-violation rate.',
    `Building-level cases and violations: ${VIOLATIONS}`,
    `HPD Online: ${HPD}`,
    'This atlas does not list cooling centers or parks.',
    `Extreme heat and cooling centers: ${COOLING_CENTERS}`,
    `Parks facilities: ${PARKS}`,
  ]
  return lines.join('\n')
}

export function testimonyText(record: CostRecord, address: string | null): string {
  const rentRose =
    record.zoriChange != null && record.cityZoriChange != null && record.zoriChange >= record.cityZoriChange
  const airHigher = record.pm != null && record.cityPm != null && record.pm > record.cityPm
  const asthmaHigher = record.asthma != null && record.cityAsthma != null && record.asthma > record.cityAsthma
  const together =
    rentRose && (airHigher || asthmaHigher)
      ? `In ${record.name}, the rent index rose at least as fast as the city, and ${
          airHigher && asthmaHigher
            ? 'both the 2024 air mean and the child-asthma rate sit above the city'
            : airHigher
              ? 'the 2024 air mean sits above the city'
              : 'the child-asthma rate sits above the city'
        }. Those are the two records I am asking you to read together.`
      : `I am asking you to read the rent index and the air record for ${record.name} together, including where one of them is not above the city.`

  return [
    `Testimony on ${placeLine(record, address)}`,
    '',
    `I am writing about ${record.name} in ${record.borough}. The monthly rent I entered is ${formatRent(record.paid)}.`,
    together,
    record.zoriChange != null
      ? `The Zillow Observed Rent Index moved ${formatPercent(record.zoriChange)} from ${ZORI_FROM} to ${ZORI_TO}. The city index moved ${formatPercent(record.cityZoriChange)}. That index is not the asking rent on a new lease.`
      : `A three-year rent-index change is not available for this neighborhood.`,
    record.pm != null
      ? `The 2024 PM2.5 annual mean is ${formatUg(record.pm)} µg/m³, against a city mean of ${formatUg(record.cityPm)}. The WHO annual guideline is ${WHO_ANNUAL_PM25} µg/m³ and the EPA annual standard is ${EPA_ANNUAL_PM25.toFixed(1)}. I do not have a count of days above either line, and this mean does not show whether congestion pricing changed the air.`
      : 'A 2024 PM2.5 annual mean is not in the neighborhood record.',
    record.asthma != null
      ? `Child asthma visits were ${Math.round(record.asthma)} per 100,000 in ${record.asthmaPeriod}, against a city rate of ${record.cityAsthma == null ? '—' : Math.round(record.cityAsthma)}.`
      : 'A child-asthma estimate is not in the neighborhood record.',
    'This page does not have an eviction rate or a code-violation rate. Those are looked up by building, not estimated here.',
    '',
  ].join('\n')
}

export const OFFICIAL_LINKS = [
  { href: COOLING_CENTERS, title: 'Extreme heat and cooling centers', note: 'NYC Emergency Management keeps the finder. This atlas does not list centers.' },
  { href: PARKS, title: 'Parks and green spaces', note: 'NYC Parks lists facilities. This atlas does not measure distance to a park.' },
  { href: VIOLATIONS, title: 'Building violations and eviction cases', note: 'Who Owns What is a building lookup. It is not a neighborhood eviction rate.' },
  { href: HPD, title: 'HPD Online', note: 'Complaints and violations for one building. This atlas does not carry a code-violation rate.' },
] as const
