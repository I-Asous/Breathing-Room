import { useMemo, useState } from 'react'
import { isWriterRole, useMessages, useReactions, useUser, useUserLookup, type Message, type RecordData } from 'deepspace'
import { composePost, splitPost } from '@/lib/forum-post'
import { LIKE, TOKEN_RATES } from '@/lib/forum-tokens'
import { CoinBadge } from '@/components/messaging/CoinBadge'

function authorIdOf(message: RecordData<Message>): string {
  return message.data.authorId || message.createdBy
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function ForumFeed({
  channelId,
  postId,
  onOpenPost,
  onSignIn,
  onActivity,
  standing,
  onLiked,
}: {
  channelId: string
  postId: string | null
  onOpenPost: (id: string | null) => void
  onSignIn: () => void
  /** Called after the signed-in neighbor posts, replies, likes, or removes, so a token total can refresh. */
  onActivity?: () => void
  /** Public token totals by userId, for the coin next to each author's name. */
  standing?: ReadonlyMap<string, number>
  /** Called with the author's userId after the viewer likes or unlikes their message. */
  onLiked?: (authorId: string) => void
}) {
  const { messages, status, send, softDelete } = useMessages(channelId)
  const { getReactionsForMessage, toggle } = useReactions(channelId)
  const { user } = useUser()
  const { getName } = useUserLookup()
  const canWrite = isWriterRole(user?.role)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [reply, setReply] = useState('')
  const [composing, setComposing] = useState(false)
  const [sending, setSending] = useState(false)

  const posts = useMemo(
    () =>
      messages
        .filter((message) => !message.data.parentMessageId && !message.data.deleted)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [messages],
  )
  const replyCount = useMemo(() => {
    const counts = new Map<string, number>()
    for (const message of messages) {
      const parent = message.data.parentMessageId
      if (parent && !message.data.deleted) counts.set(parent, (counts.get(parent) ?? 0) + 1)
    }
    return counts
  }, [messages])
  const openPost = postId ? (messages.find((message) => message.recordId === postId) ?? null) : null
  function likesOf(messageId: string): { count: number; mine: boolean } {
    const like = getReactionsForMessage(messageId).find((group) => group.emoji === LIKE)
    return { count: like?.count ?? 0, mine: like?.currentUserReacted ?? false }
  }

  function author(message: RecordData<Message>) {
    const id = authorIdOf(message)
    return (
      <>
        {getName(id) ?? 'Neighbor'}
        <CoinBadge tokens={standing?.get(id) ?? 0} className="ml-1" />
      </>
    )
  }

  function remove(messageId: string) {
    softDelete(messageId)
    onActivity?.()
  }

  function likeButton(message: RecordData<Message>) {
    const { count, mine } = likesOf(message.recordId)
    const own = user?.id === authorIdOf(message)
    const label = `${count} ${count === 1 ? 'like' : 'likes'}`
    if (own || !canWrite) {
      return (
        <button
          type="button"
          className="text-xs text-muted-foreground disabled:cursor-default"
          disabled={own}
          title={own ? `Every ${TOKEN_RATES.likesPerToken} likes from neighbors earn you 1 token` : 'Sign in to like'}
          onClick={own ? undefined : onSignIn}
        >
          ♥ {label}
        </button>
      )
    }
    return (
      <button
        type="button"
        className={`text-xs underline-offset-4 hover:underline ${mine ? 'text-primary' : 'text-muted-foreground'}`}
        aria-pressed={mine}
        onClick={() => {
          toggle(message.recordId, LIKE)
          onActivity?.()
          onLiked?.(authorIdOf(message))
        }}
      >
        {mine ? '♥' : '♡'} {mine ? 'Liked' : 'Like'} · {count}
      </button>
    )
  }

  const replies = useMemo(
    () =>
      messages
        .filter((message) => message.data.parentMessageId === postId && !message.data.deleted)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [messages, postId],
  )

  async function publishPost() {
    const content = composePost(title, body)
    if (!content || sending) return
    setSending(true)
    try {
      const id = await send(content)
      onActivity?.()
      setTitle('')
      setBody('')
      setComposing(false)
      if (id) onOpenPost(id)
    } finally {
      setSending(false)
    }
  }

  async function publishReply() {
    const content = reply.trim()
    if (!content || !postId || sending) return
    setSending(true)
    try {
      await send(content, postId)
      onActivity?.()
      setReply('')
    } finally {
      setSending(false)
    }
  }

  if (status === 'loading') {
    return <p className="px-5 py-8 text-sm text-muted-foreground">Loading posts…</p>
  }
  if (status === 'error') {
    return <p className="px-5 py-8 text-sm">This forum did not load. Check the connection and try again.</p>
  }

  if (postId) {
    if (!openPost || openPost.data.deleted || openPost.data.parentMessageId) {
      return (
        <div className="px-5 py-8">
          <button type="button" className="text-sm underline underline-offset-4" onClick={() => onOpenPost(null)}>
            ← All posts
          </button>
          <p className="mt-4">That post is no longer in this forum.</p>
        </div>
      )
    }
    const post = splitPost(openPost.data.content)
    const mine = user?.id === authorIdOf(openPost)
    return (
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <button type="button" className="text-sm underline underline-offset-4" onClick={() => onOpenPost(null)}>
          ← All posts
        </button>
        <article className="mt-4 border-b border-border pb-5">
          <h2 className="display text-3xl leading-tight">{post.title}</h2>
          <p className="mt-2 text-xs text-muted-foreground">
            {author(openPost)} · {when(openPost.createdAt)}
            {openPost.data.edited ? ' · edited' : ''}
          </p>
          {post.body && <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{post.body}</p>}
          <div className="mt-3 flex items-center gap-4">
            {likeButton(openPost)}
            {mine && (
              <button
                type="button"
                className="text-xs text-muted-foreground underline underline-offset-4"
                onClick={() => {
                  remove(openPost.recordId)
                  onOpenPost(null)
                }}
              >
                Remove this post
              </button>
            )}
          </div>
        </article>

        <h3 className="mt-5 text-xs uppercase tracking-widest text-muted-foreground">
          {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
        </h3>
        <ul className="mt-2">
          {replies.map((message) => {
            const ownReply = user?.id === authorIdOf(message)
            return (
              <li key={message.recordId} className="border-b border-border py-3">
                <p className="text-xs text-muted-foreground">
                  {author(message)} · {when(message.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{message.data.content}</p>
                <div className="mt-2 flex items-center gap-4">
                  {likeButton(message)}
                  {ownReply && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline underline-offset-4"
                      onClick={() => remove(message.recordId)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        {canWrite ? (
          <form
            className="mt-5"
            onSubmit={(event) => {
              event.preventDefault()
              void publishReply()
            }}
          >
            <label className="block text-sm" htmlFor="forum-reply">
              Reply
            </label>
            <textarea
              id="forum-reply"
              className="mt-1 min-h-24 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              value={reply}
              maxLength={2000}
              placeholder="Write a public reply"
              onChange={(event) => setReply(event.target.value)}
            />
            <button
              type="submit"
              className="mt-3 bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
              disabled={sending || !reply.trim()}
            >
              {sending ? 'Posting…' : 'Reply'}
            </button>
          </form>
        ) : (
          <p className="mt-5 text-sm">
            <button type="button" className="underline underline-offset-4" onClick={onSignIn}>
              Sign in to reply
            </button>
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 py-5">
      {canWrite ? (
        composing ? (
          <form
            className="mb-6 border-b border-border pb-5"
            onSubmit={(event) => {
              event.preventDefault()
              void publishPost()
            }}
          >
            <label className="block text-sm" htmlFor="forum-title">
              Title
            </label>
            <input
              id="forum-title"
              className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              value={title}
              maxLength={140}
              placeholder="What should the neighborhood talk about?"
              onChange={(event) => setTitle(event.target.value)}
            />
            <label className="mt-3 block text-sm" htmlFor="forum-body">
              Post
            </label>
            <textarea
              id="forum-body"
              className="mt-1 min-h-28 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              value={body}
              maxLength={4000}
              placeholder="The detail. This stays public in this neighborhood."
              onChange={(event) => setBody(event.target.value)}
            />
            <div className="mt-3 flex gap-3">
              <button
                type="submit"
                className="bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
                disabled={sending || !title.trim()}
              >
                {sending ? 'Posting…' : 'Post'}
              </button>
              <button type="button" className="text-sm underline underline-offset-4" onClick={() => setComposing(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="mb-5 text-sm underline underline-offset-4" onClick={() => setComposing(true)}>
            New post
          </button>
        )
      ) : (
        <p className="mb-5 text-sm text-muted-foreground">
          Posts are public.{' '}
          <button type="button" className="underline underline-offset-4" onClick={onSignIn}>
            Sign in to post
          </button>
        </p>
      )}

      {posts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No posts in this neighborhood yet.</p>
      ) : (
        <ul>
          {posts.map((message) => {
            const post = splitPost(message.data.content)
            const count = replyCount.get(message.recordId) ?? 0
            const likes = likesOf(message.recordId).count
            return (
              <li key={message.recordId} className="border-b border-border">
                <button type="button" className="w-full py-4 text-left" onClick={() => onOpenPost(message.recordId)}>
                  <span className="display block text-2xl leading-tight">{post.title}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {author(message)} · {when(message.createdAt)} · {count}{' '}
                    {count === 1 ? 'reply' : 'replies'} · {likes} {likes === 1 ? 'like' : 'likes'}
                  </span>
                  {post.body && (
                    <span className="mt-2 block line-clamp-2 text-sm text-muted-foreground">{post.body}</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
