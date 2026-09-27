import type { CollectionSchema } from 'deepspace/schema'

const readPublic = {
  '*': { read: true, create: false, update: false, delete: false },
  viewer: { read: true, create: false, update: false, delete: false },
  member: { read: true, create: true, update: 'own' as const, delete: 'own' as const },
  admin: { read: true, create: true, update: true, delete: true },
}

/**
 * Listings are created only by the worker after it checks an XRPL payment.
 * Members can still remove their own row. They cannot insert one from the browser.
 */
const hostedListing = {
  '*': { read: true, create: false, update: false, delete: false },
  viewer: { read: true, create: false, update: false, delete: false },
  member: { read: true, create: false, update: 'own' as const, delete: 'own' as const },
  admin: { read: true, create: false, update: true, delete: true },
}

/** Neighbor-posted listings. Not the city listing extract on the atlas. */
export const listingsSchema: CollectionSchema = {
  name: 'listings',
  columns: [
    { name: 'neighborhoodId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'neighborhoodName', storage: 'text', interpretation: 'plain', required: true },
    { name: 'borough', storage: 'text', interpretation: 'plain', required: true },
    { name: 'askingRent', storage: 'number', interpretation: 'plain', required: true },
    { name: 'beds', storage: 'text', interpretation: 'plain', required: true },
    { name: 'note', storage: 'text', interpretation: 'plain', required: true },
    { name: 'authorName', storage: 'text', interpretation: 'plain', required: true },
    { name: 'paymentTxHash', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'paymentNetwork', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'payerAccount', storage: 'text', interpretation: 'plain', required: true, immutable: true },
  ],
  uniqueOn: ['paymentTxHash'],
  permissions: hostedListing,
}

/** One like row per person per listing. The liker owns the row. */
export const listingLikesSchema: CollectionSchema = {
  name: 'listing-likes',
  columns: [
    { name: 'listingId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true },
  ],
  uniqueOn: ['listingId', 'userId'],
  permissions: readPublic,
}

/** A question left on a neighbor listing. */
export const listingQuestionsSchema: CollectionSchema = {
  name: 'listing-questions',
  columns: [
    { name: 'listingId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'body', storage: 'text', interpretation: 'plain', required: true },
    { name: 'authorName', storage: 'text', interpretation: 'plain', required: true },
  ],
  permissions: readPublic,
}
