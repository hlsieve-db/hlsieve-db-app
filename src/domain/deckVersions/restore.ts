import type { Deck } from '../decks/types'
import type { DeckVersion } from './types'

/**
 * Putting a deck back to a state someone kept.
 *
 * The deck itself is the same deck: its id and the day it was created do not
 * change, because restoring is an edit to a deck rather than the arrival of a
 * new one. Anything holding the id — a saved selection, a cloud row, a queued
 * change — goes on meaning what it meant.
 *
 * Entries are copied out of the snapshot for the same reason they were copied
 * into it: the deck will be edited again, and a shared array would rewrite the
 * record of the past along with the present.
 *
 * Nothing is snapshotted on the way through. Restoring is one instruction, and
 * turning it into two records is the app deciding to keep something nobody
 * asked it to keep.
 */
export function restoreDeckFromVersion(
  deck: Deck,
  version: DeckVersion,
  options: { now?: () => string } = {},
): Deck {
  const { snapshot } = version
  const restored: Deck = {
    ...deck,
    name: snapshot.name,
    entries: snapshot.entries.map((entry) => ({ ...entry })),
    updatedAt: (options.now ?? (() => new Date().toISOString()))(),
  }

  // Ordinary construction is the absence of the field, so a snapshot taken
  // before a format was chosen puts the deck back to having none rather than
  // leaving whatever it has now.
  if (snapshot.regulationId === undefined) delete restored.regulationId
  else restored.regulationId = snapshot.regulationId

  return restored
}
