/**
 * Forum tokens, summed over every neighborhood forum and counted from the
 * posts, replies, and likes themselves. Each recount is also saved to the
 * public `forum-standing` row that drives the coin badge.
 */

import type { Hono } from 'hono'
import type { VerifyResult } from 'deepspace/worker'
import type { AppContext, Env } from '../../worker.js'
import { CITY } from '../lib/metrics.js'
import {
  EMPTY_TALLY,
  LIKE,
  TOKEN_RATES,
  addTallies,
  tallyTokens,
  type TokenMessage,
  type TokenReaction,
  type TokenTally,
} from '../lib/forum-tokens.js'

type ResolveAuth = (req: Request, env: Env) => Promise<VerifyResult | null>

type Row = { recordId: string; createdBy?: string; data: Record<string, unknown> }

type ToolResult = {
  success?: boolean
  error?: string
  data?: { records?: Row[]; truncated?: boolean; recordId?: string }
}

const FORUM_NAMES = new Set(CITY.neighborhoods.map((place) => place.name))

async function tool(
  env: Env,
  roomId: string,
  userId: string,
  name: string,
  params: Record<string, unknown>,
): Promise<ToolResult> {
  const stub = env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(roomId))
  const res = await stub.fetch(
    new Request('https://internal/api/tools/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
        'X-App-Action': 'true',
      },
      body: JSON.stringify({ tool: name, params }),
    }),
  )
  const result = (await res.json()) as ToolResult
  if (!result.success) throw new Error(result.error ?? `${name} failed`)
  return result
}

async function query(
  env: Env,
  roomId: string,
  userId: string,
  collection: string,
  where: Record<string, unknown>,
): Promise<{ rows: Row[]; truncated: boolean }> {
  const result = await tool(env, roomId, userId, 'records.query', { collection, where, limit: 1000 })
  return { rows: result.data?.records ?? [], truncated: result.data?.truncated === true }
}

function toMessage(row: Row): TokenMessage {
  return {
    recordId: row.recordId,
    authorId: String(row.data.authorId || row.createdBy || ''),
    parentMessageId: typeof row.data.parentMessageId === 'string' ? row.data.parentMessageId : null,
    deleted: Boolean(row.data.deleted),
  }
}

function toReaction(row: Row): TokenReaction {
  return {
    messageId: String(row.data.messageId ?? ''),
    userId: String(row.data.userId ?? ''),
    emoji: String(row.data.emoji ?? ''),
  }
}

/** `userId`'s tally in one forum, read with `asUserId`'s access. */
async function forumTally(env: Env, channelId: string, userId: string, asUserId: string): Promise<TokenTally> {
  const room = `chat:${channelId}`
  const mine = (await query(env, room, asUserId, 'messages', { authorId: userId })).rows.map(toMessage)
  const live = mine.filter((message) => !message.deleted)
  if (live.length === 0) return EMPTY_TALLY

  // One small query for every like in the forum; if that page overflows, ask per message instead.
  const likes = await query(env, room, asUserId, 'reactions', { emoji: LIKE })
  let reactions = likes.rows.map(toReaction)
  if (likes.truncated) {
    const perMessage = await Promise.all(
      live.map((message) => query(env, room, asUserId, 'reactions', { messageId: message.recordId, emoji: LIKE })),
    )
    reactions = perMessage.flatMap((page) => page.rows.map(toReaction))
  }
  return tallyTokens(userId, mine, reactions)
}

async function countTokens(env: Env, userId: string, asUserId: string): Promise<TokenTally> {
  const appRoom = `app:${env.DEEPSPACE_APP_ID}`
  const channels = await query(env, appRoom, asUserId, 'channels', { type: 'public' })
  const forumIds = channels.rows
    .filter((row) => !row.data.archived && FORUM_NAMES.has(String(row.data.name ?? '')))
    .map((row) => row.recordId)
  const tallies = await Promise.all(forumIds.map((id) => forumTally(env, id, userId, asUserId)))
  return tallies.reduce(addTallies, EMPTY_TALLY)
}

/** Upsert the public row the coin badge reads. Only the worker writes it. */
async function saveStanding(env: Env, userId: string, tokens: number): Promise<void> {
  const appRoom = `app:${env.DEEPSPACE_APP_ID}`
  const prior = (await query(env, appRoom, userId, 'forum-standing', { userId })).rows[0]
  if (prior) {
    if (Number(prior.data.tokens) === tokens) return
    await tool(env, appRoom, userId, 'records.update', {
      collection: 'forum-standing',
      recordId: prior.recordId,
      data: { tokens },
    })
    return
  }
  await tool(env, appRoom, userId, 'records.create', { collection: 'forum-standing', data: { userId, tokens } })
}

export function registerForumTokenRoutes(app: Hono<AppContext>, resolveAuth: ResolveAuth): void {
  app.get('/api/forum/tokens', async (c) => {
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth) return c.json({ error: 'Sign in to see your tokens.' }, 401)
    try {
      const tally = await countTokens(c.env, auth.userId, auth.userId)
      await saveStanding(c.env, auth.userId, tally.total).catch(() => undefined)
      return c.json({ ...tally, rates: TOKEN_RATES })
    } catch {
      return c.json({ error: 'Your tokens could not be counted right now.' }, 502)
    }
  })

  /** Recount another author after a like, so their coin moves even while they are away. */
  app.post('/api/forum/standing', async (c) => {
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth) return c.json({ error: 'Sign in first.' }, 401)
    let body: unknown = null
    try {
      body = await c.req.json()
    } catch {
      body = null
    }
    const userId =
      body && typeof body === 'object' && typeof (body as { userId?: unknown }).userId === 'string'
        ? (body as { userId: string }).userId.slice(0, 128)
        : ''
    if (!userId) return c.json({ error: 'Send the author userId.' }, 400)
    try {
      const tally = await countTokens(c.env, userId, auth.userId)
      await saveStanding(c.env, userId, tally.total)
      return c.json({ userId, tokens: tally.total })
    } catch {
      return c.json({ error: 'That standing could not be updated right now.' }, 502)
    }
  })
}
