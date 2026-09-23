import { describe, expect, it, vi } from 'vitest'

import {
  readPendingDeckSync,
  writePendingDeckSync,
  type PendingDeckSyncQueue,
} from '../domain/cloud/pendingDeckSync'
import type { Deck } from '../domain/decks/types'
import {
  ANONYMOUS_LOCAL_DATA_NAMESPACE,
  userLocalDataNamespace,
} from '../domain/storage/localDataNamespace'
import type {
  CloudDeckRecord,
  CloudDeckRepository,
} from './cloudDeckRepository'
import { retryPendingDeckSync } from './retryPendingDeckSync'

const userA = userLocalDataNamespace('user-a')

function deck(id: string): Deck {
  return {
    id,
    name: `デッキ ${id}`,
    entries: [{ cardNumber: 'hBP04-042', quantity: 4 }],
    createdAt: '2026-09-22T00:00:00.000Z',
    updatedAt: '2026-09-22T00:00:00.000Z',
  }
}

function record(id: string): CloudDeckRecord {
  return {
    id,
    deck: deck(id),
    createdAt: '2026-09-22T04:00:00.000000+00:00',
    updatedAt: '2026-09-22T04:00:00.000000+00:00',
    deletedAt: null,
  }
}

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  }
}

function cloudRepository(
  overrides: Partial<CloudDeckRepository> = {},
): CloudDeckRepository {
  return {
    listAll: vi.fn(async () => ({ ok: true as const, value: [] })),
    listUpdatedSince: vi.fn(async () => ({ ok: true as const, value: [] })),
    upsert: vi.fn(async (value: Deck) => ({
      ok: true as const,
      value: record(value.id),
    })),
    tombstone: vi.fn(async (id: string) => ({
      ok: true as const,
      value: { ...record(id), deletedAt: '2026-09-22T05:00:00.000000+00:00' },
    })),
    ...overrides,
  }
}

function run({
  queue = {} as PendingDeckSyncQueue,
  decks = [deck('a')],
  cloudDecks = cloudRepository() as CloudDeckRepository | null,
  enabled = true,
  namespace = userA as ReturnType<typeof userLocalDataNamespace> | undefined,
} = {}) {
  const storage = memoryStorage()
  if (namespace) writePendingDeckSync(queue, storage, namespace)
  const getDeck = vi.fn(async (id: string) =>
    decks.find((value) => value.id === id),
  )
  const uploaded = vi.fn()
  const result = retryPendingDeckSync({
    decks: { getDeck },
    cloudDecks,
    isSyncEnabled: () => enabled,
    namespace,
    storage,
    onUploadSuccess: uploaded,
  })
  return { result, storage, getDeck, cloudDecks, namespace, uploaded }
}

const remaining = (
  storage: ReturnType<typeof memoryStorage>,
  namespace = userA,
) => readPendingDeckSync(storage, namespace)

describe('sending what could not be sent', () => {
  it('upserts the deck as it stands now, not as it was', async () => {
    const edited = { ...deck('a'), name: '編集後' }
    const { result, cloudDecks, storage } = run({
      queue: { a: 'upsert' },
      decks: [edited],
    })

    await expect(result).resolves.toEqual({
      ok: true,
      completed: 1,
      remaining: 0,
    })
    expect(cloudDecks?.upsert).toHaveBeenCalledWith(edited)
    expect(remaining(storage)).toEqual({})
  })

  it('tombstones with the id alone', async () => {
    const { result, cloudDecks, getDeck, storage } = run({
      queue: { gone: 'tombstone' },
      decks: [],
    })

    await expect(result).resolves.toEqual({
      ok: true,
      completed: 1,
      remaining: 0,
    })
    expect(cloudDecks?.tombstone).toHaveBeenCalledWith('gone')
    // No local read is needed for a tombstone.
    expect(getDeck).not.toHaveBeenCalled()
    expect(remaining(storage)).toEqual({})
  })

  it('works through several entries in the order they failed', async () => {
    const { result, cloudDecks, storage } = run({
      queue: { a: 'upsert', b: 'tombstone' },
      decks: [deck('a')],
    })

    await expect(result).resolves.toEqual({
      ok: true,
      completed: 2,
      remaining: 0,
    })
    expect(cloudDecks?.upsert).toHaveBeenCalledWith(deck('a'))
    expect(cloudDecks?.tombstone).toHaveBeenCalledWith('b')
    expect(remaining(storage)).toEqual({})
  })

  it('does nothing when there is nothing pending', async () => {
    const { result, cloudDecks } = run({ queue: {} })

    await expect(result).resolves.toEqual({
      ok: true,
      completed: 0,
      remaining: 0,
    })
    expect(cloudDecks?.upsert).not.toHaveBeenCalled()
    expect(cloudDecks?.tombstone).not.toHaveBeenCalled()
  })

  // This is a retry, not a sync. It never asks the account what it holds.
  it('never reads from the cloud', async () => {
    const { result, cloudDecks } = run({ queue: { a: 'upsert' } })
    await result

    expect(cloudDecks?.listAll).not.toHaveBeenCalled()
    expect(cloudDecks?.listUpdatedSince).not.toHaveBeenCalled()
  })

  // Running it twice reaches the same place, because upsert is keyed by the
  // deck's own id and the queue empties as it goes.
  it('is safe to run again', async () => {
    const storage = memoryStorage()
    writePendingDeckSync({ a: 'upsert' }, storage, userA)
    const cloudDecks = cloudRepository()
    const options = {
      decks: { getDeck: vi.fn(async () => deck('a')) },
      cloudDecks,
      isSyncEnabled: () => true,
      namespace: userA,
      storage,
    }

    await retryPendingDeckSync(options)
    await retryPendingDeckSync(options)

    expect(cloudDecks.upsert).toHaveBeenCalledTimes(1)
    expect(remaining(storage)).toEqual({})
  })
})

