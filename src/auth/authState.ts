import {
  ANONYMOUS_LOCAL_DATA_NAMESPACE,
  userLocalDataNamespace,
  type LocalDataNamespace,
} from '../domain/storage/localDataNamespace'
import type { AuthUser } from './authSource'

export type AuthState =
  /** Cloud Sync is configured and the session is still being restored. */
  | { status: 'loading' }
  /** No account, either signed out or Cloud Sync not configured at all. */
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: AuthUser }

/**
 * The single place an auth state becomes a local data namespace. Nothing in
 * the auth layer builds a database name itself.
 */
export function namespaceForAuthState(state: AuthState): LocalDataNamespace {
  return state.status === 'authenticated'
    ? userLocalDataNamespace(state.user.id)
    : ANONYMOUS_LOCAL_DATA_NAMESPACE
}

/**
 * Identifies the namespace as a plain string, for use as a React key so a
 * switch between accounts remounts rather than reusing loaded state.
 */
export function namespaceKey(namespace: LocalDataNamespace): string {
  return namespace.kind === 'anonymous'
    ? 'anonymous'
    : `user:${namespace.userId}`
}
