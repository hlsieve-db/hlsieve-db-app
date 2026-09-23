import type { DeckId } from '../decks/types'
import {
  ANONYMOUS_LOCAL_DATA_NAMESPACE,
  type LocalDataNamespace,
} from '../storage/localDataNamespace'

/**
 * Deck changes that were made locally but could not be sent to the account.
 *
 * Kept per account so a later attempt can finish the job. Only the intent is
 * stored, never a copy of the deck: when an upsert is retried the deck is read
 * from the local store again, so what reaches the account is what the device
 * holds now rather than whatever it held when the send failed.
 *
 * The queue is keyed by deck id, which is what makes the rules in the spec fall
 * out rather than needing to be enforced: one entry per deck, and recording a
 * new intent replaces the old one. Saving twice leaves one upsert, deleting
 * after a failed save leaves one tombstone, and saving after a failed delete
 * leaves one upsert.
 *
 * Insertion order is the retry order, and JSON preserves it for these keys
 * because a deck id is never a plain integer, so the order survives a reload.
 */

export type PendingDeckSyncOperation = 'upsert' | 'tombstone'

/** Deck id to the last thing that failed to reach the account for it. */
export type PendingDeckSyncQueue = Record<DeckId, PendingDeckSyncOperation>

export const PENDING_DECK_SYNC_VERSION = 1

export const PENDING_DECK_SYNC_STORAGE_KEY = 'hlsieve:cloud-sync-pending'

type StoredQueue = {
  version: 1
  operations: PendingDeckSyncQueue
}

type ReadableStorage = Pick<Storage, 'getItem'>
type WritableStorage = Pick<Storage, 'getItem' | 'setItem'>

/**
 * Undefined for an anonymous visitor, following the sync state key. There is no
 * unnamespaced key on purpose, so one account's unsent changes can never be
 * read as another's or retried while signed out.
 */
export function pendingDeckSyncStorageKey(
  namespace: LocalDataNamespace = ANONYMOUS_LOCAL_DATA_NAMESPACE,
): string | undefined {
  return namespace.kind === 'anonymous'
    ? undefined
    : `${PENDING_DECK_SYNC_STORAGE_KEY}--${namespace.userId}`
}

function isOperation(value: unknown): value is PendingDeckSyncOperation {
  return value === 'upsert' || value === 'tombstone'
}

function parse(raw: string | null): PendingDeckSyncQueue | undefined {
  if (!raw) return undefined
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return undefined
    const { version, operations } = value as Record<string, unknown>
    if (version !== PENDING_DECK_SYNC_VERSION) return undefined
    if (typeof operations !== 'object' || operations === null) return undefined
    const queue: PendingDeckSyncQueue = {}
    for (const [deckId, operation] of Object.entries(operations)) {
      // One bad entry is dropped rather than failing the whole queue: losing a
      // retry is recoverable by editing the deck again, whereas discarding
      // every other unsent change is not.
      if (deckId && isOperation(operation)) queue[deckId] = operation
    }
    return queue
  } catch {
    return undefined
  }
}

/** An unreadable or absent queue is an empty one: nothing to retry. */
export function readPendingDeckSync(
  storage: ReadableStorage = window.localStorage,
  namespace?: LocalDataNamespace,
): PendingDeckSyncQueue {
  const key = pendingDeckSyncStorageKey(namespace)
  if (!key) return {}
  try {
    return parse(storage.getItem(key)) ?? {}
  } catch {
    return {}
  }
}

/** A no-op for an anonymous visitor, who has no account to send anything to. */
export function writePendingDeckSync(
  queue: PendingDeckSyncQueue,
  storage: WritableStorage = window.localStorage,
  namespace?: LocalDataNamespace,
): void {
  const key = pendingDeckSyncStorageKey(namespace)
  if (!key) return
  try {
    const stored: StoredQueue = {
      version: PENDING_DECK_SYNC_VERSION,
      operations: queue,
    }
    storage.setItem(key, JSON.stringify(stored))
  } catch {
    // Blocked storage only costs the retry; the local change is already saved.
  }
}

/**
 * Records the latest intent for a deck, replacing whatever was there.
 *
 * A tombstone recorded after a failed upsert wins, and an upsert recorded after
 * a failed tombstone wins, because the last thing the reporter did is the thing
 * the account should end up agreeing with.
 */
export function recordPendingDeckSync(
  deckId: DeckId,
  operation: PendingDeckSyncOperation,
  storage: WritableStorage = window.localStorage,
  namespace?: LocalDataNamespace,
): void {
  const queue = readPendingDeckSync(storage, namespace)
  writePendingDeckSync({ ...queue, [deckId]: operation }, storage, namespace)
}

/** Called when a send succeeds, including an ordinary save that was not a retry. */
export function clearPendingDeckSync(
  deckId: DeckId,
  storage: WritableStorage = window.localStorage,
  namespace?: LocalDataNamespace,
): void {
  const queue = readPendingDeckSync(storage, namespace)
  if (!(deckId in queue)) return
  const next = { ...queue }
  delete next[deckId]
  writePendingDeckSync(next, storage, namespace)
}

export function pendingDeckSyncCount(
  storage: ReadableStorage = window.localStorage,
  namespace?: LocalDataNamespace,
): number {
  return Object.keys(readPendingDeckSync(storage, namespace)).length
}
