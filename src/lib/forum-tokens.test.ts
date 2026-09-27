import { describe, expect, it } from 'vitest'
import { LIKE, addTallies, formatTokens, tallyTokens } from './forum-tokens'

const messages = [
  { recordId: 'p1', authorId: 'ana' },
  { recordId: 'r1', authorId: 'ana', parentMessageId: 'p9' },
  { recordId: 'r2', authorId: 'ana', parentMessageId: 'p9', deleted: true },
  { recordId: 'p2', authorId: 'ben' },
]

describe('tallyTokens', () => {
  it('pays 1 per post or reply and 0.5 per like from someone else', () => {
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
    expect(tally).toEqual({ posts: 1, replies: 1, likesReceived: 1, total: 2.5 })
  })

  it('adds forums together and formats halves', () => {
    const one = tallyTokens('ana', messages, [{ messageId: 'p1', userId: 'ben', emoji: LIKE }])
    const sum = addTallies(one, one)
    expect(sum.total).toBe(5)
    expect(formatTokens(2.5)).toBe('2.5')
    expect(formatTokens(3)).toBe('3')
  })
})
