import { describe, expect, it } from 'vitest'
import { LIKE, addTallies, tallyTokens } from './forum-tokens'

const messages = [
  { recordId: 'p1', authorId: 'ana' },
  { recordId: 'r1', authorId: 'ana', parentMessageId: 'p9' },
  { recordId: 'r2', authorId: 'ana', parentMessageId: 'p9', deleted: true },
  { recordId: 'p2', authorId: 'ben' },
]

describe('tallyTokens', () => {
  it('pays 1 per post or reply and 1 for every 2 likes from someone else', () => {
    const tally = tallyTokens('ana', messages, [
      { messageId: 'p1', userId: 'ben', emoji: LIKE },
      { messageId: 'r1', userId: 'cy', emoji: LIKE },
    ])
    expect(tally).toEqual({ posts: 1, replies: 1, likesReceived: 2, total: 3 })
  })

  it('ignores self-likes, other emoji, duplicates, and removed messages', () => {
    const tally = tallyTokens('ana', messages, [
      { messageId: 'p1', userId: 'ana', emoji: LIKE },
      { messageId: 'p1', userId: 'ben', emoji: '❤️' },
      { messageId: 'p1', userId: 'ben', emoji: LIKE },
      { messageId: 'p1', userId: 'ben', emoji: LIKE },
      { messageId: 'r2', userId: 'ben', emoji: LIKE },
      { messageId: 'p2', userId: 'cy', emoji: LIKE },
    ])
    expect(tally).toEqual({ posts: 1, replies: 1, likesReceived: 1, total: 2 })
  })

  it('adds forums together, pairing likes across forums', () => {
    const one = tallyTokens('ana', messages, [{ messageId: 'p1', userId: 'ben', emoji: LIKE }])
    expect(one.total).toBe(2)
    expect(addTallies(one, one)).toEqual({ posts: 2, replies: 2, likesReceived: 2, total: 5 })
  })
})
