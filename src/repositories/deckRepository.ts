import { STORE_DECKS } from '../domain/decks/constants'
import type { Deck, DeckId } from '../domain/decks/types'
import { isDeck } from '../domain/decks/validation'
import {
  createIndexedDbStorePersistence,
  type IndexedDbStorePersistence,
} from './appDatabase'

export type DeckRepository = {
  listDecks: () => Promise<Deck[]>
  getDeck: (id: DeckId) => Promise<Deck | undefined>
  saveDeck: (deck: Deck) => Promise<void>
  deleteDeck: (id: DeckId) => Promise<void>
}

export type DeckPersistenceAdapter = IndexedDbStorePersistence<Deck>

function assertPersistedDeck(value: unknown): Deck {
  if (!isDeck(value)) throw new Error('Stored deck has an invalid shape.')
  return value
}

export function createDeckRepository(
  persistence: DeckPersistenceAdapter,
): DeckRepository {
  return {
    async listDecks() {
      const decks = (await persistence.getAll()).map(assertPersistedDeck)
      return decks.sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      )
    },
    async getDeck(id) {
      const value = await persistence.get(id)
      return value === undefined ? undefined : assertPersistedDeck(value)
    },
    async saveDeck(deck) {
      if (!isDeck(deck)) throw new Error('Deck has an invalid shape.')
      await persistence.put(deck)
    },
    async deleteDeck(id) {
      await persistence.delete(id)
    },
  }
}

export function createIndexedDbDeckPersistence(
  databaseFactory?: IDBFactory,
): DeckPersistenceAdapter {
  return createIndexedDbStorePersistence(STORE_DECKS, databaseFactory)
}

export const deckRepository = createDeckRepository(
  createIndexedDbDeckPersistence(),
)
