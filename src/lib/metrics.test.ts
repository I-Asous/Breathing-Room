import { describe, expect, it } from 'vitest'
import { briefFromFacts } from './brief'
import { fitTransform, neighborhoodPaths } from './geo'
import {
  CITY,
  boroughSummary,
  deepPer1k,
  householdsIn,
  factsFor,
  isBorough,
  layerRange,
  median,
  percentile,
  readingFor,
  thirdIndex,
  toneIndex,
} from './metrics'

describe('map', () => {
  it('draws every neighborhood', () => {
    const paths = neighborhoodPaths()
    expect(paths).toHaveLength(42)
    expect(paths.every((path) => path.d.startsWith('M'))).toBe(true)
  })
})

describe('percentile', () => {
  it('ranks the middle of a spread', () => {
    expect(percentile(2, [1, 2, 3])).toBeCloseTo(0.5)
    expect(toneIndex(0)).toBe(0)
    expect(toneIndex(1)).toBe(7)
  })
})

describe('rent × asthma', () => {
  it('splits a spread into thirds', () => {
    expect(thirdIndex(0)).toBe(0)
    expect(thirdIndex(0.5)).toBe(1)
    expect(thirdIndex(1)).toBe(2)
  })

  it('keeps opposite neighborhoods apart instead of averaging them together', () => {
    const month = CITY.neighborhoods[0].asking1br.at(-1)!.month
    const pairOf = (name: string) => {
      const hood = CITY.neighborhoods.find((n) => n.name === name)!
      return readingFor(hood, 'pair', '2024', month, CITY.neighborhoods).pair
    }
    expect(pairOf('Upper East Side')).toEqual({ rent: 2, asthma: 0 })
    expect(pairOf('Crotona - Tremont')).toEqual({ rent: 0, asthma: 2 })
  })

  it('labels the single-measure legend with real values', () => {
    const air = layerRange('air', '2024', '2026-08', CITY.neighborhoods)
    expect(air?.low).toMatch(/µg\/m³$/)
    expect(layerRange('pair', '2024', '2026-08', CITY.neighborhoods)).toBeNull()
  })
})

describe('deep units per 1,000 households', () => {
  it('has households for every neighborhood', () => {
    for (const n of CITY.neighborhoods) expect(householdsIn([n])).toBeGreaterThan(1000)
    expect(householdsIn(CITY.neighborhoods)).toBeGreaterThan(3_000_000)
  })

  it('compares places of different size on the same footing', () => {
    const rate = (name: string) => deepPer1k([CITY.neighborhoods.find((n) => n.name === name)!])!
    const harlem = rate('East Harlem')
    const row = CITY.neighborhoods.find((n) => n.name === 'East Harlem')!
    expect(harlem).toBeCloseTo((1000 * row.housing.since2014eli) / householdsIn([row]))
    expect(harlem).toBeGreaterThan(rate('Upper East Side'))
    expect(boroughSummary('Bronx').deepPer1k).toBeCloseTo(deepPer1k(CITY.neighborhoods.filter((n) => n.borough === 'Bronx'))!)
  })
})

describe('briefFromFacts', () => {
  it('cites the neighborhood and refuses to score the toll', () => {
    const harlem = CITY.neighborhoods.find((n) => n.name === 'East Harlem')
    expect(harlem).toBeTruthy()
    const text = briefFromFacts(factsFor(harlem!), 'what about the air and the toll?')
    expect(text).toContain('East Harlem')
    expect(text).toContain('do not score the toll')
    expect(text).toContain('µg/m³')
  })
})

describe('boroughs', () => {
  it('takes a true median', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBeNull()
  })

  it('summarizes only the chosen borough', () => {
    const staten = boroughSummary('Staten Island')
    const rows = CITY.neighborhoods.filter((n) => n.borough === 'Staten Island')
    expect(staten.count).toBe(rows.length)
    expect(staten.deep).toBe(rows.reduce((sum, n) => sum + n.housing.since2014eli, 0))
    expect(staten.pm25.length).toBeGreaterThan(0)
    expect(isBorough('Brooklyn')).toBe(true)
    expect(isBorough('Jersey City')).toBe(false)
  })

  it('zooms the map in for a single borough', () => {
    const paths = neighborhoodPaths()
    expect(paths.every((path) => path.box.x1 > path.box.x0)).toBe(true)
    const ids = new Set(CITY.neighborhoods.filter((n) => n.borough === 'Manhattan').map((n) => n.id))
    const zoom = fitTransform(paths.filter((path) => ids.has(path.id)).map((path) => path.box))
    expect(Number(zoom.match(/scale\(([\d.]+)\)/)?.[1])).toBeGreaterThan(1)
  })
})
