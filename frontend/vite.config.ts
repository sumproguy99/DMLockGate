/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * The Laravel API. In development the Vite server proxies /api and /sanctum to it, so the app and
 * the API share one origin and the session cookie stays first-party. xfwd passes the visitor's
 * address on (X-Forwarded-For), which the API trusts only from this machine (TrustProxies).
 */
const apiTarget = process.env.LOCKGUARD_API_URL ?? 'http://127.0.0.1:8100'

const apiProxy = {
  '/api': { target: apiTarget, changeOrigin: false, xfwd: true },
  '/sanctum': { target: apiTarget, changeOrigin: false, xfwd: true },
}

/**
 * The public address(es) Nginx Proxy Manager forwards to the built app (vite preview, port 4173).
 * Only the built files are served there, never the dev server.
 */
const publicHosts = (process.env.LOCKGUARD_PUBLIC_HOSTS ?? 'lockguard.dmfmedia.net').split(',').map((host) => host.trim()).filter(Boolean)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: apiProxy,
  },
  preview: {
    host: process.env.LOCKGUARD_PREVIEW_HOST ?? '127.0.0.1',
    port: 4173,
    strictPort: true,
    allowedHosts: publicHosts,
    proxy: apiProxy,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
  },
})
