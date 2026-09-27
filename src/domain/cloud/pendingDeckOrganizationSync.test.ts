import { describe, expect, it } from 'vitest'

import {
  ANONYMOUS_LOCAL_DATA_NAMESPACE,
  userLocalDataNamespace,
} from '../storage/localDataNamespace'
import {
  clearPendingDeckFolderSync,
  clearPendingDeckOrganizationSync,
  clearPendingDeckTagSync,
  pendingDeckFolderSyncStorageKey,
  pendingDeckOrganizationSyncCount,
  pendingDeckOrganizationSyncStorageKey,
  pendingDeckTagSyncStorageKey,
  readPendingDeckFolderSync,
  readPendingDeckOrganizationSync,
  readPendingDeckTagSync,
  recordPendingDeckFolderSync,
  recordPendingDeckOrganizationSync,
  recordPendingDeckTagSync,
} from './pendingDeckOrganizationSync'

const ACCOUNT = userLocalDataNamespace('user-a')
const OTHER = userLocalDataNamespace('user-b')

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}

describe('where the unsent changes are kept', () => {
  // Three keys, because the key means a different thing in each: a folder or
  // tag is keyed by its own id, an organization by the deck it describes.
  it('keeps a separate key per kind, per account', () => {
    expect(pendingDeckFolderSyncStorageKey(ACCOUNT)).toBe(
      'hlsieve:cloud-sync-pending-folders--user-a',
    )
    expect(pendingDeckTagSyncStorageKey(ACCOUNT)).toBe(
      'hlsieve:cloud-sync-pending-tags--user-a',
    )
    expect(pendingDeckOrganizationSyncStorageKey(ACCOUNT)).toBe(
      'hlsieve:cloud-sync-pending-organizations--user-a',
    )
    expect(pendingDeckFolderSyncStorageKey(OTHER)).not.toBe(
      pendingDeckFolderSyncStorageKey(ACCOUNT),
    )
  })

  // No unnamespaced key on purpose: nothing may be retried while signed out.
  it('has no key at all for an anonymous visitor', () => {
    expect(
      pendingDeckFolderSyncStorageKey(ANONYMOUS_LOCAL_DATA_NAMESPACE),
    ).toBeUndefined()
    expect(
      pendingDeckOrganizationSyncStorageKey(ANONYMOUS_LOCAL_DATA_NAMESPACE),
    ).toBeUndefined()
  })

  it('records nothing for an anonymous visitor', () => {
    const storage = memoryStorage()

    recordPendingDeckFolderSync(
      'f1',
      'upsert',
      storage,
      ANONYMOUS_LOCAL_DATA_NAMESPACE,
    )

    expect(storage.values.size).toBe(0)
    expect(
      readPendingDeckFolderSync(storage, ANONYMOUS_LOCAL_DATA_NAMESPACE),
    ).toEqual({})
  })
})

