import { describe, expect, it } from 'vitest'
import { neighborhoodById } from './metrics'
import { coOccurPlaces, costRecord, dossierText, testimonyText } from './true-cost'

describe('true cost', () => {
  const place = neighborhoodById('303')
  if (!place) throw new Error('missing East Harlem')
  const record = costRecord(place, 2800)

  it('uses the published annual mean and the rent index, and withholds a day count', () => {
    expect(record.pm).toBeGreaterThan(5)
    expect(record.zoriChange).not.toBeNull()
    const dossier = dossierText(record, '2 E 116th St')
    expect(dossier).toContain('Zillow Observed Rent Index')
    expect(dossier).toContain('does not count days')
    expect(dossier).toContain('does not contain an eviction rate')
    expect(dossier).not.toMatch(/eviction rate is \d/i)
    expect(dossier).not.toMatch(/days above the WHO/i)
    expect(testimonyText(record, null)).toContain('I do not have a count of days')
  })

  it('keeps co-occurring places inside the rent index and the 2024 air mean', () => {
    const rows = coOccurPlaces()
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThan(15)
    expect(rows.every((row) => row.pm > 0 && Number.isFinite(row.zoriChange))).toBe(true)
  })
})
