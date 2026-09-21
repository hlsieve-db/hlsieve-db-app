import type { ReactNode } from 'react'

import { useAuth } from './useAuth'

/**
 * Holds the app back until it is known which account's data to read, so a
 * signed-in visitor never sees the anonymous decks flash first. When Cloud
 * Sync is not configured the state is already resolved and nothing is held.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { state } = useAuth()

  if (state.status === 'loading') {
    return (
      <main id="main-content" className="status-message">
        <p role="status">読み込んでいます…</p>
      </main>
    )
  }

  return <>{children}</>
}
