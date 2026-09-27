import type { CollectionSchema } from 'deepspace/schema'

/**
 * Each neighbor's forum token total, for the public coin badge.
 * Only the worker writes it, as a recount of real posts, replies, and likes,
 * so nobody can raise their own. Everyone can read it.
 */
export const forumStandingSchema: CollectionSchema = {
  name: 'forum-standing',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'tokens', storage: 'number', interpretation: 'plain', required: true },
  ],
  uniqueOn: ['userId'],
  permissions: {
    '*': { read: true, create: false, update: false, delete: false },
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: false, update: false, delete: false },
    admin: { read: true, create: false, update: false, delete: true },
  },
}
