import type { DeckVersion } from './types'

/**
 * Whether two records describe the same immutable snapshot.
 *
 * Entry order is part of the snapshot: restoring one puts the cards back in
 * that order. Regulation ids are compared literally, including ids this build
 * does not know, so an old format is never normalized into a different one.
 * PostgreSQL may render the same timestamptz with a different offset spelling,
 * therefore createdAt is compared as an instant rather than as raw text.
 */
export function deckVersionContentEquals(
  left: DeckVersion,
  right: DeckVersion,
): boolean {
  if (
    left.id !== right.id ||
    left.deckId !== right.deckId ||
    left.label !== right.label ||
    Date.parse(left.createdAt) !== Date.parse(right.createdAt) ||
    left.snapshot.name !== right.snapshot.name ||
    left.snapshot.regulationId !== right.snapshot.regulationId ||
    left.snapshot.entries.length !== right.snapshot.entries.length
  ) {
    return false
  }

  return left.snapshot.entries.every((entry, index) => {
    const other = right.snapshot.entries[index]
    return (
      other !== undefined &&
      entry.cardNumber === other.cardNumber &&
      entry.quantity === other.quantity
    )
  })
}
