import type { SupabaseClient } from '@supabase/supabase-js'

import { getSupabaseClient } from '../lib/supabaseClient'

/**
 * The only thing the app needs from an auth provider: who is signed in, and a
 * way to hear about it changing. Keeping it this small lets the tests supply a
 * fake instead of reaching the network, and keeps the Supabase SDK out of the
 * rest of the codebase.
 */
export type AuthUser = { id: string }

export type AuthSource = {
  /**
   * The user held by the stored session, read without contacting the server.
   * This decides which local database to open, so it must keep working while
   * offline or while the project is unreachable.
   */
  getSessionUser: () => Promise<AuthUser | undefined>
  /** Returns an unsubscribe function. */
  subscribe: (listener: (user: AuthUser | undefined) => void) => () => void
  signOut: () => Promise<void>
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
      const id = data.session?.user.id
      return id ? { id } : undefined
    },
    subscribe(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        // The SDK warns against awaiting other Supabase calls inside this
        // callback, so it only hands the id to React and returns.
        const id = session?.user.id
        listener(id ? { id } : undefined)
      })
      return () => data.subscription.unsubscribe()
    },
    async signOut() {
      await client.auth.signOut()
    },
  }
}
