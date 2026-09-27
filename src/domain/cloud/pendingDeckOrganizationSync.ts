import type { DeckId } from '../decks/types'
import type { DeckFolderId, DeckTagId } from '../deckOrganization/types'
import {
  ANONYMOUS_LOCAL_DATA_NAMESPACE,
  type LocalDataNamespace,
} from '../storage/localDataNamespace'

/**
 * Folder, tag and organization changes that were made locally but could not be
 * sent to the account.
 *
 * Three queues rather than one, following the deck and version queues, because
 * the key means something different in each: a folder or tag is keyed by its own
 * id, and an organization by the deck it describes. One queue would have to
 * carry the kind alongside every entry and would invite an id from one kind
 * being looked up as another.
 *
 * As with decks, only the intent is stored. A retried upsert reads the folder,
 * tag or organization from the local store again, so what reaches the account is
 * what the device holds now.
 */

export type PendingDeckOrganizationOperation = 'upsert' | 'tombstone'

export type PendingDeckOrganizationQueue<Key extends string = string> = Record<
  Key,
  PendingDeckOrganizationOperation
>

export const PENDING_DECK_ORGANIZATION_SYNC_VERSION = 1

export const PENDING_DECK_FOLDER_SYNC_STORAGE_KEY =
  'hlsieve:cloud-sync-pending-folders'
export const PENDING_DECK_TAG_SYNC_STORAGE_KEY =
  'hlsieve:cloud-sync-pending-tags'
export const PENDING_DECK_ORGANIZATION_SYNC_STORAGE_KEY =
  'hlsieve:cloud-sync-pending-organizations'

type StoredQueue = {
  version: 1
  operations: PendingDeckOrganizationQueue
}

type ReadableStorage = Pick<Storage, 'getItem'>
type WritableStorage = Pick<Storage, 'getItem' | 'setItem'>

/**
 * Undefined for an anonymous visitor, following every other sync key. There is
 * no unnamespaced key on purpose, so one account's unsent changes can never be
 * read as another's or retried while signed out.
 */
function storageKeyFor(
  base: string,
  namespace: LocalDataNamespace = ANONYMOUS_LOCAL_DATA_NAMESPACE,
): string | undefined {
  return namespace.kind === 'anonymous'
    ? undefined
    : `${base}--${namespace.userId}`
}

export function pendingDeckFolderSyncStorageKey(
  namespace?: LocalDataNamespace,
): string | undefined {
  return storageKeyFor(PENDING_DECK_FOLDER_SYNC_STORAGE_KEY, namespace)
}

export function pendingDeckTagSyncStorageKey(
  namespace?: LocalDataNamespace,
): string | undefined {
  return storageKeyFor(PENDING_DECK_TAG_SYNC_STORAGE_KEY, namespace)
}

export function pendingDeckOrganizationSyncStorageKey(
  namespace?: LocalDataNamespace,
): string | undefined {
  return storageKeyFor(PENDING_DECK_ORGANIZATION_SYNC_STORAGE_KEY, namespace)
}

function isOperation(
  value: unknown,
): value is PendingDeckOrganizationOperation {
  return value === 'upsert' || value === 'tombstone'
}

function parse(raw: string | null): PendingDeckOrganizationQueue | undefined {
  if (!raw) return undefined
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return undefined
    const { version, operations } = value as Record<string, unknown>
    if (version !== PENDING_DECK_ORGANIZATION_SYNC_VERSION) return undefined
    if (typeof operations !== 'object' || operations === null) return undefined
    const queue: PendingDeckOrganizationQueue = {}
    for (const [key, operation] of Object.entries(operations)) {
      // One bad entry is dropped rather than failing the whole queue: losing a
      // retry is recoverable by editing again, whereas discarding every other
      // unsent change is not.
      if (key && isOperation(operation)) queue[key] = operation
    }
    return queue
  } catch {
    return undefined
  }
}

/** An unreadable or absent queue is an empty one: nothing to retry. */
function read(
  base: string,
  storage: ReadableStorage,
  namespace?: LocalDataNamespace,
): PendingDeckOrganizationQueue {
  const key = storageKeyFor(base, namespace)
  if (!key) return {}
  try {
    return parse(storage.getItem(key)) ?? {}
  } catch {
    return {}
  }
}

/** A no-op for an anonymous visitor, who has no account to send anything to. */
function write(
  base: string,
  queue: PendingDeckOrganizationQueue,
  storage: WritableStorage,
  namespace?: LocalDataNamespace,
): void {
  const key = storageKeyFor(base, namespace)
  if (!key) return
  try {
    const stored: StoredQueue = {
      version: PENDING_DECK_ORGANIZATION_SYNC_VERSION,
      operations: queue,
    }
    storage.setItem(key, JSON.stringify(stored))
  } catch {
    // Blocked storage only costs the retry; the local change is already saved.
  }
}

