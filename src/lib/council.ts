/**
 * Council district for one address, from the Department of City Planning's
 * City Council Districts layer. The layer returns the district number only.
 * The member's name stays on the council's own district page.
 */
const COUNCIL_LAYER =
  'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/NYC_City_Council_Districts/FeatureServer/0/query'

type CouncilQuery = {
  features?: { attributes?: { CounDist?: unknown } }[]
}

export async function councilDistrictAt(
  lon: number,
  lat: number,
  fetcher: typeof fetch = fetch,
): Promise<number | null> {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'CounDist',
    returnGeometry: 'false',
    f: 'json',
  })
  try {
    const response = await fetcher(`${COUNCIL_LAYER}?${params}`)
    if (!response.ok) return null
    const payload = (await response.json()) as CouncilQuery
    const district = Number(payload.features?.[0]?.attributes?.CounDist)
    if (!Number.isInteger(district) || district < 1 || district > 51) return null
    return district
  } catch {
    return null
  }
}
