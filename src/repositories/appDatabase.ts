import {
  DB_NAME,
  DB_VERSION,
  STORE_DECKS,
  STORE_TOURNAMENT_REPORTS,
} from '../domain/decks/constants'

export function upgradeAppDatabaseSchema(database: IDBDatabase): void {
  if (!database.objectStoreNames.contains(STORE_DECKS)) {
    database.createObjectStore(STORE_DECKS, { keyPath: 'id' })
  }
  if (!database.objectStoreNames.contains(STORE_TOURNAMENT_REPORTS)) {
    database.createObjectStore(STORE_TOURNAMENT_REPORTS, { keyPath: 'id' })
  }
}

function openAppDatabase(databaseFactory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = databaseFactory.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => upgradeAppDatabaseSchema(request.result)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('Failed to open application database.'))
    request.onblocked = () =>
      reject(new Error('Application database is blocked.'))
  })
}

export type IndexedDbStorePersistence<T> = {
  getAll: () => Promise<unknown[]>
  get: (id: string) => Promise<unknown>
  put: (value: T) => Promise<void>
  delete: (id: string) => Promise<void>
}

function requestInStore<T>(
  database: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  createRequest: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode)
    const request = createRequest(transaction.objectStore(storeName))
    let result: T
    request.onsuccess = () => {
      result = request.result
    }
    const rejectTransaction = () =>
      reject(
        transaction.error ??
          request.error ??
          new Error(`${storeName} transaction failed.`),
      )
    transaction.oncomplete = () => resolve(result)
    transaction.onerror = rejectTransaction
    transaction.onabort = rejectTransaction
  })
}

export function createIndexedDbStorePersistence<T>(
  storeName: string,
  databaseFactory?: IDBFactory,
): IndexedDbStorePersistence<T> {
  let databasePromise: Promise<IDBDatabase> | undefined
  const getDatabase = () => {
    if (!databasePromise) {
      const resolvedFactory = databaseFactory ?? globalThis.indexedDB
      if (!resolvedFactory) {
        return Promise.reject(new Error('IndexedDB is not available.'))
      }
      databasePromise = openAppDatabase(resolvedFactory)
      void databasePromise.catch(() => {
        databasePromise = undefined
      })
    }
    return databasePromise
  }

  return {
    async getAll() {
      return requestInStore(
        await getDatabase(),
        storeName,
        'readonly',
        (store) => store.getAll() as IDBRequest<unknown[]>,
      )
    },
    async get(id) {
      return requestInStore(
        await getDatabase(),
        storeName,
        'readonly',
        (store) => store.get(id) as IDBRequest<unknown>,
      )
    },
    async put(value) {
      await requestInStore(
        await getDatabase(),
        storeName,
        'readwrite',
        (store) => store.put(value),
      )
    },
    async delete(id) {
      await requestInStore(
        await getDatabase(),
        storeName,
        'readwrite',
        (store) => store.delete(id),
      )
    },
  }
}
