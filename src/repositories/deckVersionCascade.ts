import type { DeckBackupRepository } from './deckRepository'
import type { DeckVersionRepository } from './deckVersionRepository'

/** Keeps the local invariant that a removed Deck never leaves orphan Versions. */
export function withDeckVersionCascade<T extends DeckBackupRepository>(
  decks: T,
  versions: Pick<DeckVersionRepository, 'deleteVersionsForDeck'>,
): Omit<T, 'deleteDeck'> & Pick<DeckBackupRepository, 'deleteDeck'> {
  // Spread rather than listed field by field, so a store that gains a method
  // does not silently lose it on the way through here.
  return {
    ...decks,
    async deleteDeck(id) {
      await versions.deleteVersionsForDeck(id)
      await decks.deleteDeck(id)
    },
  }
}
