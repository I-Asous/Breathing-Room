import { describe, expect, it } from 'vitest'
import { CITY } from './metrics'
import { findNeighborhood, neighborhoodForZip } from './place-search'

const geosearch = (body: unknown, ok = true) =>
  (async () => new Response(JSON.stringify(body), { status: ok ? 200 : 503 })) as typeof fetch

describe('neighborhoodForZip', () => {
  it('covers every neighborhood on the map', () => {
    const zips = ['10463', '10029', '11216', '11105', '10314', '11691']
    expect(zips.map(neighborhoodForZip)).toEqual(['101', '303', '203', '401', '503', '410'])
    const ids = new Set(CITY.neighborhoods.map((n) => n.id))
    for (let zip = 10001; zip <= 11697; zip++) {
      const id = neighborhoodForZip(String(zip))
      if (id) expect(ids.has(id)).toBe(true)
    }
  })
})

describe('findNeighborhood', () => {
  it('answers a ZIP without calling the geocoder', async () => {
    const never = (async () => {
      throw new Error('should not fetch')
    }) as typeof fetch
    expect(await findNeighborhood(' 11216 ', never)).toEqual({ id: '203', matched: 'ZIP 11216' })
    expect(await findNeighborhood('07030', never)).toHaveProperty('error')
  })

  it('places an address on the map', async () => {
    const fetcher = geosearch({
      features: [
        {
          geometry: { coordinates: [-73.946276, 40.800402] },
          properties: { label: '2 EAST 116 STREET, New York, NY, USA', postalcode: '10029' },
        },
      ],
    })
    expect(await findNeighborhood('2 E 116th St', fetcher)).toEqual({
      id: '303',
      matched: '2 EAST 116 STREET, New York, NY, USA',
      lon: -73.946276,
      lat: 40.800402,
    })
  })

  it('says so when nothing matches or the city search is down', async () => {
    expect(await findNeighborhood('Hoboken NJ', geosearch({ features: [] }))).toHaveProperty('error')
    const down = await findNeighborhood('2 E 116th St', geosearch({}, false))
    expect('error' in down && down.error).toContain('ZIP')
  })
})
