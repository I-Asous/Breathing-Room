import { describe, expect, it } from 'vitest'
import { CITY, RENT_MONTHS } from './metrics'
import { niceTicks, rentTrend } from './rent-trend'

describe('niceTicks', () => {
  it('covers the range with three to six round steps', () => {
    for (const [low, high] of [
      [2044, 4250],
      [1810, 3900],
      [3100, 3300],
    ]) {
      const ticks = niceTicks(low, high)
      expect(ticks[0]).toBeLessThanOrEqual(low)
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(high)
      expect(ticks.length).toBeGreaterThanOrEqual(3)
      expect(ticks.length).toBeLessThanOrEqual(6)
      const step = ticks[1] - ticks[0]
      expect(ticks.every((t, i) => i === 0 || t - ticks[i - 1] === step)).toBe(true)
    }
  })
})

describe('rentTrend', () => {
  it('shows the city alone when nothing is chosen', () => {
    const trend = rentTrend(null)
    expect(trend.series.map((s) => s.key)).toEqual(['city'])
    expect(trend.series[0].points).toHaveLength(RENT_MONTHS.length)
  })

  it('puts a neighborhood against the city on one axis', () => {
    const harlem = CITY.neighborhoods.find((n) => n.name === 'East Harlem')!
    const trend = rentTrend(harlem)
    expect(trend.series.map((s) => s.key)).toEqual(['place', 'city'])
    const values = trend.series.flatMap((s) => s.points.map((p) => p.value))
    expect(Math.min(...values)).toBeGreaterThanOrEqual(trend.min)
    expect(Math.max(...values)).toBeLessThanOrEqual(trend.max)
    expect(trend.series[0].points.every((p) => p.thin === p.listings < 20)).toBe(true)
  })
})
