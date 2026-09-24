import { deckContentEquals } from '../domain/decks/deckContent'
import {
  planCloudDeckRestore,
  type CloudDeckRestorePlan,
} from './cloudDeckRestore'
import type { Deck, DeckId } from '../domain/decks/types'
import type { DeckBackupRepository } from '../repositories/deckRepository'
import type {
  CloudDeckFailure,
  CloudDeckRecord,
  CloudDeckRepository,
} from './cloudDeckRepository'

/**
 * Working out where this device and the account disagree, and doing what the
 * reporter decides about it.
 *
 * The whole-set choice this replaces asked one question about every deck at
 * once, so keeping one edit meant discarding another. This asks per deck, and
 * only where there is something to ask: a deck held by both sides with the same
 * contents needs no question, and a deck only one side has is not a
 * disagreement at all.
 *
 * Two rules from the earlier phases carry over unchanged. The account not
 * holding a deck is not the account saying it was deleted, so a local-only deck
 * is never removed. A tombstone is the account saying a deck was deleted, which
 * is a real disagreement with a device that still holds it, and not one this
 * code may settle on its own.
 */

export type DeckReconciliationFailure = CloudDeckFailure | 'unavailable'

export type DeckConflict =
  | {
      deckId: DeckId
      /** Both sides hold the deck, and their contents differ. */
      kind: 'active-active'
      localDeck: Deck
      cloudDeck: Deck
    }
  | {
      deckId: DeckId
      /** The account says this deck was deleted; this device still has it. */
      kind: 'local-vs-tombstone'
      localDeck: Deck
    }

export type DeckReconciliationPlan = {
  /** Decks only this device has. Never deleted here. */
  localOnly: Deck[]
  /** Active account decks this device does not have. */
  cloudOnly: Deck[]
  /** Held by both sides with the same contents, so nothing to do or ask. */
  identical: Deck[]
  conflicts: DeckConflict[]
  /**
   * Every row the account holds, tombstones included, for the same reason the
   * restore plan carries it: it says whether the account has ever synced, which
   * is not the same question as how many decks it has now.
   */
  cloudRowCount: number
}

/** What the reporter chose for one conflicting deck. */
export type DeckConflictChoice = 'local' | 'cloud'

export type DeckConflictResolutions = Readonly<
  Record<DeckId, DeckConflictChoice>
>

/**
 * Pure, so what would happen can be shown before anything happens, and so the
 * same two sides always produce the same plan.
 */
export function planDeckReconciliation({
  localDecks,
  cloudRows,
}: {
  localDecks: readonly Deck[]
  cloudRows: readonly CloudDeckRecord[]
}): DeckReconciliationPlan {
  const rowsById = new Map(cloudRows.map((row) => [row.id, row]))
  const localById = new Map(localDecks.map((deck) => [deck.id, deck]))

  const localOnly: Deck[] = []
  const cloudOnly: Deck[] = []
  const identical: Deck[] = []
  const conflicts: DeckConflict[] = []

  // Local order first, then the account's, so the plan and the questions it
  // leads to come out in a stable order.
  for (const localDeck of localDecks) {
    const row = rowsById.get(localDeck.id)
    if (!row) {
      localOnly.push(localDeck)
      continue
    }
    if (row.deletedAt !== null) {
      conflicts.push({
        deckId: localDeck.id,
        kind: 'local-vs-tombstone',
        localDeck,
      })
      continue
    }
    if (deckContentEquals(localDeck, row.deck)) {
      identical.push(localDeck)
      continue
    }
    conflicts.push({
      deckId: localDeck.id,
      kind: 'active-active',
      localDeck,
      cloudDeck: row.deck,
    })
  }

  for (const row of cloudRows) {
    if (localById.has(row.id)) continue
    // A tombstone for a deck this device does not have is already true here.
    if (row.deletedAt === null) cloudOnly.push(row.deck)
  }

  return {
    localOnly,
    cloudOnly,
    identical,
    conflicts,
    cloudRowCount: cloudRows.length,
  }
}

