import { describe, expect, it } from 'vitest'
import { CITY, airAt, burdenShare, deepPer1k } from './metrics'
import { standingFor } from './standing'

const byName = (name: string) => CITY.neighborhoods.find((n) => n.name === name)!

describe('standingFor', () => {
  it('gives every neighborhood a line on air, rent, rent burden, and affordable homes', () => {
    for (const n of CITY.neighborhoods) {
      const parts = standingFor(n)
      expect(parts).toHaveLength(4)
      for (const part of parts) expect(part.text).not.toMatch(/undefined|NaN|overlap|as many .* than/)
    }
  })

  it('leans each part against the city', () => {
    const [air, rent, , homes] = standingFor(byName('Upper East Side'))
    const cityPm = airAt(CITY.citywide.pm25, '2024')!
    expect(airAt(byName('Upper East Side').pm25, '2024')!).toBeGreaterThan(cityPm)
    expect(air.lean).toBe('worse')
    expect(rent.text).toMatch(/over the city's/)
    expect(homes.lean).toBe('worse')
  })

  it('names the month a rent change is measured from', () => {
    const rent = standingFor(byName('East Harlem'))[1].text
    expect(rent).toMatch(/(up|down) \d+% since \w+ \d{4}|flat since/)
  })

  it('reads rent burden against the city', () => {
    for (const n of CITY.neighborhoods) {
      const part = standingFor(n)[2]
      const share = burdenShare([n])!
      const city = burdenShare(CITY.neighborhoods)!
      expect(part.text).toContain(`${Math.round(share)}% of renters`)
      if (share > city * 1.05) expect(part.lean).toBe('worse')
      if (share < city * 0.95) expect(part.lean).toBe('better')
    }
  })

  it('says none rather than 0.0 where no deep units were started', () => {
    const zero = CITY.neighborhoods.find((n) => deepPer1k([n]) === 0)
    if (!zero) return
    expect(standingFor(zero)[3].text).toMatch(/^no deeply affordable homes/)
  })
})
