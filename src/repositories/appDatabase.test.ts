import { describe, expect, it, vi } from 'vitest'

import {
  STORE_DECKS,
  STORE_FAVORITE_CARDS,
  STORE_RECENTLY_VIEWED_CARDS,
  STORE_SAVED_SEARCH_PRESETS,
  STORE_TOURNAMENT_REPORTS,
} from '../domain/decks/constants'
import { DB_NAME } from '../domain/decks/constants'
import {
  ANONYMOUS_LOCAL_DATA_NAMESPACE,
  indexedDbNameForNamespace,
  userLocalDataNamespace,
  USER_ID_MAX_LENGTH,
  type LocalDataNamespace,
} from '../domain/storage/localDataNamespace'
import {
  createIndexedDbStorePersistence,
  upgradeAppDatabaseSchema,
} from './appDatabase'

function databaseWithStores(initial: string[]) {
  const stores = new Set(initial)
  const createObjectStore = vi.fn((name: string) => {
    stores.add(name)
    return {} as IDBObjectStore
  })
  return {
    database: {
      objectStoreNames: { contains: (name: string) => stores.has(name) },
      createObjectStore,
    } as unknown as IDBDatabase,
    stores,
    createObjectStore,
  }
}

describe('application IndexedDB migration', () => {
  it('adds missing stores without recreating or clearing the Deck store', () => {
    const existingDeckRecord = { id: 'deck-1', name: '既存デッキ' }
    const state = databaseWithStores([STORE_DECKS])

    upgradeAppDatabaseSchema(state.database)

    expect(state.stores.has(STORE_DECKS)).toBe(true)
    expect(state.stores.has(STORE_TOURNAMENT_REPORTS)).toBe(true)
    expect(state.createObjectStore).toHaveBeenCalledTimes(4)
    expect(state.createObjectStore).toHaveBeenCalledWith(
      STORE_TOURNAMENT_REPORTS,
      { keyPath: 'id' },
    )
    expect(state.createObjectStore).toHaveBeenCalledWith(STORE_FAVORITE_CARDS, {
      keyPath: 'cardNumber',
    })
    expect(state.createObjectStore).toHaveBeenCalledWith(
      STORE_SAVED_SEARCH_PRESETS,
      { keyPath: 'id' },
    )
    expect(state.createObjectStore).toHaveBeenCalledWith(
      STORE_RECENTLY_VIEWED_CARDS,
      { keyPath: 'cardNumber' },
    )
    expect(existingDeckRecord).toEqual({ id: 'deck-1', name: '既存デッキ' })
  })

  it('creates every store for a fresh database', () => {
    const state = databaseWithStores([])
    upgradeAppDatabaseSchema(state.database)
    expect(state.stores).toEqual(
      new Set([
        STORE_DECKS,
        STORE_TOURNAMENT_REPORTS,
        STORE_FAVORITE_CARDS,
        STORE_SAVED_SEARCH_PRESETS,
        STORE_RECENTLY_VIEWED_CARDS,
      ]),
    )
  })

  it('adds favorites without recreating existing Deck and tournament stores', () => {
    const state = databaseWithStores([STORE_DECKS, STORE_TOURNAMENT_REPORTS])
    upgradeAppDatabaseSchema(state.database)
    expect(state.createObjectStore).toHaveBeenCalledTimes(3)
    expect(state.createObjectStore).toHaveBeenCalledWith(STORE_FAVORITE_CARDS, {
      keyPath: 'cardNumber',
    })
    expect(state.createObjectStore).toHaveBeenCalledWith(
      STORE_SAVED_SEARCH_PRESETS,
      { keyPath: 'id' },
    )
    expect(state.createObjectStore).toHaveBeenCalledWith(
      STORE_RECENTLY_VIEWED_CARDS,
      { keyPath: 'cardNumber' },
    )
  })

  it('adds search presets and recent cards when older stores are present', () => {
    const state = databaseWithStores([
      STORE_DECKS,
      STORE_TOURNAMENT_REPORTS,
      STORE_FAVORITE_CARDS,
    ])

    upgradeAppDatabaseSchema(state.database)

    expect(state.createObjectStore).toHaveBeenCalledTimes(2)
    expect(state.createObjectStore).toHaveBeenCalledWith(
      STORE_SAVED_SEARCH_PRESETS,
      { keyPath: 'id' },
    )
    expect(state.createObjectStore).toHaveBeenCalledWith(
      STORE_RECENTLY_VIEWED_CARDS,
      { keyPath: 'cardNumber' },
    )
    expect(state.stores).toEqual(
      new Set([
        STORE_DECKS,
        STORE_TOURNAMENT_REPORTS,
        STORE_FAVORITE_CARDS,
        STORE_SAVED_SEARCH_PRESETS,
        STORE_RECENTLY_VIEWED_CARDS,
      ]),
    )
  })

  it('adds only recent history to the complete version 4 schema', () => {
    const state = databaseWithStores([
      STORE_DECKS,
      STORE_TOURNAMENT_REPORTS,
      STORE_FAVORITE_CARDS,
      STORE_SAVED_SEARCH_PRESETS,
    ])

    upgradeAppDatabaseSchema(state.database)

    expect(state.createObjectStore).toHaveBeenCalledTimes(1)
    expect(state.createObjectStore).toHaveBeenCalledWith(
      STORE_RECENTLY_VIEWED_CARDS,
      { keyPath: 'cardNumber' },
    )
    expect(state.stores).toEqual(
      new Set([
        STORE_DECKS,
        STORE_TOURNAMENT_REPORTS,
        STORE_FAVORITE_CARDS,
        STORE_SAVED_SEARCH_PRESETS,
        STORE_RECENTLY_VIEWED_CARDS,
      ]),
    )
  })
})

