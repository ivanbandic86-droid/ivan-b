import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // Aplikacija se nakon prvog otvaranja sprema na mobitel i pokreće se i bez signala.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'KiperLog',
        short_name: 'KiperLog',
        description: 'Evidencija vožnji, goriva i rada strojeva',
        lang: 'hr',
        display: 'standalone',
        background_color: '#15171a',
        theme_color: '#15171a',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // Excel knjižnica (oko 1 MB) treba samo uredu, pa se ne sprema unaprijed na mobitele vozača.
      workbox: { navigateFallback: 'index.html', globPatterns: ['**/*.{js,css,html,svg,png}'], globIgnores: ['**/exceljs*'] },
    }),
  ],
  test: { include: ['src/**/*.test.js'] },
})
