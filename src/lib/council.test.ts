import { describe, expect, it } from 'vitest'
import { councilDistrictAt } from './council'

const arcgis = (body: unknown, ok = true) =>
  (async () => new Response(JSON.stringify(body), { status: ok ? 200 : 503 })) as typeof fetch

describe('councilDistrictAt', () => {
  it('reads the district number and refuses anything outside 1–51', async () => {
    const hit = await councilDistrictAt(
      -73.946,
      40.8,
      arcgis({ features: [{ attributes: { CounDist: 8 } }] }),
    )
    expect(hit).toBe(8)
    expect(await councilDistrictAt(-73.9, 40.8, arcgis({ features: [{ attributes: { CounDist: 0 } }] }))).toBeNull()
    expect(await councilDistrictAt(-73.9, 40.8, arcgis({ features: [] }))).toBeNull()
    expect(await councilDistrictAt(-73.9, 40.8, arcgis({}, false))).toBeNull()
    expect(await councilDistrictAt(Number.NaN, 40.8, arcgis({}))).toBeNull()
  })
})
