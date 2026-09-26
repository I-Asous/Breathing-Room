import { describe, expect, it } from 'vitest'
import { CITY, last } from './metrics'
import { nextSteps, reportSlug } from './next-steps'

const byName = (name: string) => CITY.neighborhoods.find((n) => n.name === name)!

describe('nextSteps', () => {
  it('gives every neighborhood three distinct places to act', () => {
    for (const neighborhood of CITY.neighborhoods) {
      const steps = nextSteps(neighborhood)
      expect(steps).toHaveLength(3)
      expect(new Set(steps.map((s) => s.kind)).size).toBe(3)
      expect(steps.every((s) => s.href.startsWith('https://'))).toBe(true)
    }
  })

  it('uses the NYC Health report slugs, including the shortened ones', () => {
    expect(reportSlug('Kingsbridge - Riverdale')).toBe('kingsbridge_riverdale')
    expect(reportSlug('Bedford Stuyvesant - Crown Heights')).toBe('bedford_stuyvesant_crown_heights')
    expect(reportSlug('Fordham - Bronx Park')).toBe('fordham_bronx_pk')
    expect(reportSlug('Washington Heights - Inwood')).toBe('washington_heights')
    expect(reportSlug('Rockaway')).toBe('rockaways')
  })

  it('leads with asthma where it runs above the city, and with housing elsewhere', () => {
    const city = last(CITY.citywide.asthmaChild)!.value
    const harlem = byName('East Harlem')
    expect(last(harlem.asthmaChild)!.value).toBeGreaterThan(city)
    expect(nextSteps(harlem)[0].kind).toBe('air')

    const ues = byName('Upper East Side')
    expect(last(ues.asthmaChild)!.value).toBeLessThan(city)
    expect(nextSteps(ues)[0].kind).toBe('housing')
  })

  it('names the council district when an address has been placed in one', () => {
    const harlem = nextSteps(byName('East Harlem'), CITY.neighborhoods, 8)
    const council = harlem.find((step) => step.kind === 'council')
    expect(council?.href).toBe('https://council.nyc.gov/district-8/')
    expect(council?.note).toContain('District 8')
    expect(nextSteps(byName('East Harlem')).find((step) => step.kind === 'council')?.href).toBe(
      'https://council.nyc.gov/districts/',
    )
  })
})
