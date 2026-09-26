import { describe, expect, it } from 'vitest'
import { briefFromFacts } from './brief'
import { neighborhoodPaths } from './geo'
import { CITY, factsFor, percentile, toneIndex } from './metrics'

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
