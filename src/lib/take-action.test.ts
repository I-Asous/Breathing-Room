import { describe, expect, it } from 'vitest'
import { neighborhoodById } from './metrics'
import { actionsToTake } from './take-action'

describe('actions a renter can take', () => {
  it('leads East Harlem with the rent history, the asthma record, and today', () => {
    const place = neighborhoodById('303')
    expect(place).toBeTruthy()
    const steps = actionsToTake(place!)
    const ids = steps.map((step) => step.id)
    expect(ids).toContain('rent-history')
    expect(ids).toContain('asthma-report')
    expect(ids).toContain('air-today')
    expect(steps.find((step) => step.id === 'air-today')?.why).toContain('does not show whether the toll changed the air')
    expect(steps.map((step) => `${step.why} ${step.note}`).join(' ')).not.toContain('qualify')
    expect(steps.map((step) => step.why).join(' ')).not.toMatch(/Council Member [A-Z]/)
  })

  it('sends Chelsea to today and a lottery, and names a district only from the address', () => {
    const place = neighborhoodById('306')
    expect(place).toBeTruthy()
    const steps = actionsToTake(place!)
    expect(steps.map((step) => step.id)).toContain('air-today')
    expect(steps.map((step) => step.id)).toContain('lottery')
    expect(steps.map((step) => step.why).join(' ')).not.toMatch(/close the windows/)

    const pinned = actionsToTake(place!, { address: '2 E 116th St', district: 8 })
    const council = pinned.find((step) => step.id === 'council')
    expect(council?.href).toBe('https://council.nyc.gov/district-8/')
    expect(council?.why).toContain('District 8')
    expect(council?.why).not.toMatch(/[A-Z][a-z]+ [A-Z][a-z]+ is the member/)
    expect(pinned.find((step) => step.id === 'rent-history')?.why).toContain('2 E 116th St')
  })
})
