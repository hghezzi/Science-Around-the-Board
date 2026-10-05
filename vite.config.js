import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// The site is served from https://hghezzi.github.io/Science-Around-the-Board/
export default defineConfig({
  base: '/Science-Around-the-Board/',
  plugins: [
    react(),
    // Installable app that works offline after the first visit. A new deploy is
    // picked up on the next visit (emergency off switch: selfDestroying: true).
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeManifestIcons: false, // already precached by globPatterns
      manifest: {
        name: 'Science Around the Board',
        short_name: 'SAB',
        description: 'A board-game review session for any course.',
        start_url: '/Science-Around-the-Board/',
        scope: '/Science-Around-the-Board/',
        display: 'standalone',
        background_color: '#eef2f6',
        theme_color: '#2563eb',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,jpeg,woff2,tsv}'],
        globIgnores: ['guide/**', 'archive/**', '**/*.pdf', 'downloads/**'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/\/guide\//, /\.html$/, /\.pdf$/, /\/downloads\//],
      },
    }),
  ],
})
