import { describe, expect, it } from 'vitest'
import { composePost, splitPost } from './forum-post'

describe('forum posts', () => {
  it('keeps a title and a body in one message', () => {
    const stored = composePost('  Rent on 116th  ', 'Is $3,100 the new ask?\n')
    expect(stored.startsWith('Rent on 116th\n\n')).toBe(true)
    expect(splitPost(stored)).toEqual({
      title: 'Rent on 116th',
      body: 'Is $3,100 the new ask?',
    })
  })

  it('treats a one-line message as a title', () => {
    expect(splitPost('Just the title')).toEqual({ title: 'Just the title', body: '' })
    expect(composePost('   ', 'no title')).toBe('')
  })
})
