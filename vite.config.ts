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
    // Vite loads .env.local before the suite runs, so a developer who has
    // configured Cloud Sync locally would otherwise run a different suite than
    // CI: the client would build, and every test that expects the anonymous
    // path would fail. Blanking the values here makes "not configured" the
    // default for every test, and a test that wants the configured path opts
    // in with vi.stubEnv. Only the test process sees this; the dev server and
    // the production build read .env.local as before.
    env: {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_PUBLISHABLE_KEY: '',
      VITE_SUPABASE_EMAIL_SIGN_IN: '',
    },
  },
})
