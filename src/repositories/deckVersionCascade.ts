import type { DeckBackupRepository } from './deckRepository'
import type { DeckVersionRepository } from './deckVersionRepository'

/** Keeps the local invariant that a removed Deck never leaves orphan Versions. */
export function withDeckVersionCascade(
  decks: DeckBackupRepository,
  versions: Pick<DeckVersionRepository, 'deleteVersionsForDeck'>,
): DeckBackupRepository {
  return {
    listDecks: decks.listDecks,
    getDeck: decks.getDeck,
    saveDeck: decks.saveDeck,
    importDecks: decks.importDecks,
    async deleteDeck(id) {
      await versions.deleteVersionsForDeck(id)
      await decks.deleteDeck(id)
    },
  }
}
