/**
 * Households per UHF neighborhood, for "deeply affordable units per 1,000 households".
 *
 * Source: ACS 5-year 2020-2024, table B11001 (household type), total households by ZIP Code
 * Tabulation Area, from the Census bulk summary file (no API key). ZCTAs are summed into
 * neighborhoods with the NYC Health ZIP definition in src/lib/place-search.ts.
 *
 *   npx tsx scripts/build_households.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { UHF_ZIPS } from '../src/lib/place-search'

const YEAR = 2024
const SOURCE = `https://www2.census.gov/programs-surveys/acs/summary_file/${YEAR}/table-based-SF/data/5YRData/acsdt5y${YEAR}-b11001.dat`
const CACHE = '/tmp/citydata'
const FILE = `${CACHE}/acsdt5y${YEAR}-b11001.dat`
const OUT = new URL('../src/data/households.json', import.meta.url)

if (!existsSync(FILE)) {
  mkdirSync(CACHE, { recursive: true })
  const response = await fetch(SOURCE)
  if (!response.ok) throw new Error(`Census download failed: ${response.status}`)
  writeFileSync(FILE, Buffer.from(await response.arrayBuffer()))
}

const [header, ...lines] = readFileSync(FILE, 'utf8').trim().split('\n')
const columns = header.split('|')
const geo = columns.indexOf('GEO_ID')
const total = columns.indexOf('B11001_E001')

const byZip = new Map<string, number>()
for (const line of lines) {
  const cells = line.split('|')
  const match = /^860Z200US(\d{5})$/.exec(cells[geo])
  if (match) byZip.set(match[1], Number(cells[total]))
}

const byUhf: Record<string, number> = {}
const missing: string[] = []
for (const [id, zips] of Object.entries(UHF_ZIPS)) {
  byUhf[id] = 0
  for (const zip of zips.split(' ')) {
    const count = byZip.get(zip)
    if (count == null) missing.push(zip)
    else byUhf[id] += count
  }
}

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      source: 'ACS 5-year 2020-2024, table B11001, total households by ZCTA, summed by NYC Health UHF ZIP definition',
      href: 'https://www.census.gov/programs-surveys/acs/data/summary-file.html',
      period: '2020-2024',
      byUhf,
    },
    null,
    2,
  )}\n`,
)
console.log('neighborhoods', Object.keys(byUhf).length, 'households', Object.values(byUhf).reduce((a, b) => a + b, 0))
console.log('ZIPs with no ZCTA (PO boxes or single buildings):', missing.join(' ') || 'none')
