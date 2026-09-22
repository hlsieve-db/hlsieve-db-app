import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CloudDeckRepository } from '../cloud/cloudDeckRepository'
import { resetSupabaseClientForTests } from '../lib/supabaseClient'
import {
  ANONYMOUS_LOCAL_DATA_NAMESPACE,
  userLocalDataNamespace,
} from '../domain/storage/localDataNamespace'
import { createAppRepositories } from './appRepositories'

afterEach(() => {
  vi.unstubAllEnvs()
  resetSupabaseClientForTests()
})

const fakeCloud = {} as CloudDeckRepository

describe('cloud deck repository in the bundle', () => {
  // An anonymous visitor has no account to sync with, so there is nothing to
  // build even where Supabase is configured.
  it('is absent for an anonymous visitor even when configured', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.invalid')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')

    expect(
      createAppRepositories(ANONYMOUS_LOCAL_DATA_NAMESPACE).cloudDecks,
    ).toBeNull()
  })

  it('is present for an account when Supabase is configured', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.invalid')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')

    expect(
      createAppRepositories(userLocalDataNamespace('user-a')).cloudDecks,
    ).not.toBeNull()
  })

  // The test environment blanks the Supabase variables, which is also what a
  // deployment that never opted into Cloud Sync looks like.
  it('is absent for an account when Supabase is not configured', () => {
    expect(
      createAppRepositories(userLocalDataNamespace('user-a')).cloudDecks,
    ).toBeNull()
  })

  it('can be supplied directly, which is what tests do', () => {
    const repositories = createAppRepositories(
      userLocalDataNamespace('user-a'),
      undefined,
      fakeCloud,
    )

    expect(repositories.cloudDecks).toBe(fakeCloud)
  })

  it('treats an explicit null as no cloud, not as a request to build one', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.invalid')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')

    expect(
      createAppRepositories(userLocalDataNamespace('user-a'), undefined, null)
        .cloudDecks,
    ).toBeNull()
  })
})

describe('switching accounts', () => {
  // The bundle is rebuilt per namespace, so one account's repository is never
  // the object another account is holding.
  it('builds a separate bundle for each account', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.invalid')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')

    const a = createAppRepositories(userLocalDataNamespace('user-a'))
    const b = createAppRepositories(userLocalDataNamespace('user-b'))

    expect(a.namespace).not.toEqual(b.namespace)
    expect(a.decks).not.toBe(b.decks)
    expect(a.cloudDecks).not.toBe(b.cloudDecks)
  })

  it('drops the cloud repository on the way back to anonymous', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.invalid')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')

    const signedIn = createAppRepositories(userLocalDataNamespace('user-a'))
    const signedOut = createAppRepositories(ANONYMOUS_LOCAL_DATA_NAMESPACE)

    expect(signedIn.cloudDecks).not.toBeNull()
    expect(signedOut.cloudDecks).toBeNull()
  })
})

describe('the rest of the bundle', () => {
  // Adding an optional cloud repository must not change what was already there.
  it('still builds every browser-local store', () => {
    const repositories = createAppRepositories(ANONYMOUS_LOCAL_DATA_NAMESPACE)

    expect(Object.keys(repositories).sort()).toEqual([
      'cloudDecks',
      'decks',
      'favoriteCards',
      'namespace',
      'recentlyViewedCards',
      'savedSearchPresets',
      'tournamentReports',
    ])
    expect(repositories.decks).toBeDefined()
    expect(repositories.favoriteCards).toBeDefined()
    expect(repositories.savedSearchPresets).toBeDefined()
    expect(repositories.tournamentReports).toBeDefined()
    expect(repositories.recentlyViewedCards).toBeDefined()
  })
})
