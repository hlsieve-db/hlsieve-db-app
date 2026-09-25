import {
  clearPendingDeckSync,
  readPendingDeckSync,
  type PendingDeckSyncOperation,
} from '../domain/cloud/pendingDeckSync'
import type { DeckId } from '../domain/decks/types'
import type { LocalDataNamespace } from '../domain/storage/localDataNamespace'
import type { DeckBackupRepository } from '../repositories/deckRepository'
import type {
  CloudDeckFailure,
  CloudDeckRepository,
} from './cloudDeckRepository'
import { tombstoneCloudDeckWithVersions } from './cloudDeckRepository'

/**
 * Sends the deck changes that could not reach the account when they were made.
 *
 * Only changes recorded as pending are sent. This is not a sync: it never reads
 * the account, never looks for differences and never touches a deck the
 * reporter did not change, so signing in cannot cause anything to be uploaded.
 *
 * An upsert reads the deck from the local store at retry time, so what arrives
 * is what the device holds now. A tombstone needs only the id.
 */

export type PendingDeckSyncRetryResult =
  | { ok: true; completed: number; remaining: number }
  | {
      ok: false
      reason: CloudDeckFailure
      completed: number
      remaining: number
    }

export type PendingDeckSyncRetryOptions = {
  /**
   * The unwrapped local store. Reading is all that happens here, but going
   * through the wrapped one would risk a retry triggering another send.
   */
  decks: Pick<DeckBackupRepository, 'getDeck'>
  cloudDecks: CloudDeckRepository | null
  /**
   * Read at the moment of the retry. An account that never turned sync on has
   * nothing to send, and one that turned it off should stop.
   */
  isSyncEnabled: () => boolean
  namespace?: LocalDataNamespace
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  /**
   * Called each time an entry actually reached the account, so a run that
   * sends some entries and then fails still records that this device got
   * something up. Not called for an entry that was resolved without sending:
   * a tombstone the account never had, and an upsert whose deck is gone.
   */
  onUploadSuccess?: () => void
}

const nothingToDo: PendingDeckSyncRetryResult = {
  ok: true,
  completed: 0,
  remaining: 0,
}

export async function retryPendingDeckSync({
  decks,
  cloudDecks,
  isSyncEnabled,
  namespace,
  storage,
  onUploadSuccess,
}: PendingDeckSyncRetryOptions): Promise<PendingDeckSyncRetryResult> {
  if (!cloudDecks || !isSyncEnabled()) return nothingToDo

  const store = storage ?? window.localStorage
  const queue = readPendingDeckSync(store, namespace)
  const entries = Object.entries(queue) as [DeckId, PendingDeckSyncOperation][]
  if (entries.length === 0) return nothingToDo

  let completed = 0

  for (const [deckId, operation] of entries) {
    if (operation === 'tombstone') {
      const result = await tombstoneCloudDeckWithVersions(cloudDecks, deckId)
      // Nothing matching means the account does not hold the deck, which is
      // the state the tombstone was asking for. The intent is satisfied, so
      // the entry goes rather than blocking the queue forever.
      if (!result.ok && result.reason !== 'not-found') {
        return {
          ok: false,
          reason: result.reason,
          completed,
          remaining: entries.length - completed,
        }
      }
      if (result.ok) onUploadSuccess?.()
      clearPendingDeckSync(deckId, store, namespace)
      completed += 1
      continue
    }

    const deck = await decks.getDeck(deckId)
    if (!deck) {
      // An upsert is pending for a deck this device no longer has. It is not
      // turned into a tombstone: that would delete from the account on a
      // guess, and deleting a deck nobody asked to delete is the worst
      // outcome available. The entry is dropped instead, which leaves the
      // account exactly as it is.
      clearPendingDeckSync(deckId, store, namespace)
      completed += 1
      continue
    }

    const result = await cloudDecks.upsert(deck)
    if (!result.ok) {
      // Stopping rather than carrying on, for the same reason the first sync
      // stops: the usual causes here are being offline or having a stale
      // session, which affect every entry, so continuing would fire the rest
      // at a server that has just refused. The cost is that an entry failing
      // for its own sake holds up the ones behind it until the next retry.
      return {
        ok: false,
        reason: result.reason,
        completed,
        remaining: entries.length - completed,
      }
    }
    onUploadSuccess?.()
    clearPendingDeckSync(deckId, store, namespace)
    completed += 1
  }

  return { ok: true, completed, remaining: 0 }
}
