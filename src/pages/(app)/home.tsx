import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AuthOverlay, useAuthProfileReady } from 'deepspace'
import NeighborhoodForum from '@/components/messaging/NeighborhoodForum'
import { useForumTokens } from '@/components/messaging/hooks/useForumTokens'
import { HOW_TOKENS_WORK, TOKEN_RATES, type TokenTally } from '@/lib/forum-tokens'
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

function TokenPill({
  signedIn,
  tally,
  onSignIn,
}: {
  signedIn: boolean
  tally: TokenTally | null
  onSignIn: () => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !box.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const likesToNext = tally ? TOKEN_RATES.likesPerToken - (tally.likesReceived % TOKEN_RATES.likesPerToken) : null

  return (
    <div ref={box} className="relative shrink-0 self-start">
      <div className="flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-3.5 pr-1.5">
        {signedIn ? (
          <span className="text-sm font-medium" aria-live="polite">
            <span className="text-primary">◆</span> {tally ? tally.total : '–'} {tally?.total === 1 ? 'token' : 'tokens'}
          </span>
        ) : (
          <button type="button" className="text-sm hover:underline underline-offset-4" onClick={onSignIn}>
            <span className="text-primary">◆</span> Sign in to earn tokens
          </button>
        )}
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded-full text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="How tokens work"
          aria-expanded={open}
          aria-controls="token-info"
          onClick={() => setOpen((value) => !value)}
        >
          ⓘ
        </button>
      </div>
      {open && (
        <div
          id="token-info"
          role="dialog"
          aria-label="How tokens work"
          className="absolute left-0 z-20 mt-2 w-64 rounded-lg border border-border bg-card p-4 text-sm shadow-lg sm:left-auto sm:right-0"
        >
          <p className="font-medium">How tokens work</p>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {HOW_TOKENS_WORK.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {signedIn && tally && (
            <>
              <p className="mt-3 font-medium">Yours so far</p>
              <p className="mt-1 text-muted-foreground">
                {tally.posts} {tally.posts === 1 ? 'post' : 'posts'} · {tally.replies}{' '}
                {tally.replies === 1 ? 'reply' : 'replies'} · {tally.likesReceived}{' '}
                {tally.likesReceived === 1 ? 'like' : 'likes'} received
              </p>
              {likesToNext === 1 && <p className="mt-1 text-muted-foreground">One more like earns your next token.</p>}
            </>
          )}
          <p className="mt-3 text-xs text-muted-foreground">Tokens thank you for contributing. They have no cash value.</p>
        </div>
      )}
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
