import type { CollectionSchema } from 'deepspace/schema'

/** Shared margin notes on a neighborhood. Visitors can read; members can write their own. */
export const fieldNotesSchema: CollectionSchema = {
  name: 'field-notes',
  columns: [
    { name: 'uhfId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'placeName', storage: 'text', interpretation: 'plain', required: true },
    { name: 'borough', storage: 'text', interpretation: 'plain', required: true },
    { name: 'body', storage: 'text', interpretation: 'plain', required: true },
    { name: 'authorName', storage: 'text', interpretation: 'plain', required: true },
  ],
  permissions: {
    '*': { read: true, create: false, update: false, delete: false },
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: true, update: 'own', delete: 'own' },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
