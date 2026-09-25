import type { Deck, DeckEntry, DeckId } from '../decks/types'

/**
 * A deck as it was at a moment the reporter chose to keep.
 *
 * Only ever created by asking for one. The editor saves on every change, so
 * snapshotting automatically would turn an afternoon of tuning into a list
 * nobody can read, and the point of a version is that someone decided this
 * state was worth coming back to.
 *
 * Kept apart from the deck rather than inside it. A deck is rewritten on every
 * edit and, for an account that syncs, sent again each time; carrying its
 * history along would make every keystroke cost the whole history, and would
 * drag every old snapshot into any disagreement between two devices.
 */

export const DECK_VERSION_LABEL_MAX_LENGTH = 50

/** Everything restoring needs, and nothing else. */
export type DeckVersionSnapshot = {
  name: string
  entries: DeckEntry[]
  /** Absent means ordinary construction, as everywhere else. */
  regulationId?: string
}

export type DeckVersionId = string

export type DeckVersion = {
  id: DeckVersionId
  /**
   * The deck this belongs to. The snapshot does not carry the deck's own id:
   * a snapshot is a state, and the thing it is a state of is named here.
   */
  deckId: DeckId
  label: string
  createdAt: string
  snapshot: DeckVersionSnapshot
}

/**
 * Copies the parts of a deck worth keeping.
 *
 * Entries are copied one by one rather than by reference, because the deck this
 * came from goes on being edited: a shared array would let a later edit rewrite
 * a snapshot that is supposed to be a record of the past.
 */
export function toDeckVersionSnapshot(deck: Deck): DeckVersionSnapshot {
  return {
    name: deck.name,
    entries: deck.entries.map((entry) => ({ ...entry })),
    ...(deck.regulationId !== undefined
      ? { regulationId: deck.regulationId }
      : {}),
  }
}

function isSnapshot(value: unknown): value is DeckVersionSnapshot {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<DeckVersionSnapshot>
  return (
    typeof candidate.name === 'string' &&
    candidate.name.trim().length > 0 &&
    Array.isArray(candidate.entries) &&
    candidate.entries.every(
      (entry) =>
        !!entry &&
        typeof entry === 'object' &&
        typeof (entry as DeckEntry).cardNumber === 'string' &&
        (entry as DeckEntry).cardNumber.trim().length > 0 &&
        Number.isSafeInteger((entry as DeckEntry).quantity) &&
        (entry as DeckEntry).quantity >= 1,
    ) &&
    // Any string, including an id this build does not define: a snapshot of a
    // deck built for a format that has since been removed is still a snapshot.
    (candidate.regulationId === undefined ||
      typeof candidate.regulationId === 'string')
  )
}

export function isDeckVersion(value: unknown): value is DeckVersion {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<DeckVersion>
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.deckId === 'string' &&
    candidate.deckId.length > 0 &&
    typeof candidate.label === 'string' &&
    candidate.label.trim().length > 0 &&
    candidate.label.length <= DECK_VERSION_LABEL_MAX_LENGTH &&
    typeof candidate.createdAt === 'string' &&
    Number.isFinite(Date.parse(candidate.createdAt)) &&
    isSnapshot(candidate.snapshot)
  )
}
