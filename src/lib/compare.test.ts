import { describe, expect, it } from 'vitest'
import { compareNeighborhoods } from './compare'
import { neighborhoodById } from './metrics'

describe('compareNeighborhoods', () => {
  const harlem = neighborhoodById('303')!
  const downtown = neighborhoodById('310')!

  it('lists pros and cons and withholds an action when the other place is not ahead', () => {
    const comparison = compareNeighborhoods(harlem, downtown)
    expect(comparison.pros.map((point) => point.id)).toContain('asthma')
    expect(comparison.cons.map((point) => point.id)).toEqual(expect.arrayContaining(['rent', 'deep']))
    expect(comparison.otherIsBetter).toBe(false)
    expect(comparison.insight).toBeNull()
    expect(comparison.zone).toContain('not scored')
    expect(comparison.zone).toContain('does not show whether the toll changed the air')
  })

  it('names an action when the other place wins on more of the record', () => {
    const comparison = compareNeighborhoods(downtown, harlem)
    expect(comparison.otherIsBetter).toBe(true)
    expect(comparison.insight?.href).toMatch(/^https:\/\//)
    expect(comparison.insight?.note).toContain('East Harlem')
    expect(comparison.insight?.note).not.toMatch(/toll (cut|reduced|improved|lowered)/i)
  })
})
