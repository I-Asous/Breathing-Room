import { describe, expect, it } from 'vitest'
import cleaning from '../data/cleaning.json'
import { cleaningSteps, rateExample } from './cleaning'

describe('cleaning counts', () => {
  it('accounts for every row the build read', () => {
    const { listings, zips, housing } = cleaning
    expect(listings.kept + listings.priceOutOfRange + listings.noZip + listings.noPoint + listings.outsideCity).toBe(
      listings.rows,
    )
    expect(zips.inside + zips.snapped + zips.outside).toBe(zips.total)
    expect(zips.dropped).toHaveLength(zips.outside)
    const outside = 'outside' in housing ? (housing.outside as number) : 0
    const snapped = 'snapped' in housing ? (housing.snapped as number) : 0
    expect(housing.inside + snapped + outside + housing.noPoint).toBe(housing.rows)
  })

  it('describes each record with a before and after', () => {
    const steps = cleaningSteps()
    expect(steps).toHaveLength(6)
    for (const step of steps) {
      expect(step.from).toMatch(/\d/)
      expect(step.to).toMatch(/\d/)
      expect(step.what).not.toContain('undefined')
      expect(step.what).not.toContain('NaN')
    }
  })

  it('names the dropped ZIPs as New Jersey only when they are', () => {
    const zipStep = cleaningSteps()[1]
    const jersey = cleaning.zips.dropped.every((zip) => zip.startsWith('07'))
    expect(zipStep.what.includes('New Jersey')).toBe(jersey)
  })

  it('shows a place where the rate and the raw count disagree', () => {
    const example = rateExample()
    expect(example).not.toBeNull()
    const { more, fewer } = example!
    expect(more.units).toBeGreaterThan(fewer.units)
    expect(fewer.rate).toBeGreaterThan(more.rate)
    expect(more.unitRank).toBeLessThan(fewer.unitRank)
    expect(fewer.rateRank).toBeLessThan(more.rateRank)
  })
})
