import { createContext } from 'react'

import type { AuthActionResult } from './authSource'
import type { AuthState } from './authState'

export type AuthActions = {
  signInWithGoogle: () => Promise<AuthActionResult>
  sendMagicLink: (email: string) => Promise<AuthActionResult>
  signOut: () => Promise<AuthActionResult>
}

export type AuthContextValue = AuthActions & {
  state: AuthState
  /** False when Cloud Sync is not configured, so no account UI should act. */
  isCloudSyncAvailable: boolean
  /** False until a deployment has its own SMTP for the email login link. */
  isEmailSignInAvailable: boolean
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
)
