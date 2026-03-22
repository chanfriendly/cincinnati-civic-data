import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Load ALL env vars (not just VITE_ prefixed ones) so we can use
  // sensitive keys in the server-side proxy without bundling them.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        // ── OpenRouter AI proxy ──────────────────────────────────────────────
        // The Authorization header is added here — never sent to the browser.
        // In production, the Cloudflare Worker handles this instead.
        '/api/openrouter': {
          target: 'https://openrouter.ai',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/openrouter/, '/api'),
          headers: {
            Authorization: `Bearer ${env.OPENROUTER_API_KEY ?? ''}`,
            'HTTP-Referer': 'http://localhost:5173',
            'X-Title': 'Cincinnati Civic Platform (dev)',
          },
        },

        // ── US Census API proxy ───────────────────────────────────────────────
        // Appends the Census key via configure hook (searchParam injection).
        // In production, the Cloudflare Worker handles this.
        '/api/census': {
          target: 'https://api.census.gov',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/census/, '/data'),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              const url = new URL('https://api.census.gov' + proxyReq.path)
              url.searchParams.set('key', env.CENSUS_API_KEY ?? '')
              proxyReq.path = url.pathname + url.search
            })
          },
        },
      },
    },
  }
})
