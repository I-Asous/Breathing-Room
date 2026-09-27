/**
 * A signed-in neighbor's forum tokens, summed over every neighborhood forum.
 * Counted from the posts, replies, and likes themselves on each request.
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

type QueryResult = {
  success?: boolean
  error?: string
  data?: { records?: Row[]; truncated?: boolean }
}

const FORUM_NAMES = new Set(CITY.neighborhoods.map((place) => place.name))

async function query(
  env: Env,
  roomId: string,
  userId: string,
  collection: string,
  where: Record<string, unknown>,
): Promise<{ rows: Row[]; truncated: boolean }> {
  const stub = env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(roomId))
  const res = await stub.fetch(
    new Request('https://internal/api/tools/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
        'X-App-Action': 'true',
      },
      body: JSON.stringify({ tool: 'records.query', params: { collection, where, limit: 1000 } }),
    }),
  )
  const result = (await res.json()) as QueryResult
  if (!result.success) throw new Error(result.error ?? `${collection} query failed`)
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

async function forumTally(env: Env, channelId: string, userId: string): Promise<TokenTally> {
  const room = `chat:${channelId}`
  const mine = (await query(env, room, userId, 'messages', { authorId: userId })).rows.map(toMessage)
  const live = mine.filter((message) => !message.deleted)
  if (live.length === 0) return EMPTY_TALLY

  // One small query for every like in the forum; if that page overflows, ask per message instead.
  const likes = await query(env, room, userId, 'reactions', { emoji: LIKE })
  let reactions = likes.rows.map(toReaction)
  if (likes.truncated) {
    const perMessage = await Promise.all(
      live.map((message) => query(env, room, userId, 'reactions', { messageId: message.recordId, emoji: LIKE })),
    )
    reactions = perMessage.flatMap((page) => page.rows.map(toReaction))
  }
  return tallyTokens(userId, mine, reactions)
}

export function registerForumTokenRoutes(app: Hono<AppContext>, resolveAuth: ResolveAuth): void {
  app.get('/api/forum/tokens', async (c) => {
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth) return c.json({ error: 'Sign in to see your tokens.' }, 401)
    try {
      const channels = await query(c.env, `app:${c.env.DEEPSPACE_APP_ID}`, auth.userId, 'channels', { type: 'public' })
      const forumIds = channels.rows
        .filter((row) => !row.data.archived && FORUM_NAMES.has(String(row.data.name ?? '')))
        .map((row) => row.recordId)
      const tallies = await Promise.all(forumIds.map((id) => forumTally(c.env, id, auth.userId)))
      const tally = tallies.reduce(addTallies, EMPTY_TALLY)
      return c.json({ ...tally, rates: TOKEN_RATES })
    } catch {
      return c.json({ error: 'Your tokens could not be counted right now.' }, 502)
    }
  })
}
