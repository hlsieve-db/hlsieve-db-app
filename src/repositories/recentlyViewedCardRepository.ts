import { STORE_RECENTLY_VIEWED_CARDS } from '../domain/decks/constants'
import {
  isRecentlyViewedCard,
  RECENTLY_VIEWED_LIMIT,
  type RecentlyViewedCard,
} from '../domain/recentlyViewed/types'
import { openAppDatabase } from './appDatabase'
import type { LocalDataNamespace } from '../domain/storage/localDataNamespace'

export type RecentlyViewedCardPersistenceAdapter = {
  getAll: () => Promise<unknown[]>
  recordView: (record: RecentlyViewedCard, limit: number) => Promise<void>
  delete: (cardNumber: string) => Promise<void>
  clear: () => Promise<void>
}

export type RecentlyViewedCardRepository = {
  list: () => Promise<RecentlyViewedCard[]>
  recordView: (cardNumber: string) => Promise<RecentlyViewedCard>
  remove: (cardNumber: string) => Promise<void>
  clear: () => Promise<void>
}

function compareRecentlyViewed(
  left: RecentlyViewedCard,
  right: RecentlyViewedCard,
): number {
  return (
    right.viewedAt.localeCompare(left.viewedAt) ||
    left.cardNumber.localeCompare(right.cardNumber, 'en')
  )
}

export function createRecentlyViewedCardRepository(
  persistence: RecentlyViewedCardPersistenceAdapter,
  options: { now?: () => string; limit?: number } = {},
): RecentlyViewedCardRepository {
  return {
    async list() {
      const records = await persistence.getAll()
      if (!records.every(isRecentlyViewedCard)) {
        throw new Error('Recently viewed card data has an invalid shape.')
      }
      return [...records].sort(compareRecentlyViewed)
    },
    async recordView(cardNumber) {
      const normalizedCardNumber = cardNumber.trim()
      if (!normalizedCardNumber) throw new Error('Card number is required.')
      const record = {
        cardNumber: normalizedCardNumber,
        viewedAt: options.now?.() ?? new Date().toISOString(),
      }
      if (!isRecentlyViewedCard(record)) {
        throw new Error('Recently viewed timestamp is invalid.')
      }
      await persistence.recordView(
        record,
        options.limit ?? RECENTLY_VIEWED_LIMIT,
      )
      return record
    },
    async remove(cardNumber) {
      await persistence.delete(cardNumber)
    },
    async clear() {
      await persistence.clear()
    },
  }
}

export function createIndexedDbRecentlyViewedCardPersistence(
  databaseFactory?: IDBFactory,
  namespace?: LocalDataNamespace,
): RecentlyViewedCardPersistenceAdapter {
  let databasePromise: Promise<IDBDatabase> | undefined
  const getDatabase = () => {
    if (!databasePromise) {
      const factory = databaseFactory ?? globalThis.indexedDB
      if (!factory)
        return Promise.reject(new Error('IndexedDB is not available.'))
      databasePromise = openAppDatabase(factory, namespace)
      void databasePromise.catch(() => {
        databasePromise = undefined
      })
    }
    return databasePromise
  }

  const runRequest = async (
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest,
  ): Promise<unknown> => {
    const database = await getDatabase()
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(
        STORE_RECENTLY_VIEWED_CARDS,
        mode,
      )
      const request = action(
        transaction.objectStore(STORE_RECENTLY_VIEWED_CARDS),
      )
      let result: unknown
      request.onsuccess = () => {
        result = request.result
      }
      const fail = () =>
        reject(
          transaction.error ??
            request.error ??
            new Error('Recently viewed card transaction failed.'),
        )
      transaction.oncomplete = () => resolve(result)
      transaction.onerror = fail
      transaction.onabort = fail
    })
  }

  return {
    async getAll() {
      return (await runRequest('readonly', (store) =>
        store.getAll(),
      )) as unknown[]
    },
    async recordView(record, limit) {
      const database = await getDatabase()
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          STORE_RECENTLY_VIEWED_CARDS,
          'readwrite',
        )
        const store = transaction.objectStore(STORE_RECENTLY_VIEWED_CARDS)
        const request = store.getAll()
        request.onsuccess = () => {
          const records = (request.result as unknown[])
            .filter(isRecentlyViewedCard)
            .filter((candidate) => candidate.cardNumber !== record.cardNumber)
          store.put(record)
          records.sort(compareRecentlyViewed)
          for (const stale of records.slice(Math.max(0, limit - 1))) {
            store.delete(stale.cardNumber)
          }
        }
        const fail = () =>
          reject(
            transaction.error ??
              request.error ??
              new Error('Recently viewed card transaction failed.'),
          )
        transaction.oncomplete = () => resolve()
        transaction.onerror = fail
        transaction.onabort = fail
      })
    },
    async delete(cardNumber) {
      await runRequest('readwrite', (store) => store.delete(cardNumber))
    },
    async clear() {
      await runRequest('readwrite', (store) => store.clear())
    },
  }
}

export const recentlyViewedCardRepository = createRecentlyViewedCardRepository(
  createIndexedDbRecentlyViewedCardPersistence(),
)