function atomicFactory(initial: { id: string }[] = []) {
  const records = new Map(initial.map((value) => [value.id, value]))
  const transactionStores: string[] = []
  const database = {
    objectStoreNames: { contains: () => true },
    transaction: (storeName: string) => {
      transactionStores.push(storeName)
      const pending: { id: string }[] = []
      let failed = false
      const transaction = {
        error: new Error('duplicate'),
        objectStore: () => ({
          add: (value: { id: string }) => {
            if (
              records.has(value.id) ||
              pending.some((candidate) => candidate.id === value.id)
            ) {
              failed = true
            } else {
              pending.push(value)
            }
            return {} as IDBRequest
          },
        }),
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onabort: null as (() => void) | null,
      }
      setTimeout(() => {
        if (failed) {
          transaction.onabort?.()
        } else {
          pending.forEach((value) => records.set(value.id, value))
          transaction.oncomplete?.()
        }
      }, 0)
      return transaction
    },
  }
  const factory = {
    open: () => {
      const request = {
        result: database,
        onsuccess: null as (() => void) | null,
        onerror: null,
        onblocked: null,
        onupgradeneeded: null,
      }
      queueMicrotask(() => request.onsuccess?.())
      return request
    },
  }
  return {
    factory: factory as unknown as IDBFactory,
    records,
    transactionStores,
  }
}

describe('application IndexedDB batch writes', () => {
  it('adds a batch in one transaction', async () => {
    const { factory, records } = atomicFactory()
    const persistence = createIndexedDbStorePersistence<{ id: string }>(
      STORE_TOURNAMENT_REPORTS,
      factory,
    )
    await persistence.addMany([{ id: 'one' }, { id: 'two' }])
    expect([...records.keys()]).toEqual(['one', 'two'])
  })

  it('aborts the whole batch rather than overwriting or partially importing', async () => {
    const existing = { id: 'existing' }
    const { factory, records } = atomicFactory([existing])
    const persistence = createIndexedDbStorePersistence<{ id: string }>(
      STORE_TOURNAMENT_REPORTS,
      factory,
    )
    await expect(
      persistence.addMany([{ id: 'new' }, { id: 'existing' }]),
    ).rejects.toThrow('duplicate')
    expect([...records.values()]).toEqual([existing])
  })

  it('rolls back a Deck batch while opening only the Deck store', async () => {
    const existing = { id: 'existing' }
    const { factory, records, transactionStores } = atomicFactory([existing])
    const persistence = createIndexedDbStorePersistence<{ id: string }>(
      STORE_DECKS,
      factory,
    )

    await expect(
      persistence.addMany([{ id: 'new' }, { id: 'existing' }]),
    ).rejects.toThrow('duplicate')
    expect([...records.values()]).toEqual([existing])
    expect(transactionStores).toEqual([STORE_DECKS])
    expect(transactionStores).not.toContain(STORE_TOURNAMENT_REPORTS)
  })
})

type FakeRecord = { id: string; name?: string }

/**
 * An in-memory IndexedDB stand-in that, unlike the batch fixture above, keeps
 * a separate record set per database name. That separation is the whole point
 * of the namespace work, so the fake has to model it.
 */
