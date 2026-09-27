import { describe, expect, it } from 'vitest'
import { parseListingDraft, parseQuestion } from './listing-draft'

const known = new Set(['303'])

describe('parseListingDraft', () => {
  it('accepts a whole-dollar ask in a known neighborhood', () => {
    const result = parseListingDraft({
      neighborhoodId: '303',
      askingRent: '$3,100',
      beds: '1 bedroom',
      note: 'Third-floor walkup, available in October.',
      knownIds: known,
    })
    expect(result).toEqual({
      ok: true,
      value: {
        neighborhoodId: '303',
        askingRent: 3100,
        beds: '1 bedroom',
        note: 'Third-floor walkup, available in October.',
      },
    })
  })

  it('rejects an unknown neighborhood and a rent that is not whole dollars', () => {
    expect(
      parseListingDraft({
        neighborhoodId: '999',
        askingRent: '3100',
        beds: 'Studio',
        note: 'A note',
        knownIds: known,
      }).ok,
    ).toBe(false)
    expect(
      parseListingDraft({
        neighborhoodId: '303',
        askingRent: '3100.50',
        beds: 'Studio',
        note: 'A note',
        knownIds: known,
      }).ok,
    ).toBe(false)
  })
})

describe('parseQuestion', () => {
  it('keeps a question and drops empty text', () => {
    expect(parseQuestion('  Is heat included? ')).toEqual({ ok: true, value: 'Is heat included?' })
    expect(parseQuestion('   ').ok).toBe(false)
  })
})
