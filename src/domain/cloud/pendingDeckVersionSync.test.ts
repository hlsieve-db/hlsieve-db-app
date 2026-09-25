import { describe, expect, it } from 'vitest'

import { userLocalDataNamespace } from '../storage/localDataNamespace'
import {
  clearPendingDeckVersionSyncForDeck,
  pendingDeckVersionSyncCount,
  readPendingDeckVersionSync,
  recordPendingDeckVersionSync,
} from './pendingDeckVersionSync'

function memoryStorage(options: { failWrites?: boolean } = {}) {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (options.failWrites) throw new Error('blocked')
      values.set(key, value)
    },
  }
}

const a = userLocalDataNamespace('user-a')
const b = userLocalDataNamespace('user-b')

describe('pending DeckVersion sync queue', () => {
  it('keeps accounts isolated', () => {
    const storage = memoryStorage()
    recordPendingDeckVersionSync(
      'version-1',
      { operation: 'upload', deckId: 'deck-1' },
      storage,
      a,
    )
    expect(pendingDeckVersionSyncCount(storage, a)).toBe(1)
    expect(readPendingDeckVersionSync(storage, b)).toEqual({})
  })

  it('lets a tombstone dominate a later upload for the immutable id', () => {
    const storage = memoryStorage()
    recordPendingDeckVersionSync(
      'version-1',
      { operation: 'tombstone', deckId: 'deck-1' },
      storage,
      a,
    )
    recordPendingDeckVersionSync(
      'version-1',
      { operation: 'upload', deckId: 'deck-1' },
      storage,
      a,
    )
    expect(readPendingDeckVersionSync(storage, a)).toEqual({
      'version-1': { operation: 'tombstone', deckId: 'deck-1' },
    })
  })

  it('reports a failed write so deletion can stop before IndexedDB', () => {
    expect(
      recordPendingDeckVersionSync(
        'version-1',
        { operation: 'tombstone', deckId: 'deck-1' },
        memoryStorage({ failWrites: true }),
        a,
      ),
    ).toBe(false)
  })

  it('clears obsolete uploads for one parent without dropping tombstones', () => {
    const storage = memoryStorage()
    recordPendingDeckVersionSync(
      'upload',
      { operation: 'upload', deckId: 'deck-1' },
      storage,
      a,
    )
    recordPendingDeckVersionSync(
      'delete',
      { operation: 'tombstone', deckId: 'deck-1' },
      storage,
      a,
    )
    recordPendingDeckVersionSync(
      'other',
      { operation: 'upload', deckId: 'deck-2' },
      storage,
      a,
    )
    expect(
      clearPendingDeckVersionSyncForDeck(
        'deck-1',
        { includeTombstones: false },
        storage,
        a,
      ),
    ).toBe(true)
    expect(readPendingDeckVersionSync(storage, a)).toEqual({
      delete: { operation: 'tombstone', deckId: 'deck-1' },
      other: { operation: 'upload', deckId: 'deck-2' },
    })
  })
})