function namespacedFactory(
  seed: Record<string, Record<string, FakeRecord[]>> = {},
) {
  const databases = new Map<string, Map<string, Map<string, FakeRecord>>>()
  const openedNames: string[] = []

  const recordsFor = (databaseName: string, storeName: string) => {
    let stores = databases.get(databaseName)
    if (!stores) {
      stores = new Map()
      databases.set(databaseName, stores)
    }
    let records = stores.get(storeName)
    if (!records) {
      records = new Map()
      stores.set(storeName, records)
    }
    return records
  }

  for (const [databaseName, stores] of Object.entries(seed)) {
    for (const [storeName, values] of Object.entries(stores)) {
      const records = recordsFor(databaseName, storeName)
      for (const value of values) records.set(value.id, value)
    }
  }

  const makeDatabase = (databaseName: string) =>
    ({
      objectStoreNames: { contains: () => true },
      transaction: (storeName: string) => {
        const records = recordsFor(databaseName, storeName)
        const requests: { onsuccess: (() => void) | null; result: unknown }[] =
          []
        const settle = (result: unknown) => {
          const request = { onsuccess: null as (() => void) | null, result }
          requests.push(request)
          return request as unknown as IDBRequest
        }
        const transaction = {
          error: null,
          objectStore: () => ({
            get: (id: string) => settle(records.get(id)),
            getAll: () => settle([...records.values()]),
            put: (value: FakeRecord) => {
              records.set(value.id, value)
              return settle(undefined)
            },
            delete: (id: string) => {
              records.delete(id)
              return settle(undefined)
            },
          }),
          oncomplete: null as (() => void) | null,
          onerror: null as (() => void) | null,
          onabort: null as (() => void) | null,
        }
        queueMicrotask(() => {
          requests.forEach((request) => request.onsuccess?.())
          transaction.oncomplete?.()
        })
        return transaction
      },
    }) as unknown as IDBDatabase

  const factory = {
    open: (databaseName: string) => {
      openedNames.push(databaseName)
      const request = {
        result: makeDatabase(databaseName),
        onsuccess: null as (() => void) | null,
        onerror: null,
        onblocked: null,
        onupgradeneeded: null,
      }
      queueMicrotask(() => request.onsuccess?.())
      return request
    },
  }

  return {
    factory: factory as unknown as IDBFactory,
    openedNames,
    recordsIn: (databaseName: string, storeName: string) => [
      ...recordsFor(databaseName, storeName).values(),
    ],
  }
}

function deckPersistence(factory: IDBFactory, namespace?: LocalDataNamespace) {
  return createIndexedDbStorePersistence<FakeRecord>(
    STORE_DECKS,
    factory,
    namespace,
  )
}

describe('local data namespaces', () => {
  it('keeps the original database name for anonymous visitors', () => {
    expect(indexedDbNameForNamespace(ANONYMOUS_LOCAL_DATA_NAMESPACE)).toBe(
      DB_NAME,
    )
    expect(DB_NAME).toBe('holocard-db')
  })

  it('derives a distinct database name per user', () => {
    const userA = indexedDbNameForNamespace(userLocalDataNamespace('user-a'))
    const userB = indexedDbNameForNamespace(userLocalDataNamespace('user-b'))

    expect(userA).toBe('holocard-db--user-a')
    expect(userB).toBe('holocard-db--user-b')
    expect(userA).not.toBe(userB)
    expect(userA).not.toBe(DB_NAME)
  })

  it('accepts a Supabase-style uuid', () => {
    const userId = '3f6d2a1e-9c84-4b17-8c2a-1d5f7e0b9a33'
    expect(indexedDbNameForNamespace(userLocalDataNamespace(userId))).toBe(
      `${DB_NAME}--${userId}`,
    )
  })

  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
    ['leading space', ' abc'],
    ['slash', 'a/b'],
    ['colon', 'a:b'],
    ['unicode', 'ユーザー'],
    ['too long', 'a'.repeat(USER_ID_MAX_LENGTH + 1)],
  ])(
    'refuses a user id that would produce a confusing database name: %s',
    (_label, userId) => {
      expect(() => userLocalDataNamespace(userId)).toThrow()
      expect(() =>
        indexedDbNameForNamespace({ kind: 'user', userId }),
      ).toThrow()
    },
  )
})

