import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSupabaseAuthSource } from '../auth/authSource'
import {
  getSupabaseClient,
  isCloudSyncConfigured,
  resetSupabaseClientForTests,
} from './supabaseClient'

afterEach(resetSupabaseClientForTests)

describe('Supabase client when Cloud Sync is not configured', () => {
  // The test environment has no VITE_SUPABASE_* values, which is the same
  // situation as a deployment that never opted into Cloud Sync.
  it('reports that Cloud Sync is unavailable rather than throwing', () => {
    expect(() => getSupabaseClient()).not.toThrow()
    expect(getSupabaseClient()).toBeNull()
    expect(isCloudSyncConfigured()).toBe(false)
  })

  it('offers no auth source, so the app stays anonymous', () => {
    expect(createSupabaseAuthSource()).toBeNull()
  })

  it('does not build a second client on repeated calls', () => {
    expect(getSupabaseClient()).toBe(getSupabaseClient())
  })
})

// Without this the suite is a different suite on a machine that has Cloud Sync
// configured locally: .env.local would build a real client and every test below
// that expects the anonymous path would fail. The blanking lives in
// vite.config.ts, and this locks it in so removing it fails here rather than
// only on a developer's machine.
describe('test environment isolation', () => {
  it.each([
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'VITE_SUPABASE_EMAIL_SIGN_IN',
  ])('does not inherit %s from the developer machine', (key) => {
    expect(import.meta.env[key]).toBeFalsy()
  })

  it('restores the unconfigured default after a stub is removed', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.invalid')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
    resetSupabaseClientForTests()
    expect(isCloudSyncConfigured()).toBe(true)

    vi.unstubAllEnvs()
    resetSupabaseClientForTests()
    // Restoring must land on the blanked value, not on whatever .env.local has,
    // or one configured test would leak into every test that follows it.
    expect(isCloudSyncConfigured()).toBe(false)
  })
})

describe('Supabase key configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    resetSupabaseClientForTests()
  })

  it('builds a client from the url and publishable key', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.invalid')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')

    expect(getSupabaseClient()).not.toBeNull()
    expect(isCloudSyncConfigured()).toBe(true)
  })

  // Supabase is retiring the legacy anon and service-role pair in favour of
  // publishable/secret keys, and no deployment of this project is tied to the
  // old names, so the legacy one is simply not read.
  it('ignores a legacy anon key', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.invalid')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'legacy-anon-key')

    expect(getSupabaseClient()).toBeNull()
    expect(isCloudSyncConfigured()).toBe(false)
  })

  it.each([
    ['only a url', { VITE_SUPABASE_URL: 'https://example.invalid' }],
    ['only a publishable key', { VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_pub' }],
    [
      'blank values',
      { VITE_SUPABASE_URL: '   ', VITE_SUPABASE_PUBLISHABLE_KEY: '   ' },
    ],
  ])('stays unconfigured with %s', (_label, env) => {
    Object.entries(env).forEach(([key, value]) => vi.stubEnv(key, value))

    expect(getSupabaseClient()).toBeNull()
  })
})
