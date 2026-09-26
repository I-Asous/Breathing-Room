/**
 * One public forum room. The parent must have a definite height.
 * Messages live in their own record room, keyed by the channel.
 */

import { useEffect, useRef } from 'react'
import { RecordScope, useReadReceipts, useUser, isWriterRole } from 'deepspace'
import type { CollectionSchema } from 'deepspace/schema'
import { messagingSchemas } from '@/schemas/messaging-schema'
import { ChatHeader } from '@/components/messaging/chat/ChatHeader'
import { MessageList } from '@/components/messaging/chat/MessageList'
import { useChatChannel } from '@/components/messaging/hooks/useChatChannel'

interface ChatPageProps {
  schemas?: CollectionSchema[]
  channelName: string
  description: string
  className?: string
}

export default function ChatPage({
  schemas = messagingSchemas,
  channelName,
  description,
  className,
}: ChatPageProps) {
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
      <div
        data-testid="chat-page-loading"
        className={`flex h-full items-center justify-center ${className ?? ''}`}
      >
        <p className="text-sm text-muted-foreground">Opening this forum…</p>
      </div>
    )
  }

  if (!channelId) {
    return (
      <div className={`flex h-full flex-col ${className ?? ''}`} data-testid="chat-page">
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <div>
            <p>This forum has not been opened yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in to start it. Anyone can read it after that.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex h-full flex-col ${className ?? ''}`} data-testid="chat-page">
      <ChatHeader channelId={channelId} />
      <RecordScope roomId={`chat:${channelId}`} schemas={schemas}>
        <MessageList channelId={channelId} />
      </RecordScope>
    </div>
  )
}
