import {
  DB_VERSION,
  STORE_DECK_FOLDERS,
  STORE_DECK_ORGANIZATIONS,
  STORE_DECK_TAGS,
  STORE_DECK_VERSIONS,
  STORE_DECKS,
  STORE_FAVORITE_CARDS,
  STORE_RECENTLY_VIEWED_CARDS,
  STORE_SAVED_SEARCH_PRESETS,
  STORE_TOURNAMENT_REPORTS,
} from '../domain/decks/constants'
import {
  ANONYMOUS_LOCAL_DATA_NAMESPACE,
  indexedDbNameForNamespace,
  type LocalDataNamespace,
} from '../domain/storage/localDataNamespace'

export function upgradeAppDatabaseSchema(database: IDBDatabase): void {
  if (!database.objectStoreNames.contains(STORE_DECKS)) {
    database.createObjectStore(STORE_DECKS, { keyPath: 'id' })
  }
  if (!database.objectStoreNames.contains(STORE_TOURNAMENT_REPORTS)) {
    database.createObjectStore(STORE_TOURNAMENT_REPORTS, { keyPath: 'id' })
  }
  if (!database.objectStoreNames.contains(STORE_FAVORITE_CARDS)) {
    database.createObjectStore(STORE_FAVORITE_CARDS, {
      keyPath: 'cardNumber',
    })
  }
  if (!database.objectStoreNames.contains(STORE_SAVED_SEARCH_PRESETS)) {
    database.createObjectStore(STORE_SAVED_SEARCH_PRESETS, { keyPath: 'id' })
  }
  if (!database.objectStoreNames.contains(STORE_RECENTLY_VIEWED_CARDS)) {
    database.createObjectStore(STORE_RECENTLY_VIEWED_CARDS, {
      keyPath: 'cardNumber',
    })
  }
  // Added in version 6. Every store here is created only when it is missing,
  // so an existing database gains this one and keeps everything it already
  // holds; nothing reads or rewrites the decks on the way past.
  if (!database.objectStoreNames.contains(STORE_DECK_VERSIONS)) {
    database.createObjectStore(STORE_DECK_VERSIONS, { keyPath: 'id' })
  }
  // Added in version 7. Deck rows are deliberately not rewritten: no
  // organization row means the reporter has never organized that deck, which
  // is distinct from an explicit row with no folder and no tags.
  if (!database.objectStoreNames.contains(STORE_DECK_FOLDERS)) {
    database.createObjectStore(STORE_DECK_FOLDERS, { keyPath: 'id' })
  }
  if (!database.objectStoreNames.contains(STORE_DECK_TAGS)) {
    database.createObjectStore(STORE_DECK_TAGS, { keyPath: 'id' })
  }
  if (!database.objectStoreNames.contains(STORE_DECK_ORGANIZATIONS)) {
    database.createObjectStore(STORE_DECK_ORGANIZATIONS, {
      keyPath: 'deckId',
    })
  }
}

/**
 * A version upgrade that another tab is holding open.
 *
 * Told apart from every other failure because the reporter can do something
 * about this one, and only this one: close the other tab.
 */
export class AppDatabaseBlockedError extends Error {
  constructor() {
    super('Application database is blocked.')
    this.name = 'AppDatabaseBlockedError'
  }
}

export function isAppDatabaseBlockedError(error: unknown): boolean {
  return error instanceof AppDatabaseBlockedError
}

export function openAppDatabase(
  databaseFactory: IDBFactory,
  namespace: LocalDataNamespace = ANONYMOUS_LOCAL_DATA_NAMESPACE,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = databaseFactory.open(
      indexedDbNameForNamespace(namespace),
      DB_VERSION,
    )
    let blocked = false
    request.onupgradeneeded = () => upgradeAppDatabaseSchema(request.result)
    request.onsuccess = () => {
      const database = request.result
      // Asked to step aside when another tab upgrades the schema. Holding the
      // connection open would block that tab's open request instead, which is
      // the state this build cannot recover from without the reporter.
      database.onversionchange = () => database.close()
      // The other tab closed after this open was already reported as blocked,
      // so the connection has nobody waiting for it.
      if (blocked) {
        database.close()
        return
      }
      resolve(database)
    }
    request.onerror = () =>
      reject(request.error ?? new Error('Failed to open application database.'))
    request.onblocked = () => {
      blocked = true
      reject(new AppDatabaseBlockedError())
    }
  })
}

export type IndexedDbStorePersistence<T> = {
  getAll: () => Promise<unknown[]>
  get: (id: string) => Promise<unknown>
  put: (value: T) => Promise<void>
  addMany?: (values: readonly T[]) => Promise<void>
  delete: (id: string) => Promise<void>
}

function addManyInStore<T>(
  database: IDBDatabase,
  storeName: string,
  values: readonly T[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)
    for (const value of values) store.add(value)
    const rejectTransaction = () =>
      reject(transaction.error ?? new Error(`${storeName} transaction failed.`))
    transaction.oncomplete = () => resolve()
    transaction.onerror = rejectTransaction
    transaction.onabort = rejectTransaction
  })
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
  namespace: LocalDataNamespace = ANONYMOUS_LOCAL_DATA_NAMESPACE,
): IndexedDbStorePersistence<T> & {
  addMany: (values: readonly T[]) => Promise<void>
} {
  let databasePromise: Promise<IDBDatabase> | undefined
  const getDatabase = () => {
    if (!databasePromise) {
      const resolvedFactory = databaseFactory ?? globalThis.indexedDB
      if (!resolvedFactory) {
        return Promise.reject(new Error('IndexedDB is not available.'))
      }
      databasePromise = openAppDatabase(resolvedFactory, namespace)
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
    async addMany(values) {
      if (values.length === 0) return
      await addManyInStore(await getDatabase(), storeName, values)
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
