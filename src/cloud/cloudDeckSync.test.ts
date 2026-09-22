import { describe, expect, it, vi } from 'vitest'

import type { Deck } from '../domain/decks/types'
import type {
  CloudDeckRecord,
  CloudDeckRepository,
  CloudDeckResult,
} from './cloudDeckRepository'
import {
  syncLocalDecksToCloud,
  type CloudDeckSyncProgress,
} from './cloudDeckSync'

function deck(id: string): Deck {
  return {
    id,
    name: `デッキ ${id}`,
    entries: [{ cardNumber: 'hBP04-042', quantity: 4 }],
    createdAt: '2026-09-22T00:00:00.000Z',
    updatedAt: '2026-09-22T00:00:00.000Z',
  }
}

function record(deckValue: Deck): CloudDeckRecord {
  return {
    id: deckValue.id,
    deck: deckValue,
    createdAt: '2026-09-22T04:00:00.000000+00:00',
    updatedAt: '2026-09-22T04:00:00.000000+00:00',
    deletedAt: null,
  }
}

function cloudRepository(
  upsert: (deck: Deck) => Promise<CloudDeckResult<CloudDeckRecord>>,
): CloudDeckRepository {
  return {
    listAll: vi.fn(async () => ({ ok: true as const, value: [] })),
    listUpdatedSince: vi.fn(async () => ({ ok: true as const, value: [] })),
    upsert: vi.fn(upsert),
    tombstone: vi.fn(async () => ({
      ok: false as const,
      reason: 'not-found' as const,
    })),
  }
}

const succeeds = () =>
  cloudRepository(async (value) => ({ ok: true, value: record(value) }))

function localDecks(decks: Deck[]) {
  return { listDecks: vi.fn(async () => decks) }
}

describe('uploading what is on this device', () => {
  it('writes every local deck to the account', async () => {
    const decks = Array.from({ length: 10 }, (_, index) =>
      deck(`deck-${index}`),
    )
    const cloudDecks = succeeds()

    const result = await syncLocalDecksToCloud({
      decks: localDecks(decks),
      cloudDecks,
    })

    expect(result).toEqual({ ok: true, uploaded: 10 })
    expect(cloudDecks.upsert).toHaveBeenCalledTimes(10)
    decks.forEach((value) =>
      expect(cloudDecks.upsert).toHaveBeenCalledWith(value),
    )
  })

  it('sends the deck exactly as it is stored', async () => {
    const cloudDecks = succeeds()
    const original = deck('deck-1')

    await syncLocalDecksToCloud({ decks: localDecks([original]), cloudDecks })

    expect(cloudDecks.upsert).toHaveBeenCalledWith(original)
  })

  // Nothing to send is not a failure, and the account should not be asked to
  // try again.
  it('succeeds with no decks at all', async () => {
    const cloudDecks = succeeds()

    const result = await syncLocalDecksToCloud({
      decks: localDecks([]),
      cloudDecks,
    })

    expect(result).toEqual({ ok: true, uploaded: 0 })
    expect(cloudDecks.upsert).not.toHaveBeenCalled()
  })

  // upsert clears deleted_at, so a deck the cloud had tombstoned comes back.
  // Local is the truth: the deck is here, so the account should have it.
  it('revives a deck the cloud holds as a tombstone', async () => {
    const cloudDecks = succeeds()

    await syncLocalDecksToCloud({
      decks: localDecks([deck('deleted-elsewhere')]),
      cloudDecks,
    })

    expect(cloudDecks.upsert).toHaveBeenCalledWith(deck('deleted-elsewhere'))
    // Nothing is read or removed; the sync only writes.
    expect(cloudDecks.listAll).not.toHaveBeenCalled()
    expect(cloudDecks.tombstone).not.toHaveBeenCalled()
  })

  it('never reads from or deletes in the cloud', async () => {
    const cloudDecks = succeeds()

    await syncLocalDecksToCloud({
      decks: localDecks([deck('a'), deck('b')]),
      cloudDecks,
    })

    expect(cloudDecks.listAll).not.toHaveBeenCalled()
    expect(cloudDecks.listUpdatedSince).not.toHaveBeenCalled()
    expect(cloudDecks.tombstone).not.toHaveBeenCalled()
  })
})

