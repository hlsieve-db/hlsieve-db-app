import { describe, expect, it } from 'vitest'

import {
  ANONYMOUS_LOCAL_DATA_NAMESPACE,
  userLocalDataNamespace,
} from '../storage/localDataNamespace'
import {
  clearPendingDeckSync,
  pendingDeckSyncCount,
  pendingDeckSyncStorageKey,
  readPendingDeckSync,
  recordPendingDeckSync,
  writePendingDeckSync,
} from './pendingDeckSync'

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  }
}

const userA = userLocalDataNamespace('user-a')
const userB = userLocalDataNamespace('user-b')
const keyA = 'hlsieve:cloud-sync-pending--user-a'

describe('where unsent changes are kept', () => {
  it('is namespaced per account, like the sync state key', () => {
    expect(pendingDeckSyncStorageKey(userA)).toBe(keyA)
    expect(pendingDeckSyncStorageKey(userB)).toBe(
      'hlsieve:cloud-sync-pending--user-b',
    )
  })

  // There is no unnamespaced key, so nothing can be retried while signed out.
  it('does not exist for an anonymous visitor', () => {
    expect(
      pendingDeckSyncStorageKey(ANONYMOUS_LOCAL_DATA_NAMESPACE),
    ).toBeUndefined()
    expect(pendingDeckSyncStorageKey()).toBeUndefined()
  })

  it('stores nothing for an anonymous visitor', () => {
    const storage = memoryStorage()
    recordPendingDeckSync(
      'a',
      'upsert',
      storage,
      ANONYMOUS_LOCAL_DATA_NAMESPACE,
    )

    expect(storage.values.size).toBe(0)
    expect(
      readPendingDeckSync(storage, ANONYMOUS_LOCAL_DATA_NAMESPACE),
    ).toEqual({})
  })
})

describe('recording an unsent change', () => {
  it('remembers the intent', () => {
    const storage = memoryStorage()
    recordPendingDeckSync('a', 'upsert', storage, userA)

    expect(readPendingDeckSync(storage, userA)).toEqual({ a: 'upsert' })
  })

  // Keyed by deck id, so a deck can never have two entries.
  it('keeps one entry when the same deck fails twice', () => {
    const storage = memoryStorage()
    recordPendingDeckSync('a', 'upsert', storage, userA)
    recordPendingDeckSync('a', 'upsert', storage, userA)

    expect(readPendingDeckSync(storage, userA)).toEqual({ a: 'upsert' })
    expect(pendingDeckSyncCount(storage, userA)).toBe(1)
  })

  // The last thing the reporter did is what the account should agree with.
  it('replaces a pending upsert with a tombstone', () => {
    const storage = memoryStorage()
    recordPendingDeckSync('a', 'upsert', storage, userA)
    recordPendingDeckSync('a', 'tombstone', storage, userA)

    expect(readPendingDeckSync(storage, userA)).toEqual({ a: 'tombstone' })
  })

  it('replaces a pending tombstone with an upsert', () => {
    const storage = memoryStorage()
    recordPendingDeckSync('a', 'tombstone', storage, userA)
    recordPendingDeckSync('a', 'upsert', storage, userA)

    expect(readPendingDeckSync(storage, userA)).toEqual({ a: 'upsert' })
  })

  it('keeps separate entries for separate decks, in the order they failed', () => {
    const storage = memoryStorage()
    recordPendingDeckSync('a', 'upsert', storage, userA)
    recordPendingDeckSync('b', 'tombstone', storage, userA)

    expect(Object.keys(readPendingDeckSync(storage, userA))).toEqual(['a', 'b'])
  })

  // Only the intent is stored. A retry reads the deck again, so what is sent is
  // what the device holds then.
  it('stores no copy of the deck', () => {
    const storage = memoryStorage()
    recordPendingDeckSync('a', 'upsert', storage, userA)

    expect(storage.values.get(keyA)).toBe(
      '{"version":1,"operations":{"a":"upsert"}}',
    )
  })
})

