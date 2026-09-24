import { sameDeckRegulation } from '../regulations/deckRegulationId'
import type { Deck, DeckEntry } from './types'

/**
 * Whether two copies of a deck hold the same thing, as the reporter would see
 * it.
 *
 * Needed because a deck can exist on this device and in the account at once,
 * and only a real difference is worth asking about. What counts is what the
 * reporter edits: the name and the cards. The id is what pairs the two copies
 * up, so it is not part of the comparison.
 *
 * The timestamps are deliberately left out. `updatedAt` is written by whichever
 * device made the change and `createdAt` follows a deck through a backup
 * import, so two identical decks routinely carry different times; treating that
 * as a difference would ask the reporter to choose between two copies of the
 * same deck. The cloud's own row timestamps are server-assigned and are not
 * part of the deck at all.
 *
 * Entry order is not compared either. It is the order the cards happen to be
 * stored in, the views sort for display, and two devices can reach the same
 * deck by adding the same cards in a different sequence.
 *
 * The format the deck is built for does count. Two decks holding the same cards
 * for different tournaments are different decks, and treating them as one would
 * let a sync or an import silently drop the format one of them was built for.
 */

function sortedEntries(entries: readonly DeckEntry[]): DeckEntry[] {
  return [...entries].sort(
    (a, b) =>
      a.cardNumber.localeCompare(b.cardNumber) || a.quantity - b.quantity,
  )
}

/** The part of a deck a difference in which is worth asking about. */
export function deckContentEquals(a: Deck, b: Deck): boolean {
  if (a.name !== b.name) return false
  if (!sameDeckRegulation(a.regulationId, b.regulationId)) return false
  if (a.entries.length !== b.entries.length) return false

  const left = sortedEntries(a.entries)
  const right = sortedEntries(b.entries)
  // Compared pairwise rather than by summing quantities per card, so a stored
  // duplicate cannot hide a real difference behind the same total.
  return left.every(
    (entry, index) =>
      entry.cardNumber === right[index]?.cardNumber &&
      entry.quantity === right[index]?.quantity,
  )
}
