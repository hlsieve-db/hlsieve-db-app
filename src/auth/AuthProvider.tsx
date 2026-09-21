import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { AuthContext, type AuthContextValue } from './authContextValue'
import { isEmailSignInEnabled } from '../lib/supabaseClient'
import {
  createSupabaseAuthSource,
  type AuthActionResult,
  type AuthSource,
} from './authSource'
import type { AuthState } from './authState'

export type AuthProviderProps = {
  children: ReactNode
  /** Supplied by tests; production resolves the Supabase source itself. */
  authSource?: AuthSource | null
}

export function AuthProvider({ children, authSource }: AuthProviderProps) {
  // Resolved once, so a re-render cannot build a second Supabase client and an
  // explicitly passed null keeps meaning "no cloud".
  const [source] = useState<AuthSource | null>(() =>
    authSource === undefined ? createSupabaseAuthSource() : authSource,
  )

  // Without a source there is nothing to wait for, so the app starts resolved
  // rather than showing a loading state it could never leave.
  const [state, setState] = useState<AuthState>(() =>
    source ? { status: 'loading' } : { status: 'anonymous' },
  )

  useEffect(() => {
    if (!source) return

    let active = true
    const apply = (user: { id: string } | undefined) => {
      if (!active) return
      setState(
        user ? { status: 'authenticated', user } : { status: 'anonymous' },
      )
    }

    // Subscribing before the first read means a sign-in that lands while it is
    // in flight is not missed.
    const unsubscribe = source.subscribe(apply)
    // A rejection here means the stored session could not be read at all, not
    // that the visitor is signed out, but anonymous is the only safe guess.
    void source.getSessionUser().then(apply, () => apply(undefined))

    return () => {
      active = false
      unsubscribe()
    }
  }, [source])

  const value = useMemo<AuthContextValue>(() => {
    // Without a configured project every action is a no-op that says so,
    // rather than a crash or a silent success.
    const unavailable = async (): Promise<AuthActionResult> => ({
      ok: false,
      reason: 'unavailable',
    })

    return {
      state,
      isCloudSyncAvailable: source !== null,
      isEmailSignInAvailable: source !== null && isEmailSignInEnabled(),
      signInWithGoogle: source ? source.signInWithGoogle : unavailable,
      sendMagicLink: source ? source.sendMagicLink : unavailable,
      signOut: source ? source.signOut : unavailable,
    }
  }, [source, state])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