describe('what is remembered for one account', () => {
  it('keeps one entry per id, with the latest intent winning', () => {
    const storage = memoryStorage()

    recordPendingDeckFolderSync('f1', 'upsert', storage, ACCOUNT)
    recordPendingDeckFolderSync('f1', 'tombstone', storage, ACCOUNT)
    recordPendingDeckFolderSync('f2', 'upsert', storage, ACCOUNT)

    expect(readPendingDeckFolderSync(storage, ACCOUNT)).toEqual({
      f1: 'tombstone',
      f2: 'upsert',
    })
  })

  it('keeps the kinds apart', () => {
    const storage = memoryStorage()

    recordPendingDeckFolderSync('shared-id', 'upsert', storage, ACCOUNT)
    recordPendingDeckTagSync('shared-id', 'tombstone', storage, ACCOUNT)
    recordPendingDeckOrganizationSync('deck-1', 'upsert', storage, ACCOUNT)

    expect(readPendingDeckFolderSync(storage, ACCOUNT)).toEqual({
      'shared-id': 'upsert',
    })
    expect(readPendingDeckTagSync(storage, ACCOUNT)).toEqual({
      'shared-id': 'tombstone',
    })
    expect(readPendingDeckOrganizationSync(storage, ACCOUNT)).toEqual({
      'deck-1': 'upsert',
    })
  })

  it('keeps the accounts apart', () => {
    const storage = memoryStorage()

    recordPendingDeckTagSync('t1', 'upsert', storage, ACCOUNT)

    expect(readPendingDeckTagSync(storage, OTHER)).toEqual({})
  })

  it('forgets an entry once it has been sent', () => {
    const storage = memoryStorage()
    recordPendingDeckOrganizationSync('deck-1', 'upsert', storage, ACCOUNT)

    clearPendingDeckOrganizationSync('deck-1', storage, ACCOUNT)

    expect(readPendingDeckOrganizationSync(storage, ACCOUNT)).toEqual({})
  })

  // Deleting the folder clears its queued write: the reporter no longer holds
  // that intent, and sending it would try to create what is being deleted.
  it('forgets a folder entry when it is cleared', () => {
    const storage = memoryStorage()
    recordPendingDeckFolderSync('f1', 'upsert', storage, ACCOUNT)
    recordPendingDeckFolderSync('f2', 'upsert', storage, ACCOUNT)

    clearPendingDeckFolderSync('f1', storage, ACCOUNT)

    expect(readPendingDeckFolderSync(storage, ACCOUNT)).toEqual({
      f2: 'upsert',
    })
  })

  it('does not mind clearing something that was never there', () => {
    const storage = memoryStorage()

    clearPendingDeckTagSync('t9', storage, ACCOUNT)

    expect(readPendingDeckTagSync(storage, ACCOUNT)).toEqual({})
  })

  it('keeps the order entries were added in, which is the retry order', () => {
    const storage = memoryStorage()

    recordPendingDeckFolderSync('f3', 'upsert', storage, ACCOUNT)
    recordPendingDeckFolderSync('f1', 'upsert', storage, ACCOUNT)
    recordPendingDeckFolderSync('f2', 'upsert', storage, ACCOUNT)

    expect(Object.keys(readPendingDeckFolderSync(storage, ACCOUNT))).toEqual([
      'f3',
      'f1',
      'f2',
    ])
  })
})

describe('a store that cannot be trusted', () => {
  it('reads an absent or unreadable queue as empty', () => {
    expect(readPendingDeckFolderSync(memoryStorage(), ACCOUNT)).toEqual({})
    expect(
      readPendingDeckFolderSync(
        memoryStorage({
          'hlsieve:cloud-sync-pending-folders--user-a': 'not json',
        }),
        ACCOUNT,
      ),
    ).toEqual({})
  })

  it('ignores a queue written by a version it does not know', () => {
    const storage = memoryStorage({
      'hlsieve:cloud-sync-pending-tags--user-a': JSON.stringify({
        version: 99,
        operations: { t1: 'upsert' },
      }),
    })

    expect(readPendingDeckTagSync(storage, ACCOUNT)).toEqual({})
  })

  // Losing one retry is recoverable by editing again; discarding every other
  // unsent change is not.
  it('drops one bad entry and keeps the rest', () => {
    const storage = memoryStorage({
      'hlsieve:cloud-sync-pending-folders--user-a': JSON.stringify({
        version: 1,
        operations: { f1: 'upsert', f2: 'rename', '': 'upsert' },
      }),
    })

    expect(readPendingDeckFolderSync(storage, ACCOUNT)).toEqual({
      f1: 'upsert',
    })
  })

  it('survives a store that refuses to be written', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked')
      },
    }

    expect(() =>
      recordPendingDeckFolderSync('f1', 'upsert', storage, ACCOUNT),
    ).not.toThrow()
  })
})

describe('how many changes are waiting', () => {
  it('adds every kind together', () => {
    const storage = memoryStorage()
    recordPendingDeckFolderSync('f1', 'upsert', storage, ACCOUNT)
    recordPendingDeckTagSync('t1', 'upsert', storage, ACCOUNT)
    recordPendingDeckTagSync('t2', 'tombstone', storage, ACCOUNT)
    recordPendingDeckOrganizationSync('deck-1', 'upsert', storage, ACCOUNT)

    expect(pendingDeckOrganizationSyncCount(storage, ACCOUNT)).toBe(4)
  })

  it('counts nothing for an anonymous visitor', () => {
    const storage = memoryStorage()
    recordPendingDeckFolderSync('f1', 'upsert', storage, ACCOUNT)

    expect(
      pendingDeckOrganizationSyncCount(storage, ANONYMOUS_LOCAL_DATA_NAMESPACE),
    ).toBe(0)
  })
})
