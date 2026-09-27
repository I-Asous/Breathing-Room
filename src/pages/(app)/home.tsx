import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AuthOverlay, useAuthProfileReady } from 'deepspace'
import NeighborhoodForum from '@/components/messaging/NeighborhoodForum'
import { BOROUGHS, CITY, neighborhoodById, type Borough } from '@/lib/metrics'

export default function HomePage() {
  const [params, setParams] = useSearchParams()
  const place = neighborhoodById(params.get('n'))
  const { isSignedIn } = useAuthProfileReady({ requireUser: true })
  const [showAuth, setShowAuth] = useState(false)

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
