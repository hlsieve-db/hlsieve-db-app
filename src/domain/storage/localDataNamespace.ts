import { DB_NAME } from '../decks/constants'

/**
 * Which set of browser-local data a persistence adapter should read and write.
 *
 * Separating accounts by database name keeps one account's cached data from
 * being displayed under another after a switch. It is not a security boundary:
 * anything running on this origin can still open every database.
 */
export type LocalDataNamespace =
  { kind: 'anonymous' } | { kind: 'user'; userId: string }

export const ANONYMOUS_LOCAL_DATA_NAMESPACE: LocalDataNamespace = {
  kind: 'anonymous',
}

export const USER_ID_MAX_LENGTH = 128

/** Matches a Supabase user id, and anything else safe to read in devtools. */
const SAFE_USER_ID = /^[A-Za-z0-9_-]+$/

function assertUserId(userId: string): string {
  if (userId.length > USER_ID_MAX_LENGTH) {
    throw new Error('User id is too long for a local data namespace.')
  }
  if (!SAFE_USER_ID.test(userId)) {
    throw new Error(
      'User id must be non-empty and contain only letters, digits, "-" or "_".',
    )
  }
  return userId
}

export function userLocalDataNamespace(userId: string): LocalDataNamespace {
  return { kind: 'user', userId: assertUserId(userId) }
}

/**
 * The single place a database name is derived. The anonymous namespace keeps
 * the original name so existing visitors read the data they already have.
 */
export function indexedDbNameForNamespace(
  namespace: LocalDataNamespace,
): string {
  return namespace.kind === 'anonymous'
    ? DB_NAME
    : `${DB_NAME}--${assertUserId(namespace.userId)}`
}
