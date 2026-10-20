import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Installable PWA (spec v2, sections 4 and 13): the whole app, including the
 * lazily loaded report reader and /how-it-works, is precached, so everything
 * works offline once it has loaded once. Updates install in the background.
 */
const pwa = VitePWA({
  registerType: 'autoUpdate',
  injectRegister: false,
  includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
  manifest: {
    name: 'Sahi Daam',
    short_name: 'Sahi Daam',
    description: 'See what you actually keep on every Meesho order, and what price to charge next.',
    lang: 'en',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    theme_color: '#5B1A46',
    background_color: '#ffffff',
    categories: ['business', 'finance', 'productivity'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    // woff2 only: every browser that runs the app reads it, and it halves the font download.
    globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/rest\//],
    maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
    cleanupOutdatedCaches: true,
  },
})

export default defineConfig({
  // The service worker is a build artefact; tests don't need it.
  plugins: process.env.VITEST ? [react()] : [react(), pwa],
  test: {
    globals: true,
    // The engine is pure, framework-free TypeScript (spec section 3), so the
    // tests need no DOM. Screen tests opt into jsdom per file.
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    // Fixture parsing and jsdom flows are slow when every file runs in parallel.
    testTimeout: 30_000,
  },
})
