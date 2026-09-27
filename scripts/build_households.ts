/**
 * Census figures per UHF neighborhood, from the ACS 5-year bulk summary files (no API key).
 * ZCTAs are summed into neighborhoods with the NYC Health ZIP definition in src/lib/place-search.ts.
 *
 * - households.json: total households (B11001), for "deeply affordable units per 1,000 households".
 * - rent-burden.json: renter households paying 30% or more of income on gross rent (B25070).
 *   NYC Health's "Rent-burdened households" (indicator 2336) divides by all renter households,
 *   including those whose share could not be computed, so this does too. The build recomputes
 *   NYC Health's latest published period the same way and records how closely the two agree.
 *
 *   npx tsx scripts/build_households.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { UHF_ZIPS } from '../src/lib/place-search'

const YEAR = 2024
const CHECK_YEAR = 2021 // NYC Health's latest UHF period is 2017-21 (TimePeriodID 300).
const CACHE = '/tmp/citydata'
const NYC_HEALTH = 'https://raw.githubusercontent.com/nychealth/EHDP-data/production/indicators/data/2336.json'

async function download(url: string, file: string): Promise<string> {
  const path = `${CACHE}/${file}`
  if (!existsSync(path)) {
    mkdirSync(CACHE, { recursive: true })
    const response = await fetch(url)
    if (!response.ok) throw new Error(`download failed: ${response.status} ${url}`)
    writeFileSync(path, Buffer.from(await response.arrayBuffer()))
  }
  return readFileSync(path, 'utf8')
}

/** One ACS table by ZCTA: ZIP → the requested estimate columns, in order. */
async function acsTable(year: number, table: string, columns: string[]): Promise<Map<string, number[]>> {
  const file = `acsdt5y${year}-${table}.dat`
  const text = await download(
    `https://www2.census.gov/programs-surveys/acs/summary_file/${year}/table-based-SF/data/5YRData/${file}`,
    file,
  )
  const [header, ...lines] = text.trim().split('\n')
  const names = header.split('|')
  const geo = names.indexOf('GEO_ID')
  const at = columns.map((column) => names.indexOf(column))
  if (at.includes(-1)) throw new Error(`${file} is missing one of ${columns.join(', ')}`)
  const byZip = new Map<string, number[]>()
  for (const line of lines) {
    const cells = line.split('|')
    const match = /^860Z200US(\d{5})$/.exec(cells[geo])
    if (match) byZip.set(match[1], at.map((index) => Number(cells[index])))
  }
  return byZip
}

/** Sum each column over a neighborhood's ZIPs. ZIPs with no ZCTA (PO boxes, single buildings) add nothing. */
function sumByUhf(byZip: Map<string, number[]>, width: number, missing?: Set<string>): Record<string, number[]> {
  const out: Record<string, number[]> = {}
  for (const [id, zips] of Object.entries(UHF_ZIPS)) {
    out[id] = Array(width).fill(0)
    for (const zip of zips.split(' ')) {
      const values = byZip.get(zip)
      if (!values) {
        missing?.add(zip)
        continue
      }
      values.forEach((value, index) => (out[id][index] += value))
    }
  }
  return out
}

const write = (name: string, payload: unknown) =>
  writeFileSync(new URL(`../src/data/${name}`, import.meta.url), `${JSON.stringify(payload, null, 2)}\n`)

// Households
const missing = new Set<string>()
const households = sumByUhf(await acsTable(YEAR, 'b11001', ['B11001_E001']), 1, missing)
const byUhf = Object.fromEntries(Object.entries(households).map(([id, [count]]) => [id, count]))
write('households.json', {
  source: 'ACS 5-year 2020-2024, table B11001, total households by ZCTA, summed by NYC Health UHF ZIP definition',
  href: 'https://www.census.gov/programs-surveys/acs/data/summary-file.html',
  period: '2020-2024',
  byUhf,
})
console.log('neighborhoods', Object.keys(byUhf).length, 'households', Object.values(byUhf).reduce((a, b) => a + b, 0))
console.log('ZIPs with no ZCTA (PO boxes or single buildings):', [...missing].join(' ') || 'none')

// Rent burden: E001 all renter households; E007-E010 pay 30-34.9%, 35-39.9%, 40-49.9%, 50%+.
const BURDEN = ['B25070_E001', 'B25070_E007', 'B25070_E008', 'B25070_E009', 'B25070_E010']
function burdenByUhf(byZip: Map<string, number[]>): Record<string, { renters: number; burdened: number; severe: number }> {
  return Object.fromEntries(
    Object.entries(sumByUhf(byZip, BURDEN.length)).map(([id, [renters, b30, b35, b40, b50]]) => [
      id,
      { renters, burdened: b30 + b35 + b40 + b50, severe: b50 },
    ]),
  )
}
const pct = (part: number, whole: number) => Math.round((1000 * part) / whole) / 10
const cityOf = (rows: Record<string, { renters: number; burdened: number }>) => {
  const all = Object.values(rows)
  return pct(
    all.reduce((sum, row) => sum + row.burdened, 0),
    all.reduce((sum, row) => sum + row.renters, 0),
  )
}

const burden = burdenByUhf(await acsTable(YEAR, 'b25070', BURDEN))

// Check against NYC Health's own published percentages for the period they cover.
const check = burdenByUhf(await acsTable(CHECK_YEAR, 'b25070', BURDEN))
const nyc = JSON.parse(await download(NYC_HEALTH, 'nychealth-2336.json')) as Record<string, (number | string)[]>
const published: Record<string, number> = {}
let publishedCity: number | null = null
nyc.MeasureID.forEach((measure, index) => {
  if (measure !== 1029 || nyc.TimePeriodID[index] !== 300) return
  if (nyc.GeoType[index] === 'UHF42') published[String(nyc.GeoID[index])] = Number(nyc.Value[index])
  if (nyc.GeoType[index] === 'Citywide') publishedCity = Number(nyc.Value[index])
})
const diffs = Object.keys(published).map((id) =>
  Math.abs((100 * check[id].burdened) / check[id].renters - published[id]),
)
if (diffs.length !== 42) throw new Error(`NYC Health check found ${diffs.length} neighborhoods, expected 42`)

write('rent-burden.json', {
  source: 'ACS 5-year 2020-2024, table B25070, gross rent as a share of household income, by ZCTA',
  href: 'https://www.census.gov/programs-surveys/acs/data/summary-file.html',
  definition: 'Renter households paying 30% or more of income on gross rent (rent plus utilities), of all renter households',
  period: '2020-2024',
  city: cityOf(burden),
  byUhf: burden,
  check: {
    against: 'NYC Health, Rent-burdened households (indicator 2336), 2017-2021',
    href: 'https://a816-dohbesp.nyc.gov/IndicatorPublic/data-explorer/housing-stability/?id=2336',
    meanAbsDiff: Math.round((100 * diffs.reduce((a, b) => a + b, 0)) / diffs.length) / 100,
    maxAbsDiff: Math.round(100 * Math.max(...diffs)) / 100,
    city: cityOf(check),
    publishedCity,
  },
})
console.log(
  'rent burden',
  cityOf(burden),
  '% citywide 2020-24 | check vs NYC Health 2017-21: mean diff',
  (diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(2),
  'pts, city',
  cityOf(check),
  'vs',
  publishedCity,
)
