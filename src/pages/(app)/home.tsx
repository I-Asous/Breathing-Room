import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AuthOverlay, useAuthProfileReady } from 'deepspace'
import NeighborhoodForum from '@/components/messaging/NeighborhoodForum'
import { useForumTokens } from '@/components/messaging/hooks/useForumTokens'
import { TOKEN_RATES, formatTokens, type TokenTally } from '@/lib/forum-tokens'
import { BOROUGHS, CITY, neighborhoodById, type Borough } from '@/lib/metrics'

export default function HomePage() {
  const [params, setParams] = useSearchParams()
  const place = neighborhoodById(params.get('n'))
  const { isSignedIn } = useAuthProfileReady({ requireUser: true })
  const [showAuth, setShowAuth] = useState(false)
  const { tally, refresh } = useForumTokens(isSignedIn)

  function open(id: string) {
    const next = new URLSearchParams(params)
    next.set('n', id)
    next.delete('p')
    setParams(next, { replace: true })
  }

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <aside className="max-h-48 shrink-0 overflow-y-auto border-b border-border md:max-h-none md:w-60 md:border-b-0 md:border-r">
        <div className="px-4 py-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">42 forums</p>
          <p className="mt-1 text-sm text-muted-foreground">Public posts, then replies under each one.</p>
        </div>
        {BOROUGHS.map((borough) => (
          <BoroughList key={borough} borough={borough} activeId={place?.id ?? null} onOpen={open} />
        ))}
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-border px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                {place ? place.borough : 'Neighborhood forum'}
              </p>
              <h1 className="mt-1 text-3xl leading-none">{place ? place.name : 'Choose a neighborhood'}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Anyone can read. A signed-in neighbor can start a post, and others reply under it.
              </p>
              <p className="mt-2 text-sm">
                <Link to={place ? `/?n=${place.id}` : '/'} className="underline underline-offset-4">
                  Back to {place ? place.name : 'the atlas'}
                </Link>
                {!isSignedIn && (
                  <>
                    <span className="text-muted-foreground"> · </span>
                    <button type="button" className="underline underline-offset-4" onClick={() => setShowAuth(true)}>
                      Sign in to post
                    </button>
                  </>
                )}
              </p>
            </div>
            <TokenPill signedIn={isSignedIn} tally={tally} onSignIn={() => setShowAuth(true)} />
          </div>
        </header>
        <div className="min-h-0 flex-1">
          {place ? (
            <NeighborhoodForum
              key={place.id}
              channelName={place.name}
              description={`${place.borough} neighborhood forum`}
              postId={params.get('p')}
              onOpenPost={(id) => {
                const next = new URLSearchParams(params)
                if (id) next.set('p', id)
                else next.delete('p')
                setParams(next, { replace: true })
              }}
              onSignIn={() => setShowAuth(true)}
              onActivity={refresh}
              className="h-full"
            />
          ) : (
            <p className="px-5 py-8 text-muted-foreground">
              Pick a neighborhood. Its forum is separate from the other 41.
            </p>
          )}
        </div>
      </section>
      {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}
    </div>
  )
}

const HOW_TOKENS_WORK = `${TOKEN_RATES.post} per post or reply, ${TOKEN_RATES.likeReceived} when a neighbor likes yours. No cash value.`

function TokenPill({
  signedIn,
  tally,
  onSignIn,
}: {
  signedIn: boolean
  tally: TokenTally | null
  onSignIn: () => void
}) {
  if (!signedIn) {
    return (
      <button
        type="button"
        className="self-start rounded-full border border-border px-3 py-1.5 text-left text-sm hover:bg-muted"
        title={HOW_TOKENS_WORK}
        onClick={onSignIn}
      >
        ◆ Sign in to earn tokens
      </button>
    )
  }
  const breakdown = tally
    ? `${tally.posts} ${tally.posts === 1 ? 'post' : 'posts'} · ${tally.replies} ${
        tally.replies === 1 ? 'reply' : 'replies'
      } · ${tally.likesReceived} ${tally.likesReceived === 1 ? 'like' : 'likes'} received`
    : 'Counting…'
  return (
    <div className="shrink-0 self-start rounded-lg border border-border bg-card px-4 py-2.5 sm:text-right" title={HOW_TOKENS_WORK}>
      <p className="text-xs uppercase tracking-widest text-muted-foreground">Your tokens</p>
      <p className="display text-3xl leading-none" aria-live="polite">
        <span className="text-primary">◆</span> {tally ? formatTokens(tally.total) : '–'}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{breakdown}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{HOW_TOKENS_WORK}</p>
    </div>
  )
}

function BoroughList({
  borough,
  activeId,
  onOpen,
}: {
  borough: Borough
  activeId: string | null
  onOpen: (id: string) => void
}) {
  const rows = CITY.neighborhoods.filter((n) => n.borough === borough)
  return (
    <div className="px-4 pb-4">
      <h2 className="text-xs uppercase tracking-widest text-muted-foreground">{borough}</h2>
      <ul className="mt-1">
        {rows.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              className={`w-full py-1 text-left text-sm underline-offset-4 hover:underline ${
                n.id === activeId ? 'font-medium text-foreground' : 'text-muted-foreground'
              }`}
              aria-current={n.id === activeId ? 'page' : undefined}
              onClick={() => onOpen(n.id)}
            >
              {n.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
