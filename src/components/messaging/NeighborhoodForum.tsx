/**
 * One neighborhood forum. Posts are public messages; replies hang off the post.
 */

import { RecordScope, isWriterRole, useReadReceipts, useUser } from 'deepspace'
import { useEffect, useRef } from 'react'
import type { CollectionSchema } from 'deepspace/schema'
import { messagingSchemas } from '@/schemas/messaging-schema'
import { ForumFeed } from '@/components/messaging/ForumFeed'
import { useChatChannel } from '@/components/messaging/hooks/useChatChannel'

export default function NeighborhoodForum({
  channelName,
  description,
  postId,
  onOpenPost,
  onSignIn,
  onActivity,
  className,
  schemas = messagingSchemas,
}: {
  channelName: string
  description: string
  postId: string | null
  onOpenPost: (id: string | null) => void
  onSignIn: () => void
  onActivity?: () => void
  className?: string
  schemas?: CollectionSchema[]
}) {
  const { channelId, status } = useChatChannel(channelName, description)
  const { markAsRead } = useReadReceipts()
  const { user } = useUser()
  const lastMarkedRef = useRef<string | null>(null)
  const canTrackReadState = isWriterRole(user?.role)

  useEffect(() => {
    if (!channelId || !canTrackReadState) return
    if (lastMarkedRef.current === channelId) return
    lastMarkedRef.current = channelId
    markAsRead(channelId)
  }, [canTrackReadState, channelId, markAsRead])

  if (status !== 'ready') {
    return (
      <div className={`flex h-full items-center justify-center ${className ?? ''}`}>
        <p className="text-sm text-muted-foreground">Opening this forum…</p>
      </div>
    )
  }

  if (!channelId) {
    return (
      <div className={`flex h-full items-center justify-center px-6 text-center ${className ?? ''}`}>
        <div>
          <p>This forum has not been opened yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to start the first post. Anyone can read it after that.</p>
          <button type="button" className="mt-3 text-sm underline underline-offset-4" onClick={onSignIn}>
            Sign in to post
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex h-full min-h-0 flex-col ${className ?? ''}`}>
      <RecordScope roomId={`chat:${channelId}`} schemas={schemas}>
        <ForumFeed channelId={channelId} postId={postId} onOpenPost={onOpenPost} onSignIn={onSignIn} onActivity={onActivity} />
      </RecordScope>
    </div>
  )
}
