import { createRoot } from 'react-dom/client'
// Route-based code splitting keeps authenticated/collaborative pages out of
// the initial bundle for a public top-level route such as `/`.
import { routes } from '@generouted/react-router/lazy'
import { createElement } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { HydrateFallback } from './pages/_app'
import { installStaleChunkRecovery } from './stale-chunk-recovery'
import './styles.css'

// Generouted does not copy a root HydrateFallback onto the route object.
// Lazy pages then warn and render nothing while the first route module loads.
const root = routes[0]
if (root) root.hydrateFallbackElement = createElement(HydrateFallback)

const router = createBrowserRouter(routes)
installStaleChunkRecovery(router)

createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />)
