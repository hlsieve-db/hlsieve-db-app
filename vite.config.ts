import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import siteConfig from './site.config.json' with { type: 'json' }

export default defineConfig({
  plugins: [
    {
      name: 'site-origin',
      transformIndexHtml: (html) =>
        html.replaceAll('__SITE_ORIGIN__', siteConfig.origin),
    },
    react(),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
