import type { PendingDeckSyncOperation } from '../domain/cloud/pendingDeckSync'
import type { Deck, DeckId } from '../domain/decks/types'
import type { DeckBackupRepository } from '../repositories/deckRepository'
import type {
  CloudDeckFailure,
  CloudDeckRepository,
} from './cloudDeckRepository'
import { tombstoneCloudDeckWithVersions } from './cloudDeckRepository'

/**
 * Keeps the account's cloud decks following the local ones.
 *
 * Wrapping the repository rather than calling the cloud from each page means
 * every save and delete is covered by construction: the deck editor, the saved
 * deck list, the shared deck import and anything added later all go through
 * this without knowing it exists.
 *
 * Two rules decide everything here.
 *
 * Local is written first and is never rolled back. IndexedDB is the truth, the
 * cloud is a copy, and a copy failing must not cost the reporter the edit they
 * just made. So the local call is awaited and its result returned unchanged,
 * and only then is anything sent.
 *
 * The cloud call is not awaited by the caller. Awaiting it would make every
 * keystroke-driven save wait for the network, and offline would mean each save
 * hanging until a timeout. The push is started and the caller returns; what
 * happened to it arrives through onSyncResult.
 *
 * A send that fails is recorded as pending so it can be finished later, and a
 * send that succeeds clears any pending entry for that deck, including one left
 * by an earlier failure. The queue itself lives outside this file: the wrapper
 * knows the intent, not where it is kept.
 */

export type CloudDeckSyncEvent =
  | { kind: 'saved'; deckId: DeckId; ok: true }
  | { kind: 'saved'; deckId: DeckId; ok: false; reason: CloudDeckFailure }
  | { kind: 'deleted'; deckId: DeckId; ok: true }
  | { kind: 'deleted'; deckId: DeckId; ok: false; reason: CloudDeckFailure }

export type CloudSyncedDeckRepositoryOptions = {
  decks: DeckBackupRepository
  /** Null when Cloud Sync is not configured, or nobody is signed in. */
  cloudDecks: CloudDeckRepository | null
  /**
   * Read per call rather than captured, so turning sync on takes effect
   * without rebuilding the repository, and so a stale value cannot keep
   * sending after it is turned off.
   */
  isSyncEnabled: () => boolean
  /** Observability; nothing in the app depends on the outcome. */
  onSyncResult?: (event: CloudDeckSyncEvent) => void
  /**
   * Where unsent changes are remembered. Omitted, a failure is reported and
   * forgotten, which is what the app did before there was a queue.
   */
  pending?: {
    record: (deckId: DeckId, operation: PendingDeckSyncOperation) => void
    clear: (deckId: DeckId) => void
  }
  /**
   * Called when a change was accepted by the account, so the panel can say
   * when this device last got something up. Never called for a local save
   * whose send failed: that is the case the reporter most needs told apart.
   */
  onUploadSuccess?: () => void
  versionPending?: {
    /** Must succeed before local deletion, or an old upload could resurrect a child. */
    prepareParentDelete: (deckId: DeckId) => boolean
    clearParent: (deckId: DeckId) => void
  }
}

export function withCloudDeckSync({
  decks,
  cloudDecks,
  isSyncEnabled,
  onSyncResult,
  pending,
  onUploadSuccess,
  versionPending,
}: CloudSyncedDeckRepositoryOptions): DeckBackupRepository {
  const shouldSync = () => Boolean(cloudDecks) && isSyncEnabled()

  /**
   * One place decides what a finished send means for the queue, so a success
   * can never leave a stale entry behind and a failure can never fail to
   * record one.
   */
  const settle = (
    deckId: DeckId,
    operation: PendingDeckSyncOperation,
    ok: boolean,
  ) => {
    if (ok) {
      pending?.clear(deckId)
      // Both a save and a delete count: each one is this device getting the
      // account to agree with it.
      onUploadSuccess?.()
    } else pending?.record(deckId, operation)
  }

  const push = (deckValues: readonly Deck[]) => {
    if (!cloudDecks) return
    for (const deck of deckValues) {
      void cloudDecks.upsert(deck).then(
        (result) => {
          settle(deck.id, 'upsert', result.ok)
          onSyncResult?.(
            result.ok
              ? { kind: 'saved', deckId: deck.id, ok: true }
              : {
                  kind: 'saved',
                  deckId: deck.id,
                  ok: false,
                  reason: result.reason,
                },
          )
        },
        // A rejected promise is the same outcome as a refused request as far
        // as the local store is concerned: nothing to undo, and still an
        // unsent change.
        () => {
          settle(deck.id, 'upsert', false)
          onSyncResult?.({
            kind: 'saved',
            deckId: deck.id,
            ok: false,
            reason: 'network',
          })
        },
      )
    }
  }

  return {
    listDecks: decks.listDecks,
    getDeck: decks.getDeck,

    async saveDeck(deck) {
      // Local first, and its error propagates unchanged: a failed local save
      // is a failed save, and nothing should go to the cloud after one.
      await decks.saveDeck(deck)
      if (shouldSync()) push([deck])
    },

    async deleteDeck(id) {
      if (
        shouldSync() &&
        versionPending &&
        !versionPending.prepareParentDelete(id)
      ) {
        throw new Error('Could not preserve the cloud deletion intent.')
      }
      await decks.deleteDeck(id)
      if (!shouldSync() || !cloudDecks) return
      // A tombstone rather than a removal. The row is kept so a device that
      // still holds the deck cannot bring it back by syncing later, which is
      // the whole reason the account has no delete privilege.
      void tombstoneCloudDeckWithVersions(cloudDecks, id).then(
        (result) => {
          const satisfied = result.ok || result.reason === 'not-found'
          if (satisfied) {
            pending?.clear(id)
            versionPending?.clearParent(id)
            if (result.ok) onUploadSuccess?.()
          } else pending?.record(id, 'tombstone')
          onSyncResult?.(
            satisfied
              ? { kind: 'deleted', deckId: id, ok: true }
              : {
                  kind: 'deleted',
                  deckId: id,
                  ok: false,
                  reason: result.reason,
                },
          )
        },
        () => {
          settle(id, 'tombstone', false)
          onSyncResult?.({
            kind: 'deleted',
            deckId: id,
            ok: false,
            reason: 'network',
          })
        },
      )
    },

    async importDecks(imported) {
      await decks.importDecks(imported)
      // Imported decks are ordinary local decks, so they belong in the account
      // like any other. They are sent individually because that is what upsert
      // takes, and one failing does not stop the rest.
      if (shouldSync()) push(imported)
    },
  }
}
