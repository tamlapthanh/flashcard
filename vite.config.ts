import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import vuetify from 'vite-plugin-vuetify';

// GitHub Pages serves the site under /<repo>/ : set VITE_BASE=/flashcard/ when building there.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [
    vue(),
    vuetify({ autoImport: true }),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '単語帳',
        short_name: '単語帳',
        description: 'Study your LCT flashcards on your phone',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#5db82f',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
      },
      // The service worker caches the app shell only; card data is kept by the app itself (src/lib/apiCache.ts, Cache Storage).
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // The Japanese serif font comes from Google Fonts: keep it after the first visit so cards render offline.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 } }
          }
        ]
      }
    })
  ]
});
