import { describe, expect, it } from 'vitest'

import {
  ANONYMOUS_LOCAL_DATA_NAMESPACE,
  userLocalDataNamespace,
} from '../storage/localDataNamespace'
import {
  cloudUploadStatusStorageKey,
  readCloudUploadStatus,
  recordCloudUploadSuccess,
  writeCloudUploadStatus,
} from './cloudUploadStatus'

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
const keyA = 'hlsieve:cloud-sync-status--user-a'
const AT = '2026-09-23T00:15:00.000Z'

describe('where the last upload time is kept', () => {
  it('is namespaced per account, like the other cloud keys', () => {
    expect(cloudUploadStatusStorageKey(userA)).toBe(keyA)
    expect(cloudUploadStatusStorageKey(userB)).toBe(
      'hlsieve:cloud-sync-status--user-b',
    )
  })

  it('does not exist for an anonymous visitor', () => {
    expect(
      cloudUploadStatusStorageKey(ANONYMOUS_LOCAL_DATA_NAMESPACE),
    ).toBeUndefined()
    expect(cloudUploadStatusStorageKey()).toBeUndefined()
  })

  it('writes nothing while signed out', () => {
    const storage = memoryStorage()
    recordCloudUploadSuccess(AT, storage, ANONYMOUS_LOCAL_DATA_NAMESPACE)
    expect(storage.values.size).toBe(0)
    expect(
      readCloudUploadStatus(storage, ANONYMOUS_LOCAL_DATA_NAMESPACE)
        .lastUploadSuccessAt,
    ).toBeNull()
  })
})

describe('recording a successful upload', () => {
  it('keeps the moment it was accepted', () => {
    const storage = memoryStorage()
    recordCloudUploadSuccess(AT, storage, userA)
    expect(readCloudUploadStatus(storage, userA).lastUploadSuccessAt).toBe(AT)
  })

  it('stores the version and nothing but the timestamp', () => {
    const storage = memoryStorage()
    recordCloudUploadSuccess(AT, storage, userA)
    expect(JSON.parse(storage.values.get(keyA) ?? '')).toEqual({
      version: 1,
      lastUploadSuccessAt: AT,
    })
  })

  it('replaces the previous time rather than keeping a history', () => {
    const storage = memoryStorage()
    recordCloudUploadSuccess(AT, storage, userA)
    recordCloudUploadSuccess('2026-09-23T01:00:00.000Z', storage, userA)
    expect(readCloudUploadStatus(storage, userA).lastUploadSuccessAt).toBe(
      '2026-09-23T01:00:00.000Z',
    )
  })

  // One account's upload time must never be shown for another.
  it('keeps accounts apart', () => {
    const storage = memoryStorage()
    recordCloudUploadSuccess(AT, storage, userA)
    expect(readCloudUploadStatus(storage, userB).lastUploadSuccessAt).toBeNull()
  })

  it('survives being read again, as a reload would', () => {
    const storage = memoryStorage()
    recordCloudUploadSuccess(AT, storage, userA)
    const reloaded = memoryStorage(Object.fromEntries(storage.values))
    expect(readCloudUploadStatus(reloaded, userA).lastUploadSuccessAt).toBe(AT)
  })

  it('does not throw when storage refuses the write', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded')
      },
    }
    expect(() => recordCloudUploadSuccess(AT, storage, userA)).not.toThrow()
  })
})

// Claiming an upload that may not have happened is the harmful direction, so
// anything unreadable reads as never having sent.
describe('reading a damaged value', () => {
  it('falls back to nothing having been sent', () => {
    for (const raw of [
      'not json',
      '[]',
      'null',
      '"2026-09-23T00:15:00.000Z"',
      '{"version":2,"lastUploadSuccessAt":"2026-09-23T00:15:00.000Z"}',
      '{"version":1}',
      '{"version":1,"lastUploadSuccessAt":123}',
      '{"version":1,"lastUploadSuccessAt":"yesterday"}',
    ]) {
      const storage = memoryStorage({ [keyA]: raw })
      expect(readCloudUploadStatus(storage, userA)).toEqual({
        version: 1,
        lastUploadSuccessAt: null,
      })
    }
  })

  it('falls back when reading itself throws', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readCloudUploadStatus(storage, userA).lastUploadSuccessAt).toBeNull()
  })

  it('keeps a value written the long way round', () => {
    const storage = memoryStorage()
    writeCloudUploadStatus(
      { version: 1, lastUploadSuccessAt: AT },
      storage,
      userA,
    )
    expect(readCloudUploadStatus(storage, userA).lastUploadSuccessAt).toBe(AT)
  })
})
