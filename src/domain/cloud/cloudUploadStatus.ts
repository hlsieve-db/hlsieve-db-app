import {
  ANONYMOUS_LOCAL_DATA_NAMESPACE,
  type LocalDataNamespace,
} from '../storage/localDataNamespace'

/**
 * When this device last got a deck change accepted by the account.
 *
 * Deliberately not called a sync time. Nothing is pulled down automatically,
 * so the account can hold changes this device has never seen, and a "last
 * synced" reading would be a promise the app cannot keep. What this records is
 * narrower and true: the last moment something went up successfully.
 *
 * Only that timestamp is stored. No deck, no name, no card number and no error
 * detail, so the file cannot grow into a second copy of the decks or into a log
 * of what the account refused.
 *
 * The count of unsent changes is not stored here. That lives in the pending
 * queue and is derived from it, so the two can never disagree.
 */

export type CloudUploadStatus = {
  version: 1
  /** ISO 8601, or null when nothing has ever reached the account. */
  lastUploadSuccessAt: string | null
}

export const CLOUD_UPLOAD_STATUS_VERSION = 1

export const CLOUD_UPLOAD_STATUS_STORAGE_KEY = 'hlsieve:cloud-sync-status'

export const DEFAULT_CLOUD_UPLOAD_STATUS: CloudUploadStatus = {
  version: CLOUD_UPLOAD_STATUS_VERSION,
  lastUploadSuccessAt: null,
}

type ReadableStorage = Pick<Storage, 'getItem'>
type WritableStorage = Pick<Storage, 'getItem' | 'setItem'>

/**
 * Undefined for an anonymous visitor, following the other cloud keys. There is
 * no unnamespaced key on purpose, so one account's upload time can never be
 * shown for another or while signed out.
 */
export function cloudUploadStatusStorageKey(
  namespace: LocalDataNamespace = ANONYMOUS_LOCAL_DATA_NAMESPACE,
): string | undefined {
  return namespace.kind === 'anonymous'
    ? undefined
    : `${CLOUD_UPLOAD_STATUS_STORAGE_KEY}--${namespace.userId}`
}

function parseTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null
  // A value that is not a date would be shown as "Invalid Date", so it is
  // treated as nothing having been sent rather than displayed.
  return Number.isFinite(Date.parse(value)) ? value : null
}

function parse(raw: string | null): CloudUploadStatus | undefined {
  if (!raw) return undefined
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return undefined
    const { version, lastUploadSuccessAt } = value as Record<string, unknown>
    if (version !== CLOUD_UPLOAD_STATUS_VERSION) return undefined
    return {
      version: CLOUD_UPLOAD_STATUS_VERSION,
      lastUploadSuccessAt: parseTimestamp(lastUploadSuccessAt),
    }
  } catch {
    return undefined
  }
}

/**
 * Anything unreadable reads as never having sent anything.
 *
 * That is the safe direction: claiming an upload that may not have happened
 * would tell the reporter their decks are in the account when they might not
 * be, while claiming none only costs a line of reassurance.
 */
export function readCloudUploadStatus(
  storage: ReadableStorage = window.localStorage,
  namespace?: LocalDataNamespace,
): CloudUploadStatus {
  const key = cloudUploadStatusStorageKey(namespace)
  if (!key) return DEFAULT_CLOUD_UPLOAD_STATUS
  try {
    return parse(storage.getItem(key)) ?? DEFAULT_CLOUD_UPLOAD_STATUS
  } catch {
    return DEFAULT_CLOUD_UPLOAD_STATUS
  }
}

/** A no-op for an anonymous visitor, who has no account to send anything to. */
export function writeCloudUploadStatus(
  status: CloudUploadStatus,
  storage: WritableStorage = window.localStorage,
  namespace?: LocalDataNamespace,
): void {
  const key = cloudUploadStatusStorageKey(namespace)
  if (!key) return
  try {
    storage.setItem(key, JSON.stringify(status))
  } catch {
    // Blocked storage only costs the line showing when this last worked.
  }
}

/**
 * Called after a deck change was accepted by the account, and only then.
 *
 * A local save that never reached the cloud, a refused send, a failed retry and
 * a restore all leave this alone: the first three sent nothing, and a restore
 * came down rather than going up.
 */
export function recordCloudUploadSuccess(
  at: string = new Date().toISOString(),
  storage: WritableStorage = window.localStorage,
  namespace?: LocalDataNamespace,
): void {
  writeCloudUploadStatus(
    { version: CLOUD_UPLOAD_STATUS_VERSION, lastUploadSuccessAt: at },
    storage,
    namespace,
  )
}
