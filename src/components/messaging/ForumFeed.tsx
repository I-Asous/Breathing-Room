import { useMemo, useState } from 'react'
import { isWriterRole, useMessages, useUser, useUserLookup, type Message, type RecordData } from 'deepspace'
import { composePost, splitPost } from '@/lib/forum-post'

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
}: {
  channelId: string
  postId: string | null
  onOpenPost: (id: string | null) => void
  onSignIn: () => void
}) {
  const { messages, status, send, softDelete } = useMessages(channelId)
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
            {getName(authorIdOf(openPost)) ?? 'Neighbor'} · {when(openPost.createdAt)}
            {openPost.data.edited ? ' · edited' : ''}
          </p>
          {post.body && <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{post.body}</p>}
          {mine && (
            <button
              type="button"
              className="mt-3 text-xs text-muted-foreground underline underline-offset-4"
              onClick={() => {
                softDelete(openPost.recordId)
                onOpenPost(null)
              }}
            >
              Remove this post
            </button>
          )}
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
                  {getName(authorIdOf(message)) ?? 'Neighbor'} · {when(message.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{message.data.content}</p>
                {ownReply && (
                  <button
                    type="button"
                    className="mt-2 text-xs text-muted-foreground underline underline-offset-4"
                    onClick={() => softDelete(message.recordId)}
                  >
                    Remove
                  </button>
                )}
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
            return (
              <li key={message.recordId} className="border-b border-border">
                <button type="button" className="w-full py-4 text-left" onClick={() => onOpenPost(message.recordId)}>
                  <span className="display block text-2xl leading-tight">{post.title}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {getName(authorIdOf(message)) ?? 'Neighbor'} · {when(message.createdAt)} · {count}{' '}
                    {count === 1 ? 'reply' : 'replies'}
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
