import {
  ANONYMOUS_LOCAL_DATA_NAMESPACE,
  type LocalDataNamespace,
} from '../storage/localDataNamespace'

/**
 * Whether this device has already offered its folders and tags to the account.
 *
 * An account that turned Cloud Sync on before folders existed never gets the
 * moment where the first upload would happen, so the app looks for that work on
 * its own. This mark is what keeps it from looking every time: it is an
 * optimisation, not the safety rule.
 *
 * The safety rule is the account's own row count. If this mark is lost — cleared
 * site data, a different browser profile — the check runs again, finds rows, and
 * uploads nothing. Losing the mark therefore costs three reads, not a second
 * upload.
 */

export const DECK_ORGANIZATION_UPLOAD_STATE_VERSION = 1

export const DECK_ORGANIZATION_UPLOAD_STATE_STORAGE_KEY =
  'hlsieve:cloud-organization-uploaded'

type StoredState = { version: 1; at: string }

type ReadableStorage = Pick<Storage, 'getItem'>
type WritableStorage = Pick<Storage, 'getItem' | 'setItem'>

/**
 * Undefined for an anonymous visitor, following every other sync key: there is
 * no account to have uploaded anything to.
 */
export function deckOrganizationUploadStateStorageKey(
  namespace: LocalDataNamespace = ANONYMOUS_LOCAL_DATA_NAMESPACE,
): string | undefined {
  return namespace.kind === 'anonymous'
    ? undefined
    : `${DECK_ORGANIZATION_UPLOAD_STATE_STORAGE_KEY}--${namespace.userId}`
}

/** An unreadable or absent mark means the work has not been done. */
export function hasUploadedDeckOrganization(
  storage: ReadableStorage = window.localStorage,
  namespace?: LocalDataNamespace,
): boolean {
  const key = deckOrganizationUploadStateStorageKey(namespace)
  if (!key) return false
  try {
    const raw = storage.getItem(key)
    if (!raw) return false
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return false
    const { version, at } = value as Record<string, unknown>
    return (
      version === DECK_ORGANIZATION_UPLOAD_STATE_VERSION &&
      typeof at === 'string'
    )
  } catch {
    return false
  }
}

/**
 * Recorded once the account has been offered everything this device holds,
 * including where it held nothing: an empty collection has nothing to migrate,
 * and a folder made later is sent as an ordinary edit.
 */
export function recordUploadedDeckOrganization(
  at: string = new Date().toISOString(),
  storage: WritableStorage = window.localStorage,
  namespace?: LocalDataNamespace,
): void {
  const key = deckOrganizationUploadStateStorageKey(namespace)
  if (!key) return
  try {
    const stored: StoredState = {
      version: DECK_ORGANIZATION_UPLOAD_STATE_VERSION,
      at,
    }
    storage.setItem(key, JSON.stringify(stored))
  } catch {
    // Blocked storage costs three reads next time, nothing more.
  }
}
