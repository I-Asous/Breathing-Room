/**
 * Collection Schemas
 *
 * All collections with columns and RBAC permissions.
 * Single source of truth — imported by both worker and frontend.
 *
 * Add schemas by creating a file in src/schemas/ and importing it here.
 */

import type { CollectionSchema } from 'deepspace/schema'
import { usersSchema } from './schemas/users-schema'
import { settingsSchema } from './schemas/admin-schema'
import { fieldNotesSchema } from './schemas/field-notes-schema'
import { listingLikesSchema, listingQuestionsSchema, listingsSchema } from './schemas/listings-schema'

import { messagingSchemas } from './schemas/messaging-schema'

export const schemas: CollectionSchema[] = [
  ...messagingSchemas,
  usersSchema,
  settingsSchema,
  fieldNotesSchema,
  listingsSchema,
  listingLikesSchema,
  listingQuestionsSchema,
]
