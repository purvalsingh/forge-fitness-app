import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // GitHub Pages serves a project site from a sub-path; other hosts pass '/'.
  base: process.env.PUBLIC_BASE ?? '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'FORGE',
        short_name: 'FORGE',
        description: 'Personal fitness operating system: training, nutrition, steps, goals.',
        theme_color: '#0C0709',
        background_color: '#0C0709',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['**/FORGE.apk', '**/food-catalog.json'],
        maximumFileSizeToCacheInBytes: 3_000_000,
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // 3 MB of food data: fetched once, then served from cache — including offline.
            urlPattern: ({ url }) => url.pathname === '/food-catalog.json',
            handler: 'CacheFirst',
            options: { cacheName: 'food-catalog', expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 90 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/rest/v1'),
            handler: 'NetworkFirst',
            options: { cacheName: 'supabase-api', networkTimeoutSeconds: 5 },
          },
        ],
      },
    }),
  ],
  test: { environment: 'happy-dom', include: ['src/**/*.test.ts'] },
} as any)
