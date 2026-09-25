import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Two builds from one codebase:
 *   web    (`vite build`)                -> dist/app/     served at https://forgefit.vercel.app/app/
 *   native (`vite build --mode native`)  -> dist-native/  bundled inside the Android/iOS app
 * The landing page (site/) is copied to dist/ by scripts/assemble.mjs.
 */
export default defineConfig(({ mode }) => {
  const native = mode === 'native'
  const base = native ? '/' : '/app/'
  return {
    base,
    build: {
      outDir: native ? 'dist-native' : 'dist/app',
      emptyOutDir: true,
      target: 'es2021',
    },
    plugins: [
      react(),
      tailwindcss(),
      // The native app ships its files inside the APK, so it needs no service worker.
      ...(native ? [] : [VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: 'FORGE — Fitness & Indian Nutrition',
          short_name: 'FORGE',
          description: 'Workouts, every Indian dish, AI food camera — on your own Gemini keys.',
          theme_color: '#0E0D0C',
          background_color: '#0E0D0C',
          display: 'standalone',
          orientation: 'portrait',
          start_url: base,
          scope: base,
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          globIgnores: ['**/food-catalog.json', '**/exercises.json'],
          maximumFileSizeToCacheInBytes: 3_000_000,
          navigateFallback: `${base}index.html`,
          navigateFallbackAllowlist: [/^\/app\//],
          runtimeCaching: [
            {
              // Food + exercise data: fetched once, then served from cache — including offline.
              urlPattern: ({ url }) => /\/(food-catalog|exercises)\.json$/.test(url.pathname),
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'forge-data', expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 90 } },
            },
          ],
        },
      })]),
    ],
    test: { environment: 'happy-dom', include: ['src/**/*.test.ts'] },
  }
})
