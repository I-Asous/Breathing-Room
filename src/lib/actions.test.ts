import { describe, expect, it } from 'vitest'
import { neighborhoodById } from './metrics'
import {
  CAUSE_LOOKUPS,
  airAdvice,
  higherAskHigherAir,
  rentCapForIncome,
  rentGuidelineGap,
  signingHint,
  tenantLevers,
} from './actions'

describe('air advice', () => {
  it('keeps the annual mean distinct from a daily reading', () => {
    const chelsea = neighborhoodById('306')
    const harlem = neighborhoodById('303')
    expect(chelsea && harlem).toBeTruthy()
    const high = airAdvice(chelsea!)
    const east = airAdvice(harlem!)
    expect(high?.aboveStandard).toBe(true)
    expect(high?.summary).toContain('9.0')
    expect(high?.summary).toContain('2024')
    expect(high?.sensitive).toContain('AirNow')
    expect(high?.sensitive.toLowerCase()).not.toContain('close the windows')
    expect(east?.asthmaAbove).toBe(true)
    expect(east?.sensitive).toContain('2017-2019')
    expect(east?.summary).not.toContain('38')
    expect(east?.sensitive).toContain('does not show whether the toll changed the air')
  })
})

describe('where it stacks', () => {
  it('joins a higher ask with a higher annual PM2.5 and leaves evictions out', () => {
    const places = higherAskHigherAir()
    const names = places.map((place) => place.name)
    expect(names).toContain('Chelsea - Clinton')
    expect(names).toContain('Union Square - Lower East Side')
    expect(names).not.toContain('East Harlem')
    const union = places.find((place) => place.name.startsWith('Union Square'))
    expect(union?.asthmaAbove).toBe(true)
    expect(CAUSE_LOOKUPS.every((lever) => /does not|not a home purifier|not in this atlas/i.test(lever.note))).toBe(
      true,
    )
  })
})

describe('rent guidelines', () => {
  it('compares the listing change with the published one-year caps', () => {
    const gap = rentGuidelineGap(neighborhoodById('310')!)
    expect(gap).toBeTruthy()
    expect(gap!.note).toContain('3%')
    expect(gap!.note).toContain('2.75%')
    expect(gap!.note).toContain('not a stabilized renewal')
    expect(gap!.orderHref).toContain('order-57')
  })
})

describe('when the listings were lower', () => {
  it('reports the one winter in the series and does not forecast the next', () => {
    const city = signingHint(null)
    expect(city?.dipped).toBe(true)
    expect(city?.winter).toBeLessThan(city!.earlySummer)
    expect(city?.note).toContain('not a forecast')
    const harlem = signingHint(neighborhoodById('303'))
    expect(harlem?.note).toContain('East Harlem')
    expect(harlem?.note).toContain('not a forecast')
  })
})

describe('income and the apartment', () => {
  it('turns yearly income into a 30% monthly rent', () => {
    expect(rentCapForIncome(124_000)).toBeCloseTo(3100, 5)
    expect(rentCapForIncome(0)).toBeNull()
  })

  it('sends the renter to DHCR instead of guessing stabilization', () => {
    const levers = tenantLevers('2 E 116th St')
    const history = levers.find((lever) => lever.title === 'Request your rent history')
    expect(history?.href).toContain('justfix.org')
    expect(history?.note).toContain('cannot tell you')
    expect(levers.map((lever) => lever.note).join(' ').toLowerCase()).not.toContain('likely stabilized')
    expect(levers.find((lever) => lever.title === 'Look up the landlord')?.note).toContain('2 E 116th St')
  })
})