describe('when an upload fails', () => {
  it('stops at the failure and reports how far it got', async () => {
    let calls = 0
    const cloudDecks = cloudRepository(async (value) => {
      calls += 1
      return calls > 3
        ? { ok: false, reason: 'network' }
        : { ok: true, value: record(value) }
    })

    const result = await syncLocalDecksToCloud({
      decks: localDecks(Array.from({ length: 10 }, (_, i) => deck(`d-${i}`))),
      cloudDecks,
    })

    expect(result).toEqual({ ok: false, reason: 'network', uploaded: 3 })
    // It does not keep firing at a server that already refused.
    expect(cloudDecks.upsert).toHaveBeenCalledTimes(4)
  })

  it.each([
    ['unauthenticated'],
    ['forbidden'],
    ['network'],
    ['invalid-data'],
    ['failed'],
  ])('passes %s through unchanged', async (reason) => {
    const cloudDecks = cloudRepository(async () => ({
      ok: false,
      reason: reason as never,
    }))

    const result = await syncLocalDecksToCloud({
      decks: localDecks([deck('a')]),
      cloudDecks,
    })

    expect(result).toEqual({ ok: false, reason, uploaded: 0 })
  })

  // Every upload is an upsert keyed by the deck's own id, so a second run
  // rewrites the same rows rather than duplicating them.
  it('can be run again after a failure without duplicating anything', async () => {
    const seen: string[] = []
    let failing = true
    const cloudDecks = cloudRepository(async (value) => {
      seen.push(value.id)
      if (failing && value.id === 'c') return { ok: false, reason: 'network' }
      return { ok: true, value: record(value) }
    })
    const decks = localDecks([deck('a'), deck('b'), deck('c'), deck('d')])

    const first = await syncLocalDecksToCloud({ decks, cloudDecks })
    expect(first).toEqual({ ok: false, reason: 'network', uploaded: 2 })

    failing = false
    const second = await syncLocalDecksToCloud({ decks, cloudDecks })

    expect(second).toEqual({ ok: true, uploaded: 4 })
    // a and b are written twice, which an upsert makes harmless.
    expect(seen).toEqual(['a', 'b', 'c', 'a', 'b', 'c', 'd'])
  })

  it('reports a local read failure without blaming the cloud', async () => {
    const cloudDecks = succeeds()
    const decks = {
      listDecks: vi.fn(async () => {
        throw new Error('indexeddb unavailable')
      }),
    }

    const result = await syncLocalDecksToCloud({ decks, cloudDecks })

    expect(result).toEqual({ ok: false, reason: 'failed', uploaded: 0 })
    expect(cloudDecks.upsert).not.toHaveBeenCalled()
  })
})

describe('when there is no cloud repository', () => {
  // Signed out, or a deployment with no Supabase configured.
  it('reports it as unavailable without touching the local store', async () => {
    const decks = localDecks([deck('a')])

    const result = await syncLocalDecksToCloud({ decks, cloudDecks: null })

    expect(result).toEqual({ ok: false, reason: 'unavailable', uploaded: 0 })
    expect(decks.listDecks).not.toHaveBeenCalled()
  })
})

describe('progress', () => {
  it('reports the total before starting and after each upload', async () => {
    const progress: CloudDeckSyncProgress[] = []

    await syncLocalDecksToCloud({
      decks: localDecks([deck('a'), deck('b'), deck('c')]),
      cloudDecks: succeeds(),
      onProgress: (value) => progress.push(value),
    })

    expect(progress).toEqual([
      { completed: 0, total: 3 },
      { completed: 1, total: 3 },
      { completed: 2, total: 3 },
      { completed: 3, total: 3 },
    ])
  })

  it('stops reporting once an upload fails', async () => {
    const progress: CloudDeckSyncProgress[] = []
    let calls = 0
    const cloudDecks = cloudRepository(async (value) => {
      calls += 1
      return calls > 1
        ? { ok: false, reason: 'network' }
        : { ok: true, value: record(value) }
    })

    await syncLocalDecksToCloud({
      decks: localDecks([deck('a'), deck('b'), deck('c')]),
      cloudDecks,
      onProgress: (value) => progress.push(value),
    })

    expect(progress).toEqual([
      { completed: 0, total: 3 },
      { completed: 1, total: 3 },
    ])
  })

  it('reports a total of zero for an account with no decks', async () => {
    const progress: CloudDeckSyncProgress[] = []

    await syncLocalDecksToCloud({
      decks: localDecks([]),
      cloudDecks: succeeds(),
      onProgress: (value) => progress.push(value),
    })

    expect(progress).toEqual([{ completed: 0, total: 0 }])
  })
})