describe('when a send fails again', () => {
  it('keeps the entry and stops', async () => {
    const cloudDecks = cloudRepository({
      upsert: vi.fn(async () => ({
        ok: false as const,
        reason: 'network' as const,
      })),
    })
    const { result, storage } = run({
      queue: { a: 'upsert', b: 'tombstone' },
      cloudDecks,
    })

    await expect(result).resolves.toEqual({
      ok: false,
      reason: 'network',
      completed: 0,
      remaining: 2,
    })
    // Both survive: the one that failed, and the one never reached.
    expect(remaining(storage)).toEqual({ a: 'upsert', b: 'tombstone' })
    expect(cloudDecks.tombstone).not.toHaveBeenCalled()
  })

  it('keeps what it already finished', async () => {
    let calls = 0
    const cloudDecks = cloudRepository({
      upsert: vi.fn(async (value: Deck) => {
        calls += 1
        return calls > 1
          ? { ok: false as const, reason: 'network' as const }
          : { ok: true as const, value: record(value.id) }
      }),
    })
    const { result, storage } = run({
      queue: { a: 'upsert', b: 'upsert' },
      decks: [deck('a'), deck('b')],
      cloudDecks,
    })

    await expect(result).resolves.toEqual({
      ok: false,
      reason: 'network',
      completed: 1,
      remaining: 1,
    })
    expect(remaining(storage)).toEqual({ b: 'upsert' })
  })

  // Nothing matching means the account does not hold the deck, which is what
  // the tombstone was asking for, so the entry has done its job.
  it('treats a tombstone with nothing to delete as done', async () => {
    const cloudDecks = cloudRepository({
      tombstone: vi.fn(async () => ({
        ok: false as const,
        reason: 'not-found' as const,
      })),
    })
    const { result, storage } = run({
      queue: { gone: 'tombstone' },
      cloudDecks,
    })

    await expect(result).resolves.toEqual({
      ok: true,
      completed: 1,
      remaining: 0,
    })
    expect(remaining(storage)).toEqual({})
  })
})

describe('an upsert for a deck this device no longer has', () => {
  // Turning it into a tombstone would delete from the account on a guess, and
  // deleting a deck nobody asked to delete is the worst outcome available.
  it('is dropped without sending anything', async () => {
    const { result, cloudDecks, storage } = run({
      queue: { missing: 'upsert' },
      decks: [],
    })

    await expect(result).resolves.toEqual({
      ok: true,
      completed: 1,
      remaining: 0,
    })
    expect(cloudDecks?.upsert).not.toHaveBeenCalled()
    expect(cloudDecks?.tombstone).not.toHaveBeenCalled()
    expect(remaining(storage)).toEqual({})
  })
})