/**
 * Records the latest intent for one id, replacing whatever was there.
 *
 * A tombstone recorded after a failed upsert wins, and an upsert recorded after
 * a failed tombstone wins, because the last thing the reporter did is the thing
 * the account should end up agreeing with.
 */
function record(
  base: string,
  key: string,
  operation: PendingDeckOrganizationOperation,
  storage: WritableStorage,
  namespace?: LocalDataNamespace,
): void {
  const queue = read(base, storage, namespace)
  write(base, { ...queue, [key]: operation }, storage, namespace)
}

/** Called when a send succeeds, including an ordinary save that was not a retry. */
function clear(
  base: string,
  key: string,
  storage: WritableStorage,
  namespace?: LocalDataNamespace,
): void {
  const queue = read(base, storage, namespace)
  if (!(key in queue)) return
  const next = { ...queue }
  delete next[key]
  write(base, next, storage, namespace)
}

export function readPendingDeckFolderSync(
  storage: ReadableStorage = window.localStorage,
  namespace?: LocalDataNamespace,
): PendingDeckOrganizationQueue<DeckFolderId> {
  return read(PENDING_DECK_FOLDER_SYNC_STORAGE_KEY, storage, namespace)
}

export function recordPendingDeckFolderSync(
  folderId: DeckFolderId,
  operation: PendingDeckOrganizationOperation,
  storage: WritableStorage = window.localStorage,
  namespace?: LocalDataNamespace,
): void {
  record(
    PENDING_DECK_FOLDER_SYNC_STORAGE_KEY,
    folderId,
    operation,
    storage,
    namespace,
  )
}

export function clearPendingDeckFolderSync(
  folderId: DeckFolderId,
  storage: WritableStorage = window.localStorage,
  namespace?: LocalDataNamespace,
): void {
  clear(PENDING_DECK_FOLDER_SYNC_STORAGE_KEY, folderId, storage, namespace)
}

export function readPendingDeckTagSync(
  storage: ReadableStorage = window.localStorage,
  namespace?: LocalDataNamespace,
): PendingDeckOrganizationQueue<DeckTagId> {
  return read(PENDING_DECK_TAG_SYNC_STORAGE_KEY, storage, namespace)
}

export function recordPendingDeckTagSync(
  tagId: DeckTagId,
  operation: PendingDeckOrganizationOperation,
  storage: WritableStorage = window.localStorage,
  namespace?: LocalDataNamespace,
): void {
  record(
    PENDING_DECK_TAG_SYNC_STORAGE_KEY,
    tagId,
    operation,
    storage,
    namespace,
  )
}

export function clearPendingDeckTagSync(
  tagId: DeckTagId,
  storage: WritableStorage = window.localStorage,
  namespace?: LocalDataNamespace,
): void {
  clear(PENDING_DECK_TAG_SYNC_STORAGE_KEY, tagId, storage, namespace)
}

export function readPendingDeckOrganizationSync(
  storage: ReadableStorage = window.localStorage,
  namespace?: LocalDataNamespace,
): PendingDeckOrganizationQueue<DeckId> {
  return read(PENDING_DECK_ORGANIZATION_SYNC_STORAGE_KEY, storage, namespace)
}

export function recordPendingDeckOrganizationSync(
  deckId: DeckId,
  operation: PendingDeckOrganizationOperation,
  storage: WritableStorage = window.localStorage,
  namespace?: LocalDataNamespace,
): void {
  record(
    PENDING_DECK_ORGANIZATION_SYNC_STORAGE_KEY,
    deckId,
    operation,
    storage,
    namespace,
  )
}

export function clearPendingDeckOrganizationSync(
  deckId: DeckId,
  storage: WritableStorage = window.localStorage,
  namespace?: LocalDataNamespace,
): void {
  clear(PENDING_DECK_ORGANIZATION_SYNC_STORAGE_KEY, deckId, storage, namespace)
}

/** For the account panel's unsent count, which adds every kind together. */
export function pendingDeckOrganizationSyncCount(
  storage: ReadableStorage = window.localStorage,
  namespace?: LocalDataNamespace,
): number {
  return (
    Object.keys(readPendingDeckFolderSync(storage, namespace)).length +
    Object.keys(readPendingDeckTagSync(storage, namespace)).length +
    Object.keys(readPendingDeckOrganizationSync(storage, namespace)).length
  )
}
