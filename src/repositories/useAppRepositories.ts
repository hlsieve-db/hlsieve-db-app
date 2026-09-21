import { useContext } from 'react'

import { ANONYMOUS_LOCAL_DATA_NAMESPACE } from '../domain/storage/localDataNamespace'
import { createAppRepositories, type AppRepositories } from './appRepositories'
import { AppRepositoriesContext } from './appRepositoriesContext'

let anonymousFallback: AppRepositories | undefined

/**
 * Without a provider the app is local-only under the original database name,
 * which is what it did before accounts existed. Built once and reused so
 * unrelated components do not each open their own connection.
 */
function getAnonymousFallback(): AppRepositories {
  anonymousFallback ??= createAppRepositories(ANONYMOUS_LOCAL_DATA_NAMESPACE)
  return anonymousFallback
}

export function useAppRepositories(): AppRepositories {
  return useContext(AppRepositoriesContext) ?? getAnonymousFallback()
}
