/**
 * Dynamic app boundary — the auth + realtime data layer.
 *
 * `(app)` is a Generouted route group: the parentheses mean it does NOT appear
 * in the URL, so (app)/home.tsx is served at /home. Every page under this
 * folder is wrapped in the DeepSpace providers below, so it may call `useAuth`,
 * `useQuery`, `useMutations`, presence/Yjs hooks, etc.
 *
 * Pages OUTSIDE this folder (top level of src/pages/) get none of this — they
 * render as static pages with no auth fetch and no records WebSocket. Move a
 * page in or out of (app)/ to flip it between dynamic and static. Require
 * sign-in on top of the data layer by nesting under (app)/(protected)/.
 *
 * This is where the app chrome (Navigation) lives, so static pages can present
 * their own layout without inheriting it.
 */

import { Suspense, useEffect, useState, type ReactNode } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { DeepSpaceAuthProvider, useAuthStatus } from 'deepspace'
import { RecordProvider, RecordScope } from 'deepspace'
import Navigation from '../../components/Navigation'
import { useToast } from '@/components/ui'
import { SCOPE_ID } from '../../constants'
import { schemas } from '../../schemas'

export default function AppLayout() {
  return (
    <DeepSpaceAuthProvider>
      <AuthBoot>
        <div className="flex h-screen flex-col bg-background overflow-hidden">
          <Navigation />
          <main className="flex-1 overflow-y-auto min-h-0">
            <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Loading...</div>}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </AuthBoot>
    </DeepSpaceAuthProvider>
  )
}

/**
 * Waits for auth to resolve, then mounts the data layer. Distinct from the SDK's `AuthGate`.
 *
 * While the initial session check is in flight, renders a fixed full-viewport
 * panel in the theme background — visually identical to the pre-JS page
 * (index.html primes <html> with the same color), so a cold load shows a
 * steady theme-colored screen until the shell appears. No spinner text: the
 * check is one round-trip, and in-flow placeholders read as a layout jump.
 */
function AuthBoot({ children }: { children: ReactNode }) {
  const { isLoaded, status } = useAuthStatus()
  const [stalled, setStalled] = useState(false)

  useEffect(() => {
    if (isLoaded) return
    const timer = window.setTimeout(() => setStalled(true), 2500)
    return () => window.clearTimeout(timer)
  }, [isLoaded])
  // Record writes (`create`/`put`/`remove`) are fire-and-forget — they resolve
  // before the server answers, so a denied or invalid write only surfaces
  // through onWriteError. Route rejections to toasts so they're never a
  // silent no-op. Keep this wiring when customizing the layout.
  const { error, warning } = useToast()

  if (!isLoaded && status !== 'error' && !stalled) {
    return <div aria-busy="true" className="fixed inset-0 bg-background" />
  }

  if (!isLoaded) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Forums</p>
        <h1 className="mt-2 text-4xl">Sign-in is not connected</h1>
        <p className="mt-4 text-muted-foreground">
          Shared forums need a DeepSpace session. The atlas on the front page does not. Run
          auth login, then deepspace dev start, and this desk will open.
        </p>
        <p className="mt-6">
          <Link to="/" className="underline underline-offset-4">
            Back to the atlas
          </Link>
        </p>
      </div>
    )
  }

  return (
    <RecordProvider
      allowAnonymous
      onWriteError={(e) =>
        e.kind === 'permission' ? warning(e.title, e.detail) : error(e.title, e.detail)
      }
    >
      <RecordScope roomId={SCOPE_ID} schemas={schemas}>
        {children}
      </RecordScope>
    </RecordProvider>
  )
}
