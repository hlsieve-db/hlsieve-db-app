import { afterEach, describe, expect, it } from 'vitest'

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
