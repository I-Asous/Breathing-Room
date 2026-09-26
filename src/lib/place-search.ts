import { neighborhoodIdAt } from './geo'

/**
 * NYC Health defines each UHF neighborhood as a set of ZIP codes. This is that list, checked against
 * the ZIP (MODZCTA) polygons laid over the UHF boundaries; the two agree on every ZIP they share.
 * Seven ZIPs from the polygons that the published list leaves out are added at the end of their rows.
 */
export const UHF_ZIPS: Record<string, string> = {
  '101': '10463 10471',
  '102': '10466 10469 10470 10475',
  '103': '10458 10467 10468',
  '104': '10461 10462 10464 10465 10472 10473',
  '105': '10453 10457 10460',
  '106': '10451 10452 10456',
  '107': '10454 10455 10459 10474',
  '201': '11211 11222 11249',
  '202': '11201 11205 11215 11217 11231 11243',
  '203': '11212 11213 11216 11233 11238',
  '204': '11207 11208',
  '205': '11220 11232',
  '206': '11204 11218 11219 11230',
  '207': '11203 11210 11225 11226',
  '208': '11234 11236 11239',
  '209': '11209 11214 11228',
  '210': '11223 11224 11229 11235',
  '211': '11206 11221 11237',
  '301': '10031 10032 10033 10034 10040',
  '302': '10026 10027 10030 10037 10039',
  '303': '10029 10035',
  '304': '10023 10024 10025 10069',
  '305': '10021 10028 10044 10065 10075 10128 10162',
  '306': '10001 10011 10018 10019 10020 10036 10118',
  '307': '10010 10016 10017 10022',
  '308': '10012 10013 10014',
  '309': '10002 10003 10009',
  '310': '10004 10005 10006 10007 10038 10280 10282',
  '401': '11101 11102 11103 11104 11105 11106 11109',
  '402': '11368 11369 11370 11372 11373 11377 11378',
  '403': '11354 11355 11356 11357 11358 11359 11360',
  '404': '11361 11362 11363 11364',
  '405': '11374 11375 11379 11385',
  '406': '11365 11366 11367',
  '407': '11414 11415 11416 11417 11418 11419 11420 11421',
  '408': '11412 11423 11432 11433 11434 11435 11436',
  '409': '11004 11005 11411 11413 11422 11426 11427 11428 11429',
  '410': '11691 11692 11693 11694 11695 11697',
  '501': '10302 10303 10310',
  '502': '10301 10304 10305',
  '503': '10314',
  '504': '10306 10307 10308 10309 10312',
}

const ZIP_TO_UHF = new Map(
  Object.entries(UHF_ZIPS).flatMap(([id, zips]) => zips.split(' ').map((zip) => [zip, id] as const)),
)

export function neighborhoodForZip(zip: string): string | null {
  return ZIP_TO_UHF.get(zip.trim().slice(0, 5)) ?? null
}

export type PlaceMatch = { id: string; matched: string; lon?: number; lat?: number } | { error: string }

const GEOSEARCH = 'https://geosearch.planninglabs.nyc/v2/search'

type GeoSearchResult = {
  features?: {
    geometry?: { coordinates?: [number, number] }
    properties?: { label?: string; postalcode?: string }
  }[]
}

/**
 * Neighborhood for a ZIP code or a street address. A ZIP is looked up locally; an address goes to
 * NYC GeoSearch (the city's own geocoder, no key) and its point is placed on the UHF map.
 */
export async function findNeighborhood(query: string, fetcher: typeof fetch = fetch): Promise<PlaceMatch> {
  const text = query.trim()
  if (!text) return { error: 'Type a New York address or a five-digit ZIP.' }

  if (/^\d{5}(-\d{4})?$/.test(text)) {
    const id = neighborhoodForZip(text)
    return id ? { id, matched: `ZIP ${text.slice(0, 5)}` } : { error: `ZIP ${text.slice(0, 5)} is not a New York City residential ZIP.` }
  }

  let payload: GeoSearchResult
  try {
    const response = await fetcher(`${GEOSEARCH}?text=${encodeURIComponent(text)}&size=1`)
    if (!response.ok) throw new Error(String(response.status))
    payload = (await response.json()) as GeoSearchResult
  } catch {
    return { error: 'The city address search did not answer. Try your ZIP code instead.' }
  }

  const hit = payload.features?.[0]
  const label = hit?.properties?.label ?? text
  const [lon, lat] = hit?.geometry?.coordinates ?? []
  const id =
    (lon != null && lat != null ? neighborhoodIdAt(lon, lat) : null) ??
    (hit?.properties?.postalcode ? neighborhoodForZip(hit.properties.postalcode) : null)
  if (!id) return { error: `No New York City address matched “${text}”.` }
  return lon != null && lat != null ? { id, matched: label, lon, lat } : { id, matched: label }
}
