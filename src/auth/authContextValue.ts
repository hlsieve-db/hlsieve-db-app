import { createContext } from 'react'

import type { AuthState } from './authState'

export type AuthContextValue = {
  state: AuthState
  /** False when Cloud Sync is not configured, so no account UI should show. */
  isCloudSyncAvailable: boolean
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
)
