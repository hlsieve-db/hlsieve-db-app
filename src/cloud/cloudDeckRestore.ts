import type { Deck, DeckId } from '../domain/decks/types'
import type { DeckBackupRepository } from '../repositories/deckRepository'
import type {
  CloudDeckFailure,
  CloudDeckRecord,
  CloudDeckRepository,
} from './cloudDeckRepository'

/**
 * Bringing an account's decks back down to a device.
 *
 * The opposite direction to the first sync, and the dangerous one, because it
 * writes over what is already here. Two rules keep it safe.
 *
 * A deck is removed only when the cloud says it was deleted. A local deck the
 * cloud has never heard of is left alone: the cloud not holding a deck is not
 * the same as the cloud saying it is gone, and treating absence as deletion
 * would silently destroy anything made on this device since the last upload.
 *
 * Nothing is merged. A deck present on both sides is replaced by the cloud
 * copy, because that is what restoring means, and the reporter agreed to it on
 * the confirmation screen. Deciding per deck is a separate problem and is not
 * attempted here.
 */

export type CloudDeckRestoreFailure = CloudDeckFailure | 'unavailable'

export type CloudDeckRestorePlan = {
  /** Cloud decks to write locally, active ones only. */
  restore: Deck[]
  /** Local decks to delete, because the cloud holds a tombstone for them. */
  remove: DeckId[]
  /** How many decks this device has, which decides whether to ask first. */
  localCount: number
  /**
   * Every row the account holds, tombstones included.
   *
   * This is what says whether the account has ever synced, which is a
   * different question from how many decks it currently has. An account whose
   * decks were all deleted still holds rows, and uploading over them would
   * resurrect them, so it is not the same as an account that has never synced.
   */
  cloudRowCount: number
}

export type CloudDeckRestoreResult =
  | { ok: true; restored: number; removed: number }
  | { ok: false; reason: CloudDeckRestoreFailure }

/**
 * Pure, so what a restore would do can be shown before it is done, and tested
 * without a repository.
 */
export function planCloudDeckRestore(
  records: readonly CloudDeckRecord[],
  localDecks: readonly Deck[],
): CloudDeckRestorePlan {
  const localIds = new Set(localDecks.map((deck) => deck.id))
  const restore: Deck[] = []
  const remove: DeckId[] = []

  for (const record of records) {
    if (record.deletedAt === null) {
      restore.push(record.deck)
      continue
    }
    // A tombstone for a deck this device does not have is already true here,
    // so there is nothing to delete and nothing to report.
    if (localIds.has(record.id)) remove.push(record.id)
  }

  return {
    restore,
    remove,
    localCount: localDecks.length,
    cloudRowCount: records.length,
  }
}

export type CloudDeckRestoreOptions = {
  /**
   * The unwrapped local repository. Writing through the sync-wrapped one would
   * push every restored deck straight back to the cloud, which is a round trip
   * for data that just came from there.
   */
  decks: DeckBackupRepository
  cloudDecks: CloudDeckRepository | null
  onProgress?: (progress: { completed: number; total: number }) => void
}

/** Reads the account's decks and reports what restoring them would do. */
export async function readCloudDeckRestorePlan({
  decks,
  cloudDecks,
}: Pick<CloudDeckRestoreOptions, 'decks' | 'cloudDecks'>): Promise<
  | { ok: true; plan: CloudDeckRestorePlan }
  | { ok: false; reason: CloudDeckRestoreFailure }
> {
  if (!cloudDecks) return { ok: false, reason: 'unavailable' }

  const cloud = await cloudDecks.listAll()
  if (!cloud.ok) return { ok: false, reason: cloud.reason }

  let local: Deck[]
  try {
    local = await decks.listDecks()
  } catch {
    return { ok: false, reason: 'failed' }
  }

  return { ok: true, plan: planCloudDeckRestore(cloud.value, local) }
}

/**
 * Applies a plan. Taking the plan rather than fetching again means what is
 * applied is exactly what was shown and agreed to.
 */
export async function applyCloudDeckRestore(
  plan: CloudDeckRestorePlan,
  { decks, onProgress }: Pick<CloudDeckRestoreOptions, 'decks' | 'onProgress'>,
): Promise<CloudDeckRestoreResult> {
  const total = plan.restore.length + plan.remove.length
  let completed = 0
  onProgress?.({ completed, total })

  try {
    for (const deck of plan.restore) {
      await decks.saveDeck(deck)
      completed += 1
      onProgress?.({ completed, total })
    }
    for (const deckId of plan.remove) {
      await decks.deleteDeck(deckId)
      completed += 1
      onProgress?.({ completed, total })
    }
  } catch {
    // Local writes are the only thing that can fail here, and stopping leaves
    // the device part way. Everything applied so far is a deck the account
    // already holds, so running it again reaches the same end state.
    return { ok: false, reason: 'failed' }
  }

  return {
    ok: true,
    restored: plan.restore.length,
    removed: plan.remove.length,
  }
}
