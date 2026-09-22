import {
  ANONYMOUS_LOCAL_DATA_NAMESPACE,
  type LocalDataNamespace,
} from '../storage/localDataNamespace'

/**
 * Whether an account has opted into Cloud Sync.
 *
 * Only two states, because only two are real today: either the account has
 * chosen to sync or it has not. There is no separate "declined", since
 * declining and not having decided lead to the same place and a visitor who
 * changes their mind should not be treated differently from one who never
 * looked.
 */
export type CloudSyncStatus = 'not_started' | 'enabled'

/**
 * Stored with a version so a later shape, such as one carrying a sync cursor
 * or a paused flag, can be told apart from this one instead of being guessed
 * at. No cursor is stored yet.
 */
export type CloudSyncState = {
  version: 1
  status: CloudSyncStatus
}

export const CLOUD_SYNC_STATE_VERSION = 1

export const CLOUD_SYNC_STATE_STORAGE_KEY = 'hlsieve:cloud-sync'

export const DEFAULT_CLOUD_SYNC_STATE: CloudSyncState = {
  version: CLOUD_SYNC_STATE_VERSION,
  status: 'not_started',
}

/**
 * The single place this key is derived, following the selected deck key.
 *
 * Undefined for an anonymous visitor: syncing belongs to an account, and there
 * is no unnamespaced key on purpose, so one account's choice can never be read
 * as another's or as a signed out default.
 */
export function cloudSyncStateStorageKey(
  namespace: LocalDataNamespace = ANONYMOUS_LOCAL_DATA_NAMESPACE,
): string | undefined {
  return namespace.kind === 'anonymous'
    ? undefined
    : `${CLOUD_SYNC_STATE_STORAGE_KEY}--${namespace.userId}`
}

function parse(raw: string | null): CloudSyncState | undefined {
  if (!raw) return undefined
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return undefined
    const { version, status } = value as Record<string, unknown>
    if (version !== CLOUD_SYNC_STATE_VERSION) return undefined
    if (status !== 'not_started' && status !== 'enabled') return undefined
    return { version: CLOUD_SYNC_STATE_VERSION, status }
  } catch {
    return undefined
  }
}

/**
 * Anything unreadable falls back to not having started.
 *
 * That is the safe direction: the worst case is asking the visitor to decide
 * again, whereas guessing "enabled" from a damaged value would mean a later
 * phase syncing decks for someone who never agreed to it.
 */
export function readCloudSyncState(
  storage: Pick<Storage, 'getItem'> = window.localStorage,
  namespace?: LocalDataNamespace,
): CloudSyncState {
  const key = cloudSyncStateStorageKey(namespace)
  if (!key) return DEFAULT_CLOUD_SYNC_STATE
  try {
    return parse(storage.getItem(key)) ?? DEFAULT_CLOUD_SYNC_STATE
  } catch {
    return DEFAULT_CLOUD_SYNC_STATE
  }
}

/** A no-op for an anonymous visitor, who has no account to record it against. */
export function writeCloudSyncState(
  state: CloudSyncState,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
  namespace?: LocalDataNamespace,
): void {
  const key = cloudSyncStateStorageKey(namespace)
  if (!key) return
  try {
    storage.setItem(key, JSON.stringify(state))
  } catch {
    // Blocked storage only costs the choice being remembered next time.
  }
}

/**
 * Whether this account has agreed to sync, which is the one condition on every
 * save and delete reaching the cloud. Read at the moment of the write rather
 * than captured, so enabling takes effect at once and disabling stops the next
 * write.
 */
export function isCloudSyncEnabled(
  namespace?: LocalDataNamespace,
  storage?: Pick<Storage, 'getItem'>,
): boolean {
  return readCloudSyncState(storage, namespace).status === 'enabled'
}
