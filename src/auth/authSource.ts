import type { SupabaseClient } from '@supabase/supabase-js'

import { getSupabaseClient } from '../lib/supabaseClient'
import { authRedirectUrl } from './authRedirect'

/**
 * The only things the app needs from an auth provider. Keeping it this small
 * lets the tests supply a fake instead of reaching the network, and keeps the
 * Supabase SDK out of the rest of the codebase.
 */
export type AuthUser = { id: string; email?: string }

/** Enough for the UI to choose a message without reading SDK internals. */
export type AuthFailureReason =
  'unavailable' | 'invalid-email' | 'rate-limited' | 'failed'

export type AuthActionResult =
  { ok: true } | { ok: false; reason: AuthFailureReason }

export type AuthSource = {
  /**
   * The user held by the stored session, read without contacting the server.
   * This decides which local database to open, so it must keep working while
   * offline or while the project is unreachable.
   */
  getSessionUser: () => Promise<AuthUser | undefined>
  /** Returns an unsubscribe function. */
  subscribe: (listener: (user: AuthUser | undefined) => void) => () => void
  signInWithGoogle: () => Promise<AuthActionResult>
  sendMagicLink: (email: string) => Promise<AuthActionResult>
  signOut: () => Promise<AuthActionResult>
}

type SupabaseFailure = { status?: number; message?: string } | null

/**
 * Sorts a provider error into the handful of cases the UI words differently.
 * The message itself is never shown, so nothing from the provider leaks into
 * the page.
 */
export function classifyAuthFailure(error: SupabaseFailure): AuthFailureReason {
  if (error?.status === 429) return 'rate-limited'
  if (error?.status === 400 && /email/i.test(error.message ?? '')) {
    return 'invalid-email'
  }
  return 'failed'
}

function userFromSession(
  session: { user: { id: string; email?: string } } | null | undefined,
): AuthUser | undefined {
  if (!session?.user.id) return undefined
  return { id: session.user.id, email: session.user.email }
}

/** Null when Cloud Sync is not configured, which means anonymous forever. */
export function createSupabaseAuthSource(
  client: SupabaseClient | null = getSupabaseClient(),
): AuthSource | null {
  if (!client) return null

  return {
    async getSessionUser() {
      // getSession reads the stored session; getUser would call the server and
      // would drop a signed-in visitor back to anonymous whenever the network
      // or the project is unavailable. Whether the token is still honoured is
      // decided by the database through RLS when a request is actually made.
      const { data } = await client.auth.getSession()
      return userFromSession(data.session)
    },
    subscribe(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        // The SDK warns against awaiting other Supabase calls inside this
        // callback, so it only hands the user to React and returns.
        listener(userFromSession(session))
      })
      return () => data.subscription.unsubscribe()
    },
    async signInWithGoogle() {
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: authRedirectUrl() },
      })
      return error
        ? { ok: false, reason: classifyAuthFailure(error) }
        : { ok: true }
    },
    async sendMagicLink(email) {
      const { error } = await client.auth.signInWithOtp({
        email,
        // A first-time address is welcome to create an account this way.
        options: { shouldCreateUser: true, emailRedirectTo: authRedirectUrl() },
      })
      return error
        ? { ok: false, reason: classifyAuthFailure(error) }
        : { ok: true }
    },
    async signOut() {
      const { error } = await client.auth.signOut()
      return error
        ? { ok: false, reason: classifyAuthFailure(error) }
        : { ok: true }
    },
  }
}
