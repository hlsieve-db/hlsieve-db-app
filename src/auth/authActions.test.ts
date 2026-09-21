import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { authRedirectUrl, AUTH_REDIRECT_PATH } from './authRedirect'
import { classifyAuthFailure, createSupabaseAuthSource } from './authSource'

function fakeClient(
  error: { status?: number; message?: string } | null = null,
) {
  const signInWithOAuth = vi.fn(async () => ({ data: {}, error }))
  const signInWithOtp = vi.fn(async () => ({ data: {}, error }))
  const signOut = vi.fn(async () => ({ error }))
  const client = {
    auth: {
      signInWithOAuth,
      signInWithOtp,
      signOut,
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
  }
  return {
    source: createSupabaseAuthSource(client as unknown as SupabaseClient)!,
    signInWithOAuth,
    signInWithOtp,
    signOut,
  }
}

describe('auth redirect url', () => {
  it('always points back into this origin', () => {
    expect(authRedirectUrl('https://hlsieve.com')).toBe(
      'https://hlsieve.com/account',
    )
    expect(authRedirectUrl('http://localhost:5173')).toBe(
      'http://localhost:5173/account',
    )
    expect(authRedirectUrl('https://abc123.hlsieve-db-app.pages.dev')).toBe(
      'https://abc123.hlsieve-db-app.pages.dev/account',
    )
  })

  it('carries no query or fragment for a provider to echo back', () => {
    const url = new URL(authRedirectUrl('https://hlsieve.com'))
    expect(url.pathname).toBe(AUTH_REDIRECT_PATH)
    expect(url.search).toBe('')
    expect(url.hash).toBe('')
  })
})

describe('sign-in actions', () => {
  it('asks Supabase for Google and sends it back to the account page', async () => {
    const fake = fakeClient()

    await expect(fake.source.signInWithGoogle()).resolves.toEqual({ ok: true })
    expect(fake.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: authRedirectUrl() },
    })
  })

  it('sends a magic link that may create a first-time account', async () => {
    const fake = fakeClient()

    await expect(
      fake.source.sendMagicLink('player@example.com'),
    ).resolves.toEqual({ ok: true })
    expect(fake.signInWithOtp).toHaveBeenCalledWith({
      email: 'player@example.com',
      options: {
        shouldCreateUser: true,
        emailRedirectTo: authRedirectUrl(),
      },
    })
  })

  it('signs out through the SDK', async () => {
    const fake = fakeClient()

    await expect(fake.source.signOut()).resolves.toEqual({ ok: true })
    expect(fake.signOut).toHaveBeenCalledTimes(1)
  })

  it('reports a failure as a reason rather than throwing', async () => {
    const fake = fakeClient({ status: 500, message: 'boom' })

    await expect(fake.source.signInWithGoogle()).resolves.toEqual({
      ok: false,
      reason: 'failed',
    })
    await expect(fake.source.sendMagicLink('a@b.co')).resolves.toEqual({
      ok: false,
      reason: 'failed',
    })
    await expect(fake.source.signOut()).resolves.toEqual({
      ok: false,
      reason: 'failed',
    })
  })
})

describe('failure classification', () => {
  it.each([
    [
      'rate limit',
      { status: 429, message: 'too many requests' },
      'rate-limited',
    ],
    [
      'bad email',
      { status: 400, message: 'Unable to validate email address' },
      'invalid-email',
    ],
    ['other 400', { status: 400, message: 'something else' }, 'failed'],
    ['server error', { status: 500, message: 'boom' }, 'failed'],
    ['no error object', null, 'failed'],
  ])('maps %s', (_label, error, expected) => {
    expect(classifyAuthFailure(error)).toBe(expected)
  })
})
