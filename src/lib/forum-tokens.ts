/**
 * Forum tokens: a light thank-you for contributing, with no cash value.
 * Derived from forum records every time, never stored as a balance, so nobody
 * can mint their own and removing a post removes what it earned.
 */

export const TOKEN_RATES = { post: 1, reply: 1, likeReceived: 0.5 } as const

/** The reaction emoji the forum uses as a like. */
export const LIKE = '👍'

export type TokenMessage = {
  recordId: string
  authorId: string
  parentMessageId?: string | null
  deleted?: boolean | null
}

export type TokenReaction = { messageId: string; userId: string; emoji: string }

export type TokenTally = { posts: number; replies: number; likesReceived: number; total: number }

export const EMPTY_TALLY: TokenTally = { posts: 0, replies: 0, likesReceived: 0, total: 0 }

export function tallyTokens(userId: string, messages: TokenMessage[], reactions: TokenReaction[]): TokenTally {
  const mine = new Set<string>()
  let posts = 0
  let replies = 0
  for (const message of messages) {
    if (message.authorId !== userId || message.deleted) continue
    mine.add(message.recordId)
    if (message.parentMessageId) replies += 1
    else posts += 1
  }
  const likes = new Set<string>()
  for (const reaction of reactions) {
    if (reaction.emoji !== LIKE || reaction.userId === userId || !mine.has(reaction.messageId)) continue
    likes.add(`${reaction.messageId}:${reaction.userId}`)
  }
  return withTotal({ posts, replies, likesReceived: likes.size })
}

export function addTallies(a: TokenTally, b: TokenTally): TokenTally {
  return withTotal({
    posts: a.posts + b.posts,
    replies: a.replies + b.replies,
    likesReceived: a.likesReceived + b.likesReceived,
  })
}

function withTotal(counts: Omit<TokenTally, 'total'>): TokenTally {
  const total =
    counts.posts * TOKEN_RATES.post +
    counts.replies * TOKEN_RATES.reply +
    counts.likesReceived * TOKEN_RATES.likeReceived
  return { ...counts, total }
}

export function formatTokens(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
