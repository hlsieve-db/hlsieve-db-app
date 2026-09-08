import { DB_NAME, DB_VERSION, STORE_DECKS } from '../domain/decks/constants'
import type { Deck, DeckId } from '../domain/decks/types'
import { isDeck } from '../domain/decks/validation'

export type DeckRepository = {
  listDecks: () => Promise<Deck[]>
  getDeck: (id: DeckId) => Promise<Deck | undefined>
  saveDeck: (deck: Deck) => Promise<void>
  deleteDeck: (id: DeckId) => Promise<void>
}

export type DeckPersistenceAdapter = {
  getAll: () => Promise<unknown[]>
  get: (id: DeckId) => Promise<unknown>
  put: (deck: Deck) => Promise<void>
  delete: (id: DeckId) => Promise<void>
}

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

function openDeckDatabase(databaseFactory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = databaseFactory.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_DECKS)) {
        database.createObjectStore(STORE_DECKS, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('Failed to open deck database.'))
    request.onblocked = () => reject(new Error('Deck database is blocked.'))
  })
}

function requestInTransaction<T>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  createRequest: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_DECKS, mode)
    const request = createRequest(transaction.objectStore(STORE_DECKS))
    let result: T
    request.onsuccess = () => {
      result = request.result
    }
    const rejectTransaction = () =>
      reject(
        transaction.error ??
          request.error ??
          new Error('Deck transaction failed.'),
      )
    transaction.oncomplete = () => resolve(result)
    transaction.onerror = rejectTransaction
    transaction.onabort = rejectTransaction
  })
}

export function createIndexedDbDeckPersistence(
  databaseFactory?: IDBFactory,
): DeckPersistenceAdapter {
  let databasePromise: Promise<IDBDatabase> | undefined
  const getDatabase = () => {
    if (!databasePromise) {
      const resolvedFactory = databaseFactory ?? globalThis.indexedDB
      if (!resolvedFactory) {
        return Promise.reject(new Error('IndexedDB is not available.'))
      }
      databasePromise = openDeckDatabase(resolvedFactory)
      void databasePromise.catch(() => {
        databasePromise = undefined
      })
    }
    return databasePromise
  }

  return {
    async getAll() {
      return requestInTransaction(
        await getDatabase(),
        'readonly',
        (store) => store.getAll() as IDBRequest<unknown[]>,
      )
    },
    async get(id) {
      return requestInTransaction(
        await getDatabase(),
        'readonly',
        (store) => store.get(id) as IDBRequest<unknown>,
      )
    },
    async put(deck) {
      await requestInTransaction(await getDatabase(), 'readwrite', (store) =>
        store.put(deck),
      )
    },
    async delete(id) {
      await requestInTransaction(await getDatabase(), 'readwrite', (store) =>
        store.delete(id),
      )
    },
  }
}

export const deckRepository = createDeckRepository(
  createIndexedDbDeckPersistence(),
)
