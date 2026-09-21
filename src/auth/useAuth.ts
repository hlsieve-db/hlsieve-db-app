import { useContext } from 'react'

import { AuthContext, type AuthContextValue } from './authContextValue'

/**
 * Outside a provider the app is simply local-only, which is the same thing it
 * was before accounts existed. Tests that render a page on its own get this.
 */
const unavailable = async () => ({ ok: false, reason: 'unavailable' }) as const

const LOCAL_ONLY: AuthContextValue = {
  state: { status: 'anonymous' },
  isCloudSyncAvailable: false,
  isEmailSignInAvailable: false,
  signInWithGoogle: unavailable,
  sendMagicLink: unavailable,
  signOut: unavailable,
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext) ?? LOCAL_ONLY
}
