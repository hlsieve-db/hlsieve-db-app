import type { DeckId } from '../decks/types'
import type { DeckVersionId } from '../deckVersions/types'
import {
  ANONYMOUS_LOCAL_DATA_NAMESPACE,
  type LocalDataNamespace,
} from '../storage/localDataNamespace'

export type PendingDeckVersionSyncOperation = 'upload' | 'tombstone'

export type PendingDeckVersionSyncEntry = {
  operation: PendingDeckVersionSyncOperation
  deckId: DeckId
}

export type PendingDeckVersionSyncQueue = Record<
  DeckVersionId,
  PendingDeckVersionSyncEntry
>

export const PENDING_DECK_VERSION_SYNC_VERSION = 1
export const PENDING_DECK_VERSION_SYNC_STORAGE_KEY =
  'hlsieve:cloud-sync-version-pending'

type StoredQueue = {
  version: 1
  operations: PendingDeckVersionSyncQueue
}

type ReadableStorage = Pick<Storage, 'getItem'>
type WritableStorage = Pick<Storage, 'getItem' | 'setItem'>

export function pendingDeckVersionSyncStorageKey(
  namespace: LocalDataNamespace = ANONYMOUS_LOCAL_DATA_NAMESPACE,
): string | undefined {
  return namespace.kind === 'anonymous'
    ? undefined
    : `${PENDING_DECK_VERSION_SYNC_STORAGE_KEY}--${namespace.userId}`
}

function parse(raw: string | null): PendingDeckVersionSyncQueue | undefined {
  if (!raw) return undefined
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return undefined
    const { version, operations } = value as Record<string, unknown>
    if (
      version !== PENDING_DECK_VERSION_SYNC_VERSION ||
      typeof operations !== 'object' ||
      operations === null
    ) {
      return undefined
    }

    const queue: PendingDeckVersionSyncQueue = {}
    for (const [versionId, rawEntry] of Object.entries(operations)) {
      if (!versionId || typeof rawEntry !== 'object' || rawEntry === null) {
        continue
      }
      const { operation, deckId } = rawEntry as Record<string, unknown>
      if (
        (operation === 'upload' || operation === 'tombstone') &&
        typeof deckId === 'string' &&
        deckId
      ) {
        queue[versionId] = { operation, deckId }
      }
    }
    return queue
  } catch {
    return undefined
  }
}

export function readPendingDeckVersionSync(
  storage: ReadableStorage = window.localStorage,
  namespace?: LocalDataNamespace,
): PendingDeckVersionSyncQueue {
  const key = pendingDeckVersionSyncStorageKey(namespace)
  if (!key) return {}
  try {
    return parse(storage.getItem(key)) ?? {}
  } catch {
    return {}
  }
}

export function writePendingDeckVersionSync(
  queue: PendingDeckVersionSyncQueue,
  storage: WritableStorage = window.localStorage,
  namespace?: LocalDataNamespace,
): boolean {
  const key = pendingDeckVersionSyncStorageKey(namespace)
  if (!key) return false
  try {
    const stored: StoredQueue = {
      version: PENDING_DECK_VERSION_SYNC_VERSION,
      operations: queue,
    }
    storage.setItem(key, JSON.stringify(stored))
    return true
  } catch {
    return false
  }
}

/** Tombstones are terminal for an immutable Version and can never be replaced. */
export function recordPendingDeckVersionSync(
  versionId: DeckVersionId,
  entry: PendingDeckVersionSyncEntry,
  storage: WritableStorage = window.localStorage,
  namespace?: LocalDataNamespace,
): boolean {
  const queue = readPendingDeckVersionSync(storage, namespace)
  if (
    queue[versionId]?.operation === 'tombstone' &&
    entry.operation === 'upload'
  ) {
    return true
  }
  return writePendingDeckVersionSync(
    { ...queue, [versionId]: entry },
    storage,
    namespace,
  )
}

export function clearPendingDeckVersionSync(
  versionId: DeckVersionId,
  storage: WritableStorage = window.localStorage,
  namespace?: LocalDataNamespace,
): boolean {
  const queue = readPendingDeckVersionSync(storage, namespace)
  if (!(versionId in queue)) return true
  const next = { ...queue }
  delete next[versionId]
  return writePendingDeckVersionSync(next, storage, namespace)
}

export function clearPendingDeckVersionSyncForDeck(
  deckId: DeckId,
  options: { includeTombstones: boolean },
  storage: WritableStorage = window.localStorage,
  namespace?: LocalDataNamespace,
): boolean {
  const queue = readPendingDeckVersionSync(storage, namespace)
  const next = { ...queue }
  for (const [versionId, entry] of Object.entries(queue)) {
    if (
      entry.deckId === deckId &&
      (options.includeTombstones || entry.operation === 'upload')
    ) {
      delete next[versionId]
    }
  }
  return Object.keys(next).length === Object.keys(queue).length
    ? true
    : writePendingDeckVersionSync(next, storage, namespace)
}

export function pendingDeckVersionSyncCount(
  storage: ReadableStorage = window.localStorage,
  namespace?: LocalDataNamespace,
): number {
  return Object.keys(readPendingDeckVersionSync(storage, namespace)).length
}
