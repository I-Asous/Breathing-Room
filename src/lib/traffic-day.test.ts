import { describe, expect, it } from 'vitest'
import { WEEKDAY_CRZ_ENTRIES, hourAir, trafficMarkCount } from './traffic-day'

describe('weekday traffic and air', () => {
  it('puts the morning peak above the quiet night', () => {
    expect(WEEKDAY_CRZ_ENTRIES).toHaveLength(24)
    const morning = hourAir(20, 8, 8)
    const night = hourAir(20, 8, 3)
    expect(morning.entries).toBeGreaterThan(night.entries)
    expect(morning.no2).toBeGreaterThan(20)
    expect(night.no2).toBeLessThan(20)
    expect(morning.pm25).toBeGreaterThan(8)
    expect(night.pm25).toBeLessThan(8)
    const no2Swing = (morning.no2 ?? 0) - (night.no2 ?? 0)
    const pmSwing = (morning.pm25 ?? 0) - (night.pm25 ?? 0)
    expect(no2Swing / 20).toBeGreaterThan(pmSwing / 8)
    expect(trafficMarkCount(morning.relative, 20, 15)).toBeGreaterThan(trafficMarkCount(night.relative, 20, 15))
  })
})