describe('clearing an entry', () => {
  it('removes just that deck', () => {
    const storage = memoryStorage()
    recordPendingDeckSync('a', 'upsert', storage, userA)
    recordPendingDeckSync('b', 'upsert', storage, userA)
    clearPendingDeckSync('a', storage, userA)

    expect(readPendingDeckSync(storage, userA)).toEqual({ b: 'upsert' })
  })

  it('does nothing for a deck that has no entry', () => {
    const storage = memoryStorage()
    recordPendingDeckSync('a', 'upsert', storage, userA)
    clearPendingDeckSync('missing', storage, userA)

    expect(readPendingDeckSync(storage, userA)).toEqual({ a: 'upsert' })
  })
})

describe('reading a queue that cannot be trusted', () => {
  it.each([
    ['not json', 'not json'],
    ['a scalar', '"upsert"'],
    ['null', 'null'],
    ['an unknown version', '{"version":2,"operations":{"a":"upsert"}}'],
    ['a missing version', '{"operations":{"a":"upsert"}}'],
    ['missing operations', '{"version":1}'],
    ['operations that are not an object', '{"version":1,"operations":3}'],
    ['an empty string', ''],
  ])('reads %s as an empty queue', (_label, raw) => {
    const storage = memoryStorage({ [keyA]: raw })

    expect(readPendingDeckSync(storage, userA)).toEqual({})
  })

  // Losing one retry is recoverable by editing the deck again; discarding
  // every other unsent change is not.
  it('drops only the entries it cannot read', () => {
    const storage = memoryStorage({
      [keyA]:
        '{"version":1,"operations":{"a":"upsert","b":"nonsense","c":"tombstone"}}',
    })

    expect(readPendingDeckSync(storage, userA)).toEqual({
      a: 'upsert',
      c: 'tombstone',
    })
  })

  it('survives storage that throws', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }

    expect(readPendingDeckSync(storage, userA)).toEqual({})
    expect(() =>
      recordPendingDeckSync('a', 'upsert', storage, userA),
    ).not.toThrow()
  })
})

describe('accounts are separate', () => {
  it('does not show one account another account s unsent changes', () => {
    const storage = memoryStorage()
    recordPendingDeckSync('a', 'upsert', storage, userA)

    expect(readPendingDeckSync(storage, userA)).toEqual({ a: 'upsert' })
    expect(readPendingDeckSync(storage, userB)).toEqual({})
  })

  it('keeps the first account s queue across a switch and back', () => {
    const storage = memoryStorage()
    recordPendingDeckSync('a', 'upsert', storage, userA)

    // B signs in, makes its own change, signs out again.
    recordPendingDeckSync('b', 'tombstone', storage, userB)

    expect(readPendingDeckSync(storage, userA)).toEqual({ a: 'upsert' })
    expect(readPendingDeckSync(storage, userB)).toEqual({ b: 'tombstone' })
  })

  it('counts only the account being asked about', () => {
    const storage = memoryStorage()
    recordPendingDeckSync('a', 'upsert', storage, userA)
    recordPendingDeckSync('b', 'upsert', storage, userA)
    recordPendingDeckSync('c', 'upsert', storage, userB)

    expect(pendingDeckSyncCount(storage, userA)).toBe(2)
    expect(pendingDeckSyncCount(storage, userB)).toBe(1)
  })
})

describe('the queue survives a reload', () => {
  it('reads back what a previous session wrote', () => {
    const storage = memoryStorage()
    recordPendingDeckSync('a', 'upsert', storage, userA)
    recordPendingDeckSync('b', 'tombstone', storage, userA)

    // A new session reads the same underlying store.
    const reloaded = memoryStorage(Object.fromEntries(storage.values))

    expect(readPendingDeckSync(reloaded, userA)).toEqual({
      a: 'upsert',
      b: 'tombstone',
    })
  })

  it('round trips through write and read', () => {
    const storage = memoryStorage()
    writePendingDeckSync({ a: 'upsert', b: 'tombstone' }, storage, userA)

    expect(readPendingDeckSync(storage, userA)).toEqual({
      a: 'upsert',
      b: 'tombstone',
    })
  })
})
