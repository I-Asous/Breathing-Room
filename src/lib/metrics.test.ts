import { describe, expect, it } from 'vitest'
import { briefFromFacts } from './brief'
import { fitTransform, neighborhoodPaths } from './geo'
import { CITY, boroughSummary, factsFor, isBorough, median, percentile, toneIndex } from './metrics'

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
