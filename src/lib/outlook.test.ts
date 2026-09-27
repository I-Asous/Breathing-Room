import { describe, expect, it } from 'vitest'
import { neighborhoodById } from './metrics'
import {
  AIR_HOLD,
  EQUITY_HOLD,
  RENT_HOLD,
  airContinuation,
  airSentence,
  cityAir,
  equityRecord,
  fitLine,
  placeAir,
  rentOutlook,
  rentSentence,
} from './outlook'
import { CITY } from './metrics'

describe('predictive modeling', () => {
  it('fits a perfect line with no leftover miss', () => {
    const fit = fitLine([
      { x: 0, y: 1 },
      { x: 1, y: 3 },
      { x: 2, y: 5 },
    ])
    expect(fit?.slope).toBeCloseTo(2)
    expect(fit?.r2).toBeCloseTo(1)
    expect(fit?.residualSd).toBeCloseTo(0)
    expect(fitLine([{ x: 1, y: 1 }, { x: 2, y: 2 }])).toBeNull()
  })

  it('continues city air one year past the last published mean', () => {
    const fit = cityAir()
    expect(fit?.n).toBe(16)
    expect(fit?.firstYear).toBe(2009)
    expect(fit?.lastYear).toBe(2024)
    expect(fit?.nextYear).toBe(2025)
    expect(fit?.slopePerYear).toBeLessThan(0)
    expect(fit?.r2).toBeGreaterThan(0.7)
    expect(fit?.band).toBeGreaterThan(0)
    expect(fit && airSentence(fit)).toContain(AIR_HOLD)
    expect(fit && airSentence(fit)).toContain('does not show whether the toll changed the air')
    expect(fit && airSentence(fit)).not.toContain('https://')
  })

  it('does not extend housing equity', () => {
    const city = equityRecord(CITY.neighborhoods)
    expect(city.burdenPeriod).toBe('2020-2024')
    expect(city.burdenPct).toBeGreaterThan(40)
    expect(city.asthmaPeriod).toBe('2017-2019')
    expect(EQUITY_HOLD).toContain('does not extend')
    const eastHarlem = neighborhoodById('303')
    expect(eastHarlem).not.toBeNull()
    if (!eastHarlem) return
    const place = equityRecord([eastHarlem])
    expect(place.asthmaPeriod).toBe('2017-2019')
    expect(place.deepPer1k).toBeGreaterThan(0)
  })

  it('reads the next rent month from the same month a year earlier', () => {
    const city = rentOutlook(CITY.citywide.asking1br)
    expect(city?.endMonth).toBe('2026-08')
    expect(city?.nextMonth).toBe('2026-09')
    expect(city?.precedent?.month).toBe('2025-09')
    expect(city?.precedent?.n).toBeGreaterThanOrEqual(20)
    expect(city?.pairs.length).toBeGreaterThan(0)
    expect(city && rentSentence(city)).toContain(RENT_HOLD)
    expect(city && rentSentence(city)).not.toContain('profit')

    const rockaway = neighborhoodById('410')
    expect(rockaway).not.toBeNull()
    if (!rockaway) return
    const thin = rentOutlook(rockaway.asking1br)
    expect(thin?.pairs).toHaveLength(0)
    expect(thin?.precedent).toBeNull()
    expect(thin?.line).toBeNull()
  })

  it('fits East Harlem air on the same 2009–2024 years', () => {
    const eastHarlem = neighborhoodById('303')
    const fit = eastHarlem ? placeAir(eastHarlem) : null
    expect(fit?.firstYear).toBe(2009)
    expect(fit?.lastYear).toBe(2024)
    expect(fit?.nextYear).toBe(2025)
    const series = [{ period: '2022', value: 6 }, { period: '2023', value: 6 }]
    expect(airContinuation(series)).toBeNull()
  })
})
