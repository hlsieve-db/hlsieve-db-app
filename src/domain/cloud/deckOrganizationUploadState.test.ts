import { describe, expect, it } from 'vitest'

import {
  ANONYMOUS_LOCAL_DATA_NAMESPACE,
  userLocalDataNamespace,
} from '../storage/localDataNamespace'
import {
  deckOrganizationUploadStateStorageKey,
  hasUploadedDeckOrganization,
  recordUploadedDeckOrganization,
} from './deckOrganizationUploadState'

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

describe('remembering that this device has offered what it holds', () => {
  it('keeps the mark per account', () => {
    expect(deckOrganizationUploadStateStorageKey(ACCOUNT)).toBe(
      'hlsieve:cloud-organization-uploaded--user-a',
    )
    expect(deckOrganizationUploadStateStorageKey(OTHER)).not.toBe(
      deckOrganizationUploadStateStorageKey(ACCOUNT),
    )
  })

  // There is no account to have uploaded anything to.
  it('has no mark for an anonymous visitor', () => {
    expect(
      deckOrganizationUploadStateStorageKey(ANONYMOUS_LOCAL_DATA_NAMESPACE),
    ).toBeUndefined()

    const storage = memoryStorage()
    recordUploadedDeckOrganization(
      undefined,
      storage,
      ANONYMOUS_LOCAL_DATA_NAMESPACE,
    )

    expect(storage.values.size).toBe(0)
    expect(
      hasUploadedDeckOrganization(storage, ANONYMOUS_LOCAL_DATA_NAMESPACE),
    ).toBe(false)
  })

  it('reads back what it recorded, for that account only', () => {
    const storage = memoryStorage()

    recordUploadedDeckOrganization('2026-09-27T00:00:00.000Z', storage, ACCOUNT)

    expect(hasUploadedDeckOrganization(storage, ACCOUNT)).toBe(true)
    expect(hasUploadedDeckOrganization(storage, OTHER)).toBe(false)
  })

  it('treats an absent, unreadable or unknown mark as work not done', () => {
    expect(hasUploadedDeckOrganization(memoryStorage(), ACCOUNT)).toBe(false)
    expect(
      hasUploadedDeckOrganization(
        memoryStorage({
          'hlsieve:cloud-organization-uploaded--user-a': 'not json',
        }),
        ACCOUNT,
      ),
    ).toBe(false)
    expect(
      hasUploadedDeckOrganization(
        memoryStorage({
          'hlsieve:cloud-organization-uploaded--user-a': JSON.stringify({
            version: 99,
            at: '2026-09-27T00:00:00.000Z',
          }),
        }),
        ACCOUNT,
      ),
    ).toBe(false)
  })

  // The mark is an optimisation; the account's own row count is the safety rule.
  it('survives a store that refuses to be written', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked')
      },
    }

    expect(() =>
      recordUploadedDeckOrganization(undefined, storage, ACCOUNT),
    ).not.toThrow()
    expect(hasUploadedDeckOrganization(storage, ACCOUNT)).toBe(false)
  })
})
