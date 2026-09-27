export const BED_OPTIONS = ['Studio', '1 bedroom', '2 bedrooms', '3+ bedrooms'] as const

export type BedOption = (typeof BED_OPTIONS)[number]

export type ListingDraft = {
  neighborhoodId: string
  askingRent: number
  beds: BedOption
  note: string
}

const NOTE_MAX = 400

export function parseListingDraft(input: {
  neighborhoodId: string
  askingRent: string
  beds: string
  note: string
  knownIds: ReadonlySet<string>
}): { ok: true; value: ListingDraft } | { ok: false; error: string } {
  const neighborhoodId = input.neighborhoodId.trim()
  if (!input.knownIds.has(neighborhoodId)) return { ok: false, error: 'Choose a neighborhood.' }
  const rentText = input.askingRent.trim().replace(/[$,]/g, '')
  if (!/^\d+$/.test(rentText)) return { ok: false, error: 'Enter the asking rent in whole dollars.' }
  const askingRent = Number(rentText)
  if (askingRent < 1 || askingRent > 100_000) {
    return { ok: false, error: 'Enter an asking rent between $1 and $100,000.' }
  }
  if (!BED_OPTIONS.includes(input.beds as BedOption)) return { ok: false, error: 'Choose how many bedrooms.' }
  const note = input.note.trim()
  if (!note) return { ok: false, error: 'Add a short note about the listing.' }
  if (note.length > NOTE_MAX) return { ok: false, error: 'Keep the note under 400 characters.' }
  return { ok: true, value: { neighborhoodId, askingRent, beds: input.beds as BedOption, note } }
}

export function parseQuestion(body: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = body.trim()
  if (!value) return { ok: false, error: 'Write a question first.' }
  if (value.length > NOTE_MAX) return { ok: false, error: 'Keep the question under 400 characters.' }
  return { ok: true, value }
}
