import { describe, expect, it } from 'vitest'
import { congestionRelation, interpretDesk } from './desk'
import { neighborhoodIdAt } from './geo'
import { neighborhoodById } from './metrics'

const origin = 'https://where-it-lands.app.space'

describe('neighborhoodIdAt', () => {
  it('places a point in East Harlem', () => {
    expect(neighborhoodIdAt(-73.944, 40.795)).toBe('303')
  })
})

describe('congestion zone', () => {
  it('keeps the toll south of 60th Street and refuses to score it', () => {
    const harlem = neighborhoodById('303')
    const downtown = neighborhoodById('310')
    const upperEast = neighborhoodById('305')
    expect(harlem && congestionRelation(harlem)).toBe('outside')
    expect(downtown && congestionRelation(downtown)).toBe('inside')
    expect(upperEast && congestionRelation(upperEast)).toBe('edge')

    const outside = interpretDesk('should I rent in East Harlem?', null, origin)
    expect(outside.kind).toBe('brief')
    expect(outside.text).toContain('East Harlem')
    expect(outside.text).toContain('outside the Congestion Relief Zone')
    expect(outside.text).toContain('$9')
    expect(outside.text).toContain('$2.25')
    expect(outside.text).toContain('µg/m³')
    expect(outside.text).not.toMatch(/toll (cut|reduced|improved|lowered) the air/i)
    expect(outside.text).toContain('does not show whether the toll changed the air')

    const inside = interpretDesk('Lower Manhattan', null, origin)
    expect(inside.text).toContain('inside the Congestion Relief Zone')
    expect(inside.text.indexOf('housingconnect.nyc.gov')).toBeLessThan(
      inside.text.indexOf('asthma_and_the_environment'),
    )
  })
})

describe('interpretDesk', () => {
  it('asks which Harlem and compares two named places', () => {
    const harlem = interpretDesk('harlem', null, origin)
    expect(harlem.kind).toBe('choose')
    expect(harlem.text).toContain('East Harlem')
    expect(harlem.text).toContain('Central Harlem')

    const both = interpretDesk('east harlem and astoria', null, origin)
    expect(both.kind).toBe('compare')
    expect(both.text).toContain('Astoria')
    expect(both.text).toContain('Pros of')
    expect(both.neighborhoodId).toBe('303')

    const follow = interpretDesk('compare Astoria', '303', origin)
    expect(follow.kind).toBe('compare')
    expect(follow.neighborhoodId).toBe('303')
    expect(follow.text).toContain('compared with Long Island City - Astoria')
  })

  it('keeps the neighborhood on a follow-up', () => {
    const follow = interpretDesk('what about the toll?', '303', origin)
    expect(follow.neighborhoodId).toBe('303')
    expect(follow.text).toContain('East Harlem')
  })

  it('names the action that follows the record, and the council district only for that address', () => {
    const harlem = interpretDesk('should I rent in East Harlem?', null, origin)
    expect(harlem.kind).toBe('brief')
    expect(harlem.steps.map((step) => step.kind)).toEqual(['air', 'tenant', 'council'])
    expect(harlem.text).toContain('asthma_and_the_environment')
    expect(harlem.text).toContain('tenantprotection')
    expect(harlem.text).toContain('council.nyc.gov/districts/')
    expect(harlem.spoken).not.toContain('https://')

    const pinned = interpretDesk('East Harlem', null, origin, { district: 8, neighborhoodId: '303' })
    expect(pinned.text).toContain('https://council.nyc.gov/district-8/')
    expect(pinned.text).not.toContain('council.nyc.gov/districts/')

    const elsewhere = interpretDesk('Astoria', null, origin, { district: 8, neighborhoodId: '303' })
    expect(elsewhere.text).toContain('council.nyc.gov/districts/')
    expect(elsewhere.text).not.toContain('district-8')
  })
})