export type CloudDeckPlans = {
  /**
   * What restoring the whole set would do, which is what the existing screens
   * show when the two sides have nothing to argue about.
   */
  restore: CloudDeckRestorePlan
  reconciliation: DeckReconciliationPlan
}

export type DeckReconciliationReadOptions = {
  /**
   * The unwrapped local store. Reading is all this does, but what follows
   * writes through the same object, and writing a deck that came from the
   * account through the sync-wrapped one would send it straight back.
   */
  decks: Pick<DeckBackupRepository, 'listDecks'>
  cloudDecks: CloudDeckRepository | null
}

/**
 * Reads both sides once and builds both plans from the same rows.
 *
 * One read rather than one per plan: asking the account twice would double the
 * requests for a screen that is meant to look before it touches anything, and
 * two reads could disagree with each other.
 */
export async function readCloudDeckPlans({
  decks,
  cloudDecks,
}: DeckReconciliationReadOptions): Promise<
  | { ok: true; plans: CloudDeckPlans }
  | { ok: false; reason: DeckReconciliationFailure }
> {
  if (!cloudDecks) return { ok: false, reason: 'unavailable' }

  const cloud = await cloudDecks.listAll()
  if (!cloud.ok) return { ok: false, reason: cloud.reason }

  let local: Deck[]
  try {
    local = await decks.listDecks()
  } catch {
    // The local store is an input, so failing to read it is not the cloud's
    // fault and must not be reported as though it were.
    return { ok: false, reason: 'failed' }
  }

  return {
    ok: true,
    plans: {
      restore: planCloudDeckRestore(cloud.value, local),
      reconciliation: planDeckReconciliation({
        localDecks: local,
        cloudRows: cloud.value,
      }),
    },
  }
}

export type DeckReconciliationApplyOptions = {
  /** Unwrapped, so a deck written back from the account is not echoed up. */
  decks: Pick<DeckBackupRepository, 'saveDeck' | 'deleteDeck'>
  cloudDecks: CloudDeckRepository | null
  /**
   * Whether decks only this device has should also be sent.
   *
   * False while restoring: nothing about bringing the account's decks down says
   * this device's own decks should go up. True while turning sync on, which is
   * the moment the account is meant to end up with what this device has. Either
   * way a deck is only ever added to the account, never removed from it.
   */
  uploadLocalOnly?: boolean
  onProgress?: (progress: { completed: number; total: number }) => void
  /** Called after each change the account accepted, as elsewhere in the panel. */
  onUploadSuccess?: () => void
  /**
   * The queue of changes this device has not managed to send, which resolving a
   * conflict has to keep honest.
   *
   * An entry in it is an older intent for the same deck, and a retry will act
   * on it later. Left alone, a queued tombstone would delete the deck the
   * reporter just chose to keep from the account, and a queued upsert would
   * bring back the deck they just agreed to delete. So every deck this settles
   * has its entry either replaced by what is still outstanding or cleared.
   *
   * This is the same queue an ordinary failed save uses, reached through the
   * same functions. Nothing here keeps a second record of its own.
   */
  pending?: {
    record: (deckId: DeckId, operation: 'upsert' | 'tombstone') => void
    clear: (deckId: DeckId) => void
  }
}

export type DeckReconciliationApplyResult = {
  /** Conflicts that were settled, so the caller can say how many are left. */
  resolved: DeckId[]
  /** Conflicts still outstanding: nothing was chosen, or sending failed. */
  unresolved: DeckId[]
  /** Account decks written to this device, from conflicts and cloud-only both. */
  restored: number
  /** Decks the account accepted, from conflicts and local-only both. */
  uploaded: number
  /** Local decks removed because the reporter accepted the account's deletion. */
  removed: number
  /** Present when something was refused; the successes above still stand. */
  failure?: DeckReconciliationFailure
}

/**
 * Applies the reporter's choices, and the non-conflicting parts of the plan.
 *
 * Nothing is rolled back. Every step either writes a deck the other side
 * already holds or removes one the reporter agreed to remove, so stopping part
 * way leaves both sides consistent with themselves, and running it again from a
 * fresh plan reaches the same place. That is why a failure reports what is left
 * rather than undoing what worked.
 */
