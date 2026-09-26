/**
 * Local preview before a DeepSpace account is registered.
 * `npx deepspace dev start` is the real runtime once `auth login` has run.
 * This config only exists so the atlas and /api/brief can be served without
 * an app id. It does not register or deploy the app.
 */
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import generouted from '@generouted/react-router/plugin'
import { cloudflare } from '@cloudflare/vite-plugin'

const previewAppId = 'app_0123456789ABCDEFGHJKMNPQRS'

export default defineConfig({
  plugins: [react(), generouted(), cloudflare()],
  define: {
    __DEEPSPACE_APP_ID__: JSON.stringify(previewAppId),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 44731,
    strictPort: true,
  },
})
