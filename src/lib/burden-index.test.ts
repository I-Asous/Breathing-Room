import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WEIGHTS,
  SCORE_LIMITS,
  SCORE_MEANS,
  apartFromCity,
  burdenRows,
  carriesAllThree,
  pointsFromCity,
  readPlace,
  rentAgainstAsk,
  togetherLine,
  weightPercents,
  weightSplit,
} from './burden-index'
import { nearestPmMonitors, neighborhoodById } from './metrics'

describe('combined burden', () => {
  it('ranks each measure and averages the weights you set', () => {
    const rows = burdenRows()
    expect(rows).toHaveLength(42)
    for (const row of rows) {
      if (row.score != null) {
        expect(row.score).toBeGreaterThanOrEqual(0)
        expect(row.score).toBeLessThanOrEqual(100)
      }
      expect(row.rentCounted).toBe(row.rentShare != null)
    }

    const airOnly = burdenRows({ air: 1, burden: 0, rent: 0 })
    const chelsea = airOnly.find((row) => row.id === '306')
    const maxAir = Math.max(...airOnly.map((row) => row.airShare ?? -1))
    expect(chelsea?.airShare).toBe(maxAir)
    expect(chelsea?.score).toBeCloseTo((chelsea?.airShare ?? 0) * 100)

    const split = weightSplit(DEFAULT_WEIGHTS)
    expect(split?.air).toBeCloseTo(1 / 3)
    expect(weightSplit({ air: 0, burden: 0, rent: 0 })).toBeNull()
    const shown = weightPercents({ air: 4, burden: 1, rent: 1 })
    expect((shown?.air ?? 0) + (shown?.burden ?? 0) + (shown?.rent ?? 0)).toBe(100)
  })

  it('keeps the top-third overlap inside the three measures', () => {
    const { names, sentence } = togetherLine(burdenRows())
    expect(sentence.toLowerCase()).not.toContain('bad area')
    for (const row of names) expect(carriesAllThree(row)).toBe(true)
    expect(SCORE_MEANS).toContain('42 neighborhoods')
    expect(SCORE_MEANS).toContain('not a grade')
    expect(SCORE_LIMITS).toContain('not a forecast')
    expect(SCORE_LIMITS).toContain('ZIP')
    expect(names.map((row) => row.name)).toEqual([
      'East Harlem',
      'High Bridge - Morrisania',
      'Sunset Park',
      'Washington Heights - Inwood',
      'West Queens',
    ])
    expect(sentence).toContain('Above the middle')
  })

  it('says how a place compares with the city, in plain language', () => {
    expect(apartFromCity(9.5, 6.3, '6.3 µg/m³')).toBe('51% higher than the city average of 6.3 µg/m³')
    expect(pointsFromCity(50.4, 49.6)).toMatch(/about the same/)
    expect(rentAgainstAsk(2800, 3100)).toContain('below')
    expect(rentAgainstAsk(2800, 3100)).toContain('sitting tenant')

    const harlem = neighborhoodById('303')
    const row = burdenRows().find((place) => place.id === '303')
    expect(harlem && row).toBeTruthy()
    if (!harlem || !row) return
    const read = readPlace(harlem, row)
    expect(read.airMeans).toContain('not a reading for today')
    expect(read.airLine).toContain('µg/m³')
    expect(read.burdenCaveat).toContain('margin of error')
    expect(read.rentMeans).toContain('often pay less')
    expect(read.asthmaLine).toContain('2017')
    expect(`${read.airLine} ${read.no2Line}`).not.toMatch(/changed the air/)
  })
})

describe('nearest EPA monitor', () => {
  it('measures miles from an address to the regulatory monitors', () => {
    const near = nearestPmMonitors(-73.944, 40.795)
    expect(near).not.toBeNull()
    expect(near?.nearest.miles).toBeGreaterThan(0)
    expect(near?.citywide).toBeGreaterThan(0)
    expect(near?.within).toBeGreaterThanOrEqual(0)
  })
})