export async function applyDeckReconciliation(
  plan: DeckReconciliationPlan,
  resolutions: DeckConflictResolutions,
  {
    decks,
    cloudDecks,
    uploadLocalOnly = false,
    onProgress,
    onUploadSuccess,
    pending,
  }: DeckReconciliationApplyOptions,
): Promise<DeckReconciliationApplyResult> {
  const resolved: DeckId[] = []
  const unresolved: DeckId[] = []
  let restored = 0
  let uploaded = 0
  let removed = 0
  let failure: DeckReconciliationFailure | undefined

  if (!cloudDecks) {
    return {
      resolved,
      unresolved: plan.conflicts.map((conflict) => conflict.deckId),
      restored,
      uploaded,
      removed,
      failure: 'unavailable',
    }
  }

  const chosen = plan.conflicts.filter(
    (conflict) => resolutions[conflict.deckId] !== undefined,
  )
  for (const conflict of plan.conflicts) {
    if (resolutions[conflict.deckId] === undefined) {
      unresolved.push(conflict.deckId)
    }
  }

  const uploads = uploadLocalOnly ? plan.localOnly : []
  const total = chosen.length + plan.cloudOnly.length + uploads.length
  let completed = 0
  onProgress?.({ completed, total })
  const step = () => {
    completed += 1
    onProgress?.({ completed, total })
  }

  /** One place decides what a refused send means, so none of them can forget. */
  const send = async (deck: Deck): Promise<boolean> => {
    const sent = await cloudDecks.upsert(deck)
    if (sent.ok) {
      uploaded += 1
      onUploadSuccess?.()
      // The account now agrees, so whatever was queued for this deck is older
      // than the truth and must not be replayed.
      pending?.clear(deck.id)
      return true
    }
    // Recorded rather than dropped: the reporter said this device's copy wins,
    // which is a change of theirs that has not arrived. Recorded as an upsert
    // whatever was there before, because that is the intent they just chose.
    pending?.record(deck.id, 'upsert')
    failure ??= sent.reason
    return false
  }

  /**
   * For a deck settled by writing to this device rather than to the account.
   *
   * Nothing was sent, so there is nothing to record, but the reporter has just
   * said the account's copy is the right one. An older queued change for that
   * deck would undo that decision the next time the queue is retried.
   */
  const settleLocally = (deckId: DeckId) => pending?.clear(deckId)

  try {
    for (const conflict of chosen) {
      const choice = resolutions[conflict.deckId]

      if (choice === 'local') {
        // For a tombstone this is also what brings the deck back: sending it
        // clears the account's deleted_at, and there is no row to undelete by
        // hand.
        if (await send(conflict.localDeck)) resolved.push(conflict.deckId)
        else unresolved.push(conflict.deckId)
        step()
        continue
      }

      if (conflict.kind === 'local-vs-tombstone') {
        // The account's deletion is accepted here. The row stays a tombstone
        // rather than being removed, so another device that still holds the
        // deck cannot bring it back by syncing later.
        await decks.deleteDeck(conflict.deckId)
        removed += 1
      } else {
        // Written through the unwrapped store, so the deck that just came down
        // is not sent straight back up.
        await decks.saveDeck(conflict.cloudDeck)
        restored += 1
      }
      settleLocally(conflict.deckId)
      resolved.push(conflict.deckId)
      step()
    }

    for (const deck of plan.cloudOnly) {
      await decks.saveDeck(deck)
      restored += 1
      // Taking the account's copy is a decision about this deck too, so an
      // older queued intent for it is no longer what the reporter wants.
      settleLocally(deck.id)
      step()
    }

    // Both sides already agree about these, so anything still queued for them
    // is stale. A queued tombstone is the dangerous one: retried later, it
    // would delete a deck that matches on both sides.
    for (const deck of plan.identical) settleLocally(deck.id)

    for (const deck of uploads) {
      // A deck the account does not have yet, so this only ever adds.
      await send(deck)
      step()
    }
  } catch {
    // Only the local store can throw here. What was written stays written, and
    // a fresh plan will show whatever is still outstanding.
    failure ??= 'failed'
  }

  return { resolved, unresolved, restored, uploaded, removed, failure }
}
