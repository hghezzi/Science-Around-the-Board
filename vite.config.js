import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'

// Content-Security-Policy for the built pages. GitHub Pages can't send headers, so it is a
// <meta> tag (frame-ancestors can't be set this way). Dev builds skip it: Vite's dev server
// needs inline scripts. Keep it in step with what the pages load:
//   - scripts: our own bundle, plus Google Analytics after opt-in (src/consent.js);
//   - connect: question files and image folders can live on any https host (?deck=, ?images=),
//     results go to the instructor's Apps Script, and analytics beacons go to Google;
//   - online play (only when chosen): the PeerJS signalling service over wss://0.peerjs.com;
//     the game data itself goes device to device (WebRTC, which CSP doesn't govern);
//   - styles: MUI/Emotion inject <style> tags, so 'unsafe-inline' is needed for styles only;
//   - workers: the service worker, and canvas-confetti's blob: worker.
const CSP = {
  app: [
    "default-src 'self'",
    "script-src 'self' https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss://0.peerjs.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ],
  encryptor: [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ],
}

function contentSecurityPolicy() {
  return {
    name: 'sab-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const policy = ctx.filename.endsWith('encryptor.html') ? CSP.encryptor : CSP.app
        const meta = `<meta http-equiv="Content-Security-Policy" content="${policy.join('; ')}" />`
        return html.replace(/<meta charset="UTF-8" \/>/i, (m) => `${m}\n    ${meta}`)
      },
    },
  }
}

// The site is served from https://hghezzi.github.io/Science-Around-the-Board/
export default defineConfig({
  base: '/Science-Around-the-Board/',
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        encryptor: fileURLToPath(new URL('./encryptor.html', import.meta.url)),
      },
      output: {
        // React + MUI change rarely: a separate file stays cached across most deploys.
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|scheduler|@mui|@emotion|@babel\/runtime|react-transition-group|@popperjs|stylis|hoist-non-react-statics|react-is|prop-types|clsx)\//.test(id)) return 'vendor'
        },
      },
    },
  },
  plugins: [
    react(),
    contentSecurityPolicy(),
    // Installable app that works offline after the first visit. A new deploy installs in the
    // background and takes over at once; src/pwa.js reloads an idle start page or shows a
    // "new version" notice (emergency off switch: selfDestroying: true).
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registered from src/pwa.js
      includeManifestIcons: false, // already precached by globPatterns
      manifest: {
        id: '/Science-Around-the-Board/',
        name: 'Science Around the Board',
        short_name: 'SAB',
        description: 'A board-game review session for any course.',
        lang: 'en',
        start_url: '/Science-Around-the-Board/',
        scope: '/Science-Around-the-Board/',
        display: 'standalone',
        background_color: '#eef2f6',
        theme_color: '#2563eb',
        categories: ['education', 'games'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,jpeg,woff2,tsv}'],
        // Not precached: the guide and PDFs (large, online reading), the skill zip, the link
        // preview image, and font subsets for non-Latin scripts (cached on first use below).
        globIgnores: ['guide/**', 'archive/**', '**/*.pdf', 'downloads/**', 'og-image.png', '404.html',
          'assets/*-{cyrillic,cyrillic-ext,greek,greek-ext,hebrew,math,symbols,vietnamese}-*.woff2'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/\/guide\//, /\.html$/, /\.pdf$/, /\/downloads\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/assets\/.+\.woff2?$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'sab-fonts', expiration: { maxEntries: 60 } },
          },
        ],
      },
    }),
  ],
  // Only the project's own tests (not copies under .claude/worktrees).
  test: { include: ['tests/**/*.test.js'] },
})
