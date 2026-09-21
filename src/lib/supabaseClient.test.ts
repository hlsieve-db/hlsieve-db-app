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
