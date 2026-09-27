import type { DeckBackupRepository } from './deckRepository'
import type { DeckOrganizationTransactions } from './deckOrganizationTransactions'

/** Keeps a deck row and its optional organization row from diverging. */
export function withDeckOrganizationCascade(
  decks: DeckBackupRepository,
  transactions: Pick<DeckOrganizationTransactions, 'deleteDeck'>,
): DeckBackupRepository {
  return {
    ...decks,
    async deleteDeck(id) {
      await transactions.deleteDeck(id)
    },
  }
}