describe('namespaced IndexedDB persistence', () => {
  it('opens the original database when no namespace is given', async () => {
    const { factory, openedNames } = namespacedFactory()

    await deckPersistence(factory).getAll()

    expect(openedNames).toEqual([DB_NAME])
  })

  it('reads decks written before namespaces existed', async () => {
    const legacyDeck = { id: 'deck-1', name: '既存デッキ' }
    const { factory } = namespacedFactory({
      [DB_NAME]: { [STORE_DECKS]: [legacyDeck] },
    })

    const persistence = deckPersistence(factory)

    expect(await persistence.getAll()).toEqual([legacyDeck])
    expect(await persistence.get('deck-1')).toEqual(legacyDeck)
  })

  it('opens a separate database per namespace', async () => {
    const { factory, openedNames } = namespacedFactory()

    await deckPersistence(factory, ANONYMOUS_LOCAL_DATA_NAMESPACE).getAll()
    await deckPersistence(factory, userLocalDataNamespace('user-a')).getAll()

    expect(openedNames).toEqual([DB_NAME, 'holocard-db--user-a'])
  })

  it('never shows one namespace the decks of another', async () => {
    const { factory } = namespacedFactory()
    const anonymous = deckPersistence(factory, ANONYMOUS_LOCAL_DATA_NAMESPACE)
    const userA = deckPersistence(factory, userLocalDataNamespace('user-a'))
    const userB = deckPersistence(factory, userLocalDataNamespace('user-b'))

    await anonymous.put({ id: 'anon-deck', name: '匿名' })
    await userA.put({ id: 'a-deck', name: 'A' })
    await userB.put({ id: 'b-deck', name: 'B' })

    expect(await anonymous.getAll()).toEqual([
      { id: 'anon-deck', name: '匿名' },
    ])
    expect(await userA.getAll()).toEqual([{ id: 'a-deck', name: 'A' }])
    expect(await userB.getAll()).toEqual([{ id: 'b-deck', name: 'B' }])
    expect(await userA.get('anon-deck')).toBeUndefined()
    expect(await userB.get('a-deck')).toBeUndefined()
    expect(await anonymous.get('b-deck')).toBeUndefined()
  })

  it('keeps the same deck id independent in each namespace', async () => {
    const { factory } = namespacedFactory()
    const anonymous = deckPersistence(factory, ANONYMOUS_LOCAL_DATA_NAMESPACE)
    const userA = deckPersistence(factory, userLocalDataNamespace('user-a'))

    await anonymous.put({ id: 'shared-id', name: '匿名側' })
    await userA.put({ id: 'shared-id', name: 'A側' })

    expect(await anonymous.get('shared-id')).toEqual({
      id: 'shared-id',
      name: '匿名側',
    })
    expect(await userA.get('shared-id')).toEqual({
      id: 'shared-id',
      name: 'A側',
    })
  })

  it('confines an update to the namespace that made it', async () => {
    const { factory } = namespacedFactory({
      [DB_NAME]: { [STORE_DECKS]: [{ id: 'shared-id', name: '匿名側' }] },
      'holocard-db--user-a': {
        [STORE_DECKS]: [{ id: 'shared-id', name: 'A側' }],
      },
    })
    const anonymous = deckPersistence(factory, ANONYMOUS_LOCAL_DATA_NAMESPACE)
    const userA = deckPersistence(factory, userLocalDataNamespace('user-a'))

    await userA.put({ id: 'shared-id', name: 'A側を更新' })

    expect(await anonymous.get('shared-id')).toEqual({
      id: 'shared-id',
      name: '匿名側',
    })
    expect(await userA.get('shared-id')).toEqual({
      id: 'shared-id',
      name: 'A側を更新',
    })
  })

  it('confines a delete to the namespace that made it', async () => {
    const { factory, recordsIn } = namespacedFactory({
      [DB_NAME]: { [STORE_DECKS]: [{ id: 'shared-id', name: '匿名側' }] },
      'holocard-db--user-a': {
        [STORE_DECKS]: [{ id: 'shared-id', name: 'A側' }],
      },
      'holocard-db--user-b': {
        [STORE_DECKS]: [{ id: 'shared-id', name: 'B側' }],
      },
    })

    await deckPersistence(factory, userLocalDataNamespace('user-a')).delete(
      'shared-id',
    )

    expect(recordsIn('holocard-db--user-a', STORE_DECKS)).toEqual([])
    expect(recordsIn(DB_NAME, STORE_DECKS)).toEqual([
      { id: 'shared-id', name: '匿名側' },
    ])
    expect(recordsIn('holocard-db--user-b', STORE_DECKS)).toEqual([
      { id: 'shared-id', name: 'B側' },
    ])
  })
})
