import { STORE_DECKS } from '../domain/decks/constants'
import type { Deck, DeckId } from '../domain/decks/types'
import { isDeck } from '../domain/decks/validation'
import {
  createIndexedDbStorePersistence,
  type IndexedDbStorePersistence,
} from './appDatabase'
import type { LocalDataNamespace } from '../domain/storage/localDataNamespace'

export type DeckRepository = {
  listDecks: () => Promise<Deck[]>
  getDeck: (id: DeckId) => Promise<Deck | undefined>
  saveDeck: (deck: Deck) => Promise<void>
  deleteDeck: (id: DeckId) => Promise<void>
}

export type DeckBackupRepository = DeckRepository & {
  importDecks: (decks: readonly Deck[]) => Promise<void>
}

export type DeckPersistenceAdapter = Omit<
  IndexedDbStorePersistence<Deck>,
  'addMany'
> & {
  addMany: (values: readonly Deck[]) => Promise<void>
}

function assertPersistedDeck(value: unknown): Deck {
  if (!isDeck(value)) throw new Error('Stored deck has an invalid shape.')
  return value
}

export function createDeckRepository(
  persistence: DeckPersistenceAdapter,
): DeckBackupRepository {
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
    async importDecks(decks) {
      if (!decks.every(isDeck)) throw new Error('Invalid deck import.')
      await persistence.addMany(decks)
    },
  }
}

export function createIndexedDbDeckPersistence(
  databaseFactory?: IDBFactory,
  namespace?: LocalDataNamespace,
): DeckPersistenceAdapter {
  return createIndexedDbStorePersistence(
    STORE_DECKS,
    databaseFactory,
    namespace,
  )
}

export const deckRepository = createDeckRepository(
  createIndexedDbDeckPersistence(),
)
