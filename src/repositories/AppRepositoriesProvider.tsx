import { useMemo, type ReactNode } from 'react'

import { namespaceForAuthState } from '../auth/authState'
import { useAuth } from '../auth/useAuth'
import { createAppRepositories, type AppRepositories } from './appRepositories'
import { AppRepositoriesContext } from './appRepositoriesContext'

export type AppRepositoriesProviderProps = {
  children: ReactNode
  /** Supplied by tests that need a specific namespace or a fake IndexedDB. */
  repositories?: AppRepositories
}

export function AppRepositoriesProvider({
  children,
  repositories,
}: AppRepositoriesProviderProps) {
  const { state } = useAuth()
  const namespace = namespaceForAuthState(state)
  const userId = namespace.kind === 'user' ? namespace.userId : ''

  // Rebuilt only when the account changes, so an unrelated re-render does not
  // discard open database handles.
  const derived = useMemo(
    () => createAppRepositories(namespace),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [namespace.kind, userId],
  )

  return (
    <AppRepositoriesContext.Provider value={repositories ?? derived}>
      {children}
    </AppRepositoriesContext.Provider>
  )
}
