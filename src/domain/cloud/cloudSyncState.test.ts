import { describe, expect, it } from 'vitest'

import {
  ANONYMOUS_LOCAL_DATA_NAMESPACE,
  userLocalDataNamespace,
} from '../storage/localDataNamespace'
import {
  cloudSyncStateStorageKey,
  readCloudSyncState,
  writeCloudSyncState,
} from './cloudSyncState'

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

describe('cloud sync state key', () => {
  it('is namespaced per account, like the selected deck key', () => {
    expect(cloudSyncStateStorageKey(userA)).toBe('hlsieve:cloud-sync--user-a')
    expect(cloudSyncStateStorageKey(userB)).toBe('hlsieve:cloud-sync--user-b')
  })

  // Syncing belongs to an account. There is no unnamespaced key, so one
  // account's choice can never be read as another's or as a signed out default.
  it('does not exist for an anonymous visitor', () => {
    expect(
      cloudSyncStateStorageKey(ANONYMOUS_LOCAL_DATA_NAMESPACE),
    ).toBeUndefined()
    expect(cloudSyncStateStorageKey()).toBeUndefined()
  })
})

describe('reading cloud sync state', () => {
  it('has not started by default', () => {
    expect(readCloudSyncState(memoryStorage(), userA)).toEqual({
      version: 1,
      status: 'not_started',
    })
  })

  it('reads a stored choice back', () => {
    const storage = memoryStorage()
    writeCloudSyncState({ version: 1, status: 'enabled' }, storage, userA)

    expect(readCloudSyncState(storage, userA).status).toBe('enabled')
  })

  // Guessing "enabled" from a damaged value would mean a later phase syncing
  // decks for someone who never agreed to it. Asking again is the safe way to
  // be wrong.
  it.each([
    ['not json', 'not json'],
    ['a json scalar', '"enabled"'],
    ['null', 'null'],
    ['an array', '[]'],
    ['an unknown version', '{"version":2,"status":"enabled"}'],
    ['a missing version', '{"status":"enabled"}'],
    ['an unknown status', '{"version":1,"status":"paused"}'],
    ['a missing status', '{"version":1}'],
    ['an empty string', ''],
  ])('falls back to not_started for %s', (_label, raw) => {
    const storage = memoryStorage({ 'hlsieve:cloud-sync--user-a': raw })

    expect(readCloudSyncState(storage, userA).status).toBe('not_started')
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

    expect(readCloudSyncState(storage, userA).status).toBe('not_started')
    expect(() =>
      writeCloudSyncState({ version: 1, status: 'enabled' }, storage, userA),
    ).not.toThrow()
  })

  it('has not started for an anonymous visitor, and stores nothing', () => {
    const storage = memoryStorage()
    writeCloudSyncState(
      { version: 1, status: 'enabled' },
      storage,
      ANONYMOUS_LOCAL_DATA_NAMESPACE,
    )

    expect(storage.values.size).toBe(0)
    expect(
      readCloudSyncState(storage, ANONYMOUS_LOCAL_DATA_NAMESPACE).status,
    ).toBe('not_started')
  })
})

describe('accounts are separate', () => {
  it('does not show one account the choice another made', () => {
    const storage = memoryStorage()
    writeCloudSyncState({ version: 1, status: 'enabled' }, storage, userA)

    expect(readCloudSyncState(storage, userA).status).toBe('enabled')
    expect(readCloudSyncState(storage, userB).status).toBe('not_started')
  })

  it('restores the choice when the first account signs back in', () => {
    const storage = memoryStorage()
    writeCloudSyncState({ version: 1, status: 'enabled' }, storage, userA)
    // B signs in and does nothing.
    expect(readCloudSyncState(storage, userB).status).toBe('not_started')

    expect(readCloudSyncState(storage, userA).status).toBe('enabled')
  })

  it('stores a versioned object, so a later shape can be told apart', () => {
    const storage = memoryStorage()
    writeCloudSyncState({ version: 1, status: 'enabled' }, storage, userA)

    expect(
      JSON.parse(storage.values.get('hlsieve:cloud-sync--user-a') ?? ''),
    ).toEqual({ version: 1, status: 'enabled' })
  })
})
