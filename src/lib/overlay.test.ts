import { describe, expect, it } from 'vitest'
import { neighborhoodsForBudget, readingsFor, rentPressure } from './overlay'

describe('rent and air side by side', () => {
  it('shades asking rent and both pollutants', () => {
    const rent = readingsFor('asking', '2026-08')
    const pm = readingsFor('pm25', '2024')
    const no = readingsFor('no2', '2024')
    expect(rent.size).toBe(42)
    expect(pm.get('303')?.label).toMatch(/µg\/m³$/)
    expect(no.get('303')?.label).toMatch(/ppb$/)
    expect(rent.get('303')?.label).toMatch(/^\$/)
  })
})

describe('equity gap', () => {
  it('marks asks that outran the city where 2024 air is still higher', () => {
    const places = rentPressure()
    expect(places.map((place) => place.name)).toEqual([
      'High Bridge - Morrisania',
      'Washington Heights - Inwood',
      'Greenwich Village - Soho',
      'Long Island City - Astoria',
    ])
    for (const place of places) {
      expect(place.listings).toBeGreaterThanOrEqual(20)
      expect(place.askPct).toBeGreaterThan(place.cityAskPct + 0.9)
      expect(place.pmAbove || place.no2Above).toBe(true)
      expect(place.insight.href).toMatch(/^https:\/\/a816-dohbesp\.nyc\.gov\//)
      expect(place.insight.note).toContain('does not show whether the toll changed the air')
      expect(place.insight.note.toLowerCase()).not.toContain('priced out')
    }
  })
})

describe('health premium', () => {
  it('ranks a budget from cleanest air to worst and stays inside the ask', () => {
    const bracket = neighborhoodsForBudget(3100)
    expect(bracket).toBeTruthy()
    const rows = bracket!.rows
    expect(rows[0].pm25).toBeLessThanOrEqual(rows[rows.length - 1].pm25)
    expect(rows.some((row) => row.name === 'East Harlem')).toBe(true)
    expect(rows.some((row) => row.name === 'Lower Manhattan')).toBe(false)
    expect(rows.every((row) => row.ask <= 3100)).toBe(true)
    expect(bracket!.reachesCityAir).toBe(true)
    expect(bracket!.insight?.href.startsWith('/?n=')).toBe(true)
    expect(bracket!.insight?.note).toContain('not what a sitting tenant pays')
  })

  it('names the report when the budget cannot reach the city mean', () => {
    const bracket = neighborhoodsForBudget(1850)
    expect(bracket!.rows.length).toBeGreaterThan(0)
    expect(bracket!.reachesCityAir).toBe(false)
    expect(bracket!.rows.some((row) => row.name === 'Rockaway')).toBe(false)
    expect(bracket!.insight?.href).toMatch(/asthma_and_the_environment/)
    expect(bracket!.insight?.note).toContain('above the city mean')
  })

  it('returns no neighborhoods under an ask none of them meet', () => {
    const bracket = neighborhoodsForBudget(500)
    expect(bracket!.rows).toHaveLength(0)
    expect(bracket!.insight).toBeNull()
  })
})
