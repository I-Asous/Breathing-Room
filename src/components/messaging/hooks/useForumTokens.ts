import { useCallback, useEffect, useRef, useState } from 'react'
import { getAuthToken } from 'deepspace'
import type { TokenTally } from '@/lib/forum-tokens'

/** The signed-in neighbor's tokens across every forum, from GET /api/forum/tokens. */
export function useForumTokens(signedIn: boolean) {
  const [tally, setTally] = useState<TokenTally | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    if (!signedIn) {
      setTally(null)
      return
    }
    try {
      const token = await getAuthToken()
      if (!token) return
      const res = await fetch('/api/forum/tokens', { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      setTally((await res.json()) as TokenTally)
    } catch {
      // Keep the last total on a network blip.
    }
  }, [signedIn])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  /** Refetch shortly after a post, reply, or like, once the write has reached the forum room. */
  const refresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void load(), 1200)
  }, [load])

  return { tally, refresh }
}
