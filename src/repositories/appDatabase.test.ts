import { describe, expect, it, vi } from 'vitest'

import {
  STORE_DECKS,
  STORE_TOURNAMENT_REPORTS,
} from '../domain/decks/constants'
import { upgradeAppDatabaseSchema } from './appDatabase'

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