describe('when it must not run at all', () => {
  it('does nothing while sync is not enabled', async () => {
    const { result, cloudDecks, storage } = run({
      queue: { a: 'upsert' },
      enabled: false,
    })

    await expect(result).resolves.toEqual({
      ok: true,
      completed: 0,
      remaining: 0,
    })
    expect(cloudDecks?.upsert).not.toHaveBeenCalled()
    // The queue is left for when sync is on again.
    expect(remaining(storage)).toEqual({ a: 'upsert' })
  })

  it('does nothing without a cloud repository', async () => {
    const { result } = run({ queue: { a: 'upsert' }, cloudDecks: null })

    await expect(result).resolves.toEqual({
      ok: true,
      completed: 0,
      remaining: 0,
    })
  })

  // An anonymous visitor has no namespaced queue, so there is nothing to read.
  it('does nothing for an anonymous visitor', async () => {
    const storage = memoryStorage()
    const cloudDecks = cloudRepository()

    await expect(
      retryPendingDeckSync({
        decks: { getDeck: vi.fn(async () => deck('a')) },
        cloudDecks,
        isSyncEnabled: () => true,
        namespace: ANONYMOUS_LOCAL_DATA_NAMESPACE,
        storage,
      }),
    ).resolves.toEqual({ ok: true, completed: 0, remaining: 0 })
    expect(cloudDecks.upsert).not.toHaveBeenCalled()
  })

  // Deleting from the account is always a tombstone; the account holds no
  // delete privilege at all.
  it('never asks for a physical delete', async () => {
    const cloudDecks = cloudRepository()
    const { result } = run({
      queue: { a: 'upsert', b: 'tombstone' },
      cloudDecks,
    })
    await result

    expect(Object.keys(cloudDecks)).not.toContain('delete')
    expect(cloudDecks.tombstone).toHaveBeenCalledWith('b')
  })
})

describe('accounts are separate', () => {
  it('sends only the queue belonging to the account it was given', async () => {
    const storage = memoryStorage()
    const userB = userLocalDataNamespace('user-b')
    writePendingDeckSync({ a: 'upsert' }, storage, userA)
    writePendingDeckSync({ b: 'upsert' }, storage, userB)
    const cloudDecks = cloudRepository()

    await retryPendingDeckSync({
      decks: { getDeck: vi.fn(async (id: string) => deck(id)) },
      cloudDecks,
      isSyncEnabled: () => true,
      namespace: userB,
      storage,
    })

    expect(cloudDecks.upsert).toHaveBeenCalledTimes(1)
    expect(cloudDecks.upsert).toHaveBeenCalledWith(deck('b'))
    // The other account's queue is untouched.
    expect(readPendingDeckSync(storage, userA)).toEqual({ a: 'upsert' })
  })
})

/**
 * Reported per entry rather than per run, so a retry that sends some of the
 * queue and then fails still records that this device got something up.
 */
describe('reporting what actually reached the account', () => {
  it('reports each entry that was accepted', async () => {
    const { result, uploaded } = run({
      queue: { a: 'upsert', b: 'tombstone' },
      decks: [deck('a')],
    })
    await result

    expect(uploaded).toHaveBeenCalledTimes(2)
  })

  it('reports the entries sent before a failure, and no more', async () => {
    const cloudDecks = cloudRepository({
      upsert: vi.fn(async (value: Deck) =>
        value.id === 'a'
          ? { ok: true as const, value: record('a') }
          : { ok: false as const, reason: 'network' as const },
      ),
    })
    const { result, uploaded } = run({
      queue: { a: 'upsert', b: 'upsert' },
      decks: [deck('a'), deck('b')],
      cloudDecks,
    })
    await result

    expect(uploaded).toHaveBeenCalledTimes(1)
  })

  it('reports nothing when the first entry is refused', async () => {
    const cloudDecks = cloudRepository({
      upsert: vi.fn(async () => ({
        ok: false as const,
        reason: 'network' as const,
      })),
    })
    const { result, uploaded } = run({ queue: { a: 'upsert' }, cloudDecks })
    await result

    expect(uploaded).not.toHaveBeenCalled()
  })

  // The entry is resolved, but nothing went up: the account never had the row.
  it('reports nothing for a tombstone the account does not know about', async () => {
    const cloudDecks = cloudRepository({
      tombstone: vi.fn(async () => ({
        ok: false as const,
        reason: 'not-found' as const,
      })),
    })
    const { result, uploaded } = run({ queue: { a: 'tombstone' }, cloudDecks })
    await expect(result).resolves.toEqual({
      ok: true,
      completed: 1,
      remaining: 0,
    })

    expect(uploaded).not.toHaveBeenCalled()
  })

  // Dropped without sending, so there is nothing to report either.
  it('reports nothing for an upsert whose deck is gone', async () => {
    const { result, cloudDecks, uploaded } = run({
      queue: { gone: 'upsert' },
      decks: [],
    })
    await result

    expect(cloudDecks?.upsert).not.toHaveBeenCalled()
    expect(uploaded).not.toHaveBeenCalled()
  })

  it('reports nothing when sync is off', async () => {
    const { result, uploaded } = run({ queue: { a: 'upsert' }, enabled: false })
    await result

    expect(uploaded).not.toHaveBeenCalled()
  })
})
