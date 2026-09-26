import cleaning from '../data/cleaning.json'
import { CITY, deepPer1k, formatCount, householdsIn, HOUSEHOLDS_PERIOD } from './metrics'
import { UHF_ZIPS } from './place-search'

export type CleaningStep = {
  record: string
  from: string
  to: string
  what: string
}

/**
 * What the build did to each public record on the way to the map, in numbers the build scripts
 * counted (src/data/cleaning.json from scripts/build_city.py, households from build_households.ts).
 */
export function cleaningSteps(): CleaningStep[] {
  const { listings, zips, housing, monitors } = cleaning
  // New Jersey ZIPs all start with 07; the box the listings are clipped to reaches across the Hudson.
  const allJersey = zips.dropped.length > 0 && zips.dropped.every((zip) => zip.startsWith('07'))
  const zipCount = Object.values(UHF_ZIPS).reduce((sum, list) => sum + list.split(' ').length, 0)

  return [
    {
      record: 'Rental listings',
      from: `${formatCount(listings.rows)} listings`,
      to: `${formatCount(listings.oneBedroom)} one-bedrooms`,
      what: `${listings.months} monthly extracts, ${listings.first} to ${listings.last}. ${formatCount(
        listings.priceOutOfRange,
      )} asked under $700 or over $20,000 a month and were dropped as implausible. Only one-bedrooms go into the median, so studios and family apartments do not skew it.`,
    },
    {
      record: 'Listing ZIPs → neighborhoods',
      from: `${formatCount(zips.total)} ZIPs`,
      to: `${formatCount(zips.total - zips.outside)} placed`,
      what: `Each ZIP goes where its listings cluster. ${formatCount(zips.inside)} cluster inside a neighborhood. ${formatCount(
        zips.snapped,
      )} cluster in a river or an airport cutout and go to the nearest one. ${formatCount(
        zips.outside,
      )} ${allJersey ? 'are in New Jersey, across the Hudson' : 'fall outside the five boroughs'}, so their ${formatCount(
        zips.listingsDropped,
      )} listings are left out.`,
    },
    {
      record: 'Affordable housing buildings',
      from: `${formatCount(housing.rows)} records`,
      to: `${formatCount(housing.inside)} mapped`,
      what: `${formatCount(
        housing.noPoint,
      )} records in the city's file have no coordinates, so they cannot be placed in any neighborhood. Their units are missing from every count on this page, which makes the counts a floor.`,
    },
    {
      record: 'EPA air monitors',
      from: `${formatCount(monitors.annualRows)} rows`,
      to: `${formatCount(monitors.annualReadings)} readings`,
      what: `The ${monitors.year} file repeats one measurement for every standard it is checked against and every sampler at the site. We keep one reading per site and pollutant, at ${formatCount(
        monitors.sites,
      )} sites, and show them as dots rather than painting them across the map.`,
    },
    {
      record: 'Households for per-capita rates',
      from: `${formatCount(zipCount)} ZIPs`,
      to: `${formatCount(CITY.neighborhoods.length)} neighborhoods`,
      what: `Census household counts (ACS ${HOUSEHOLDS_PERIOD}) come by ZIP. NYC Health's ZIP list for each neighborhood, checked against the ZIP boundary shapes, adds them up to ${formatCount(
        householdsIn(CITY.neighborhoods),
      )} households citywide.`,
    },
  ]
}

type RateRow = { name: string; units: number; rate: number; unitRank: number; rateRank: number }

export type RateExample = { more: RateRow; fewer: RateRow }

/**
 * Two neighborhoods whose order flips between the raw count and the rate: `more` is a top-ten
 * neighborhood by deeply affordable units, `fewer` has fewer units but more per household. Picks the
 * pair where the flip is widest.
 */
export function rateExample(): RateExample | null {
  const rows = CITY.neighborhoods.map((n) => ({
    name: n.name,
    units: n.housing.since2014eli,
    rate: deepPer1k([n]) ?? 0,
  }))
  const rank = (key: 'units' | 'rate') => {
    const order = [...rows].sort((a, b) => b[key] - a[key]).map((r) => r.name)
    return (name: string) => order.indexOf(name) + 1
  }
  const unitRank = rank('units')
  const rateRank = rank('rate')
  const ranked = rows.map((r) => ({ ...r, unitRank: unitRank(r.name), rateRank: rateRank(r.name) }))

  let best: RateExample | null = null
  let widest = 1
  for (const more of ranked) {
    for (const fewer of ranked) {
      if (more.unitRank > 10 || !(more.units > fewer.units && fewer.rate > more.rate) || !more.rate || !fewer.units) {
        continue
      }
      const flip = (more.units / fewer.units) * (fewer.rate / more.rate)
      if (flip > widest) {
        widest = flip
        best = { more, fewer }
      }
    }
  }
  return best
}
