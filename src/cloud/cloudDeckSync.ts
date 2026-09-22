import type { Deck } from '../domain/decks/types'
import type { DeckRepository } from '../repositories/deckRepository'
import type {
  CloudDeckFailure,
  CloudDeckRepository,
} from './cloudDeckRepository'

/**
 * The first sync: everything on this device is written to the account.
 *
 * Local is the truth. Nothing is downloaded, nothing is deleted locally and
 * nothing is merged, which is what keeps this safe to run without asking the
 * reporter to resolve anything. The two cases that cannot be decided
 * automatically — a deck edited in both places, and a deck deleted in the cloud
 * but present here — only arise when reading from the cloud, and this never
 * does.
 *
 * A deck the cloud holds as a tombstone comes back to life, because upsert
 * clears deleted_at. That is the correct reading of "local is the truth": the
 * deck is on this device, so the account should have it.
 */

/** Adds the case the repository cannot have: no cloud configured at all. */
export type CloudDeckSyncFailure = CloudDeckFailure | 'unavailable'

export type CloudDeckSyncProgress = {
  completed: number
  total: number
}

export type CloudDeckSyncResult =
  | { ok: true; uploaded: number }
  | { ok: false; reason: CloudDeckSyncFailure; uploaded: number }

export type CloudDeckSyncOptions = {
  decks: Pick<DeckRepository, 'listDecks'>
  /** Null where Cloud Sync is not configured for this deployment. */
  cloudDecks: CloudDeckRepository | null
  /** Called before the first upload and after each one, for a progress line. */
  onProgress?: (progress: CloudDeckSyncProgress) => void
}

export async function syncLocalDecksToCloud({
  decks,
  cloudDecks,
  onProgress,
}: CloudDeckSyncOptions): Promise<CloudDeckSyncResult> {
  if (!cloudDecks) return { ok: false, reason: 'unavailable', uploaded: 0 }

  let local: Deck[]
  try {
    local = await decks.listDecks()
  } catch {
    // The local store is the input; without it there is nothing to sync and no
    // reason to blame the cloud.
    return { ok: false, reason: 'failed', uploaded: 0 }
  }

  onProgress?.({ completed: 0, total: local.length })

  let uploaded = 0
  for (const deck of local) {
    // One at a time, so the count shown is real, the order is deterministic,
    // and a failure stops rather than firing the rest at a server that has
    // already refused once.
    const result = await cloudDecks.upsert(deck)
    if (!result.ok) {
      // Stopping leaves the decks already written in place. Every upload is an
      // upsert keyed by the deck's own id, so running the whole sync again
      // rewrites them to the same values rather than duplicating anything.
      return { ok: false, reason: result.reason, uploaded }
    }
    uploaded += 1
    onProgress?.({ completed: uploaded, total: local.length })
  }

  // An account with no decks has finished successfully: there was nothing to
  // send, and it should not be asked to try again.
  return { ok: true, uploaded }
}
