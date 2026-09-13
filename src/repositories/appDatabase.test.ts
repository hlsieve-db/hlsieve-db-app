import { describe, expect, it, vi } from 'vitest'

import {
  STORE_DECKS,
  STORE_TOURNAMENT_REPORTS,
} from '../domain/decks/constants'
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
  it('adds tournament reports without recreating or clearing the Deck store', () => {
    const existingDeckRecord = { id: 'deck-1', name: '既存デッキ' }
    const state = databaseWithStores([STORE_DECKS])

    upgradeAppDatabaseSchema(state.database)

    expect(state.stores.has(STORE_DECKS)).toBe(true)
    expect(state.stores.has(STORE_TOURNAMENT_REPORTS)).toBe(true)
    expect(state.createObjectStore).toHaveBeenCalledTimes(1)
    expect(state.createObjectStore).toHaveBeenCalledWith(
      STORE_TOURNAMENT_REPORTS,
      { keyPath: 'id' },
    )
    expect(existingDeckRecord).toEqual({ id: 'deck-1', name: '既存デッキ' })
  })

  it('creates both stores for a fresh database', () => {
    const state = databaseWithStores([])
    upgradeAppDatabaseSchema(state.database)
    expect(state.stores).toEqual(
      new Set([STORE_DECKS, STORE_TOURNAMENT_REPORTS]),
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
