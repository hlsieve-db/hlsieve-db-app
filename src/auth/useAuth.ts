import { useContext } from 'react'

import { AuthContext, type AuthContextValue } from './authContextValue'

/**
 * Outside a provider the app is simply local-only, which is the same thing it
 * was before accounts existed. Tests that render a page on its own get this.
 */
const LOCAL_ONLY: AuthContextValue = {
  state: { status: 'anonymous' },
  isCloudSyncAvailable: false,
  signOut: async () => undefined,
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext) ?? LOCAL_ONLY
}
