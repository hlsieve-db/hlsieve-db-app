import { describe, expect, it, vi } from 'vitest'

import type { Deck } from '../domain/decks/types'
import type { DeckBackupRepository } from '../repositories/deckRepository'
import type {
  CloudDeckRecord,
  CloudDeckRepository,
} from './cloudDeckRepository'
import {
  applyCloudDeckRestore,
  planCloudDeckRestore,
  readCloudDeckRestorePlan,
} from './cloudDeckRestore'

function deck(id: string, name = `デッキ ${id}`): Deck {
  return {
    id,
    name,
    entries: [{ cardNumber: 'hBP04-042', quantity: 4 }],
    createdAt: '2026-09-22T00:00:00.000Z',
    updatedAt: '2026-09-22T00:00:00.000Z',
  }
}

function record(
  id: string,
  { deletedAt = null, name }: { deletedAt?: string | null; name?: string } = {},
): CloudDeckRecord {
  return {
    id,
    deck: deck(id, name),
    createdAt: '2026-09-22T04:00:00.000000+00:00',
    updatedAt: '2026-09-22T04:00:00.000000+00:00',
    deletedAt,
  }
}

const TOMBSTONED = '2026-09-22T05:00:00.000000+00:00'

function localRepository(
  decks: Deck[] = [],
  overrides: Partial<DeckBackupRepository> = {},
): DeckBackupRepository {
  return {
    listDecks: vi.fn(async () => decks),
    getDeck: vi.fn(async () => undefined),
    saveDeck: vi.fn(async () => undefined),
    deleteDeck: vi.fn(async () => undefined),
    importDecks: vi.fn(async () => undefined),
    ...overrides,
  }
}

function cloudRepository(records: CloudDeckRecord[]): CloudDeckRepository {
  return {
    listAll: vi.fn(async () => ({ ok: true as const, value: records })),
    listUpdatedSince: vi.fn(async () => ({ ok: true as const, value: [] })),
    upsert: vi.fn(async () => ({
      ok: false as const,
      reason: 'failed' as const,
    })),
    tombstone: vi.fn(async () => ({
      ok: false as const,
      reason: 'failed' as const,
    })),
  }
}

describe('planning a restore', () => {
  it('brings down every active cloud deck', () => {
    const plan = planCloudDeckRestore([record('a'), record('b')], [])

    expect(plan.restore).toEqual([deck('a'), deck('b')])
    expect(plan.remove).toEqual([])
    expect(plan.localCount).toBe(0)
  })

  it('applies a tombstone as a deletion of the local deck', () => {
    const plan = planCloudDeckRestore(
      [record('gone', { deletedAt: TOMBSTONED })],
      [deck('gone')],
    )

    expect(plan.remove).toEqual(['gone'])
    expect(plan.restore).toEqual([])
  })

  // The tombstone is already true on this device, so there is nothing to do.
  it('ignores a tombstone for a deck this device does not have', () => {
    const plan = planCloudDeckRestore(
      [record('gone', { deletedAt: TOMBSTONED })],
      [deck('other')],
    )

    expect(plan.remove).toEqual([])
  })

  // The cloud not holding a deck is not the cloud saying it is gone. Treating
  // absence as deletion would destroy anything made here since the last upload.
  it('leaves a local deck the cloud has never heard of alone', () => {
    const plan = planCloudDeckRestore(
      [record('a')],
      [deck('a'), deck('local-only')],
    )

    expect(plan.restore).toEqual([deck('a')])
    expect(plan.remove).toEqual([])
  })

  // Restoring means taking the cloud copy. Merging is a separate problem.
  it('replaces a deck that exists on both sides', () => {
    const plan = planCloudDeckRestore(
      [record('a', { name: 'クラウド版' })],
      [deck('a', 'ローカル版')],
    )

    expect(plan.restore).toEqual([deck('a', 'クラウド版')])
  })

  // An account whose decks were all deleted still holds rows. Uploading over
  // them would resurrect them, so that is not the same as never having synced.
  it('counts every cloud row, tombstones included', () => {
    const plan = planCloudDeckRestore(
      [record('a'), record('gone', { deletedAt: TOMBSTONED })],
      [],
    )

    expect(plan.cloudRowCount).toBe(2)
    expect(plan.restore).toHaveLength(1)
  })

  it('reports no cloud rows for an account that has never synced', () => {
    expect(planCloudDeckRestore([], [deck('a')]).cloudRowCount).toBe(0)
  })

  it('reports how many decks this device has', () => {
    expect(planCloudDeckRestore([], [deck('a'), deck('b')]).localCount).toBe(2)
    expect(planCloudDeckRestore([], []).localCount).toBe(0)
  })

  it('handles an account with nothing in the cloud', () => {
    const plan = planCloudDeckRestore([], [deck('a')])

    expect(plan).toEqual({
      restore: [],
      remove: [],
      localCount: 1,
      cloudRowCount: 0,
    })
  })
})

describe('reading the plan', () => {
  it('combines the cloud rows with what is on this device', async () => {
    const result = await readCloudDeckRestorePlan({
      decks: localRepository([deck('keep')]),
      cloudDecks: cloudRepository([
        record('a'),
        record('keep', { deletedAt: TOMBSTONED }),
      ]),
    })

    expect(result).toEqual({
      ok: true,
      plan: {
        restore: [deck('a')],
        remove: ['keep'],
        localCount: 1,
        cloudRowCount: 2,
      },
    })
  })

  it('reports a cloud failure without touching anything', async () => {
    const cloudDecks = cloudRepository([])
    cloudDecks.listAll = vi.fn(async () => ({
      ok: false as const,
      reason: 'network' as const,
    }))
    const decks = localRepository()

    const result = await readCloudDeckRestorePlan({ decks, cloudDecks })

    expect(result).toEqual({ ok: false, reason: 'network' })
    expect(decks.saveDeck).not.toHaveBeenCalled()
    expect(decks.deleteDeck).not.toHaveBeenCalled()
  })

  it('reports a local read failure as failed', async () => {
    const decks = localRepository([], {
      listDecks: vi.fn(async () => {
        throw new Error('indexeddb unavailable')
      }),
    })

    const result = await readCloudDeckRestorePlan({
      decks,
      cloudDecks: cloudRepository([record('a')]),
    })

    expect(result).toEqual({ ok: false, reason: 'failed' })
  })

  // Signed out, or a deployment with no Supabase configured.
  it('reports no cloud repository as unavailable', async () => {
    const decks = localRepository()

    const result = await readCloudDeckRestorePlan({ decks, cloudDecks: null })

    expect(result).toEqual({ ok: false, reason: 'unavailable' })
    expect(decks.listDecks).not.toHaveBeenCalled()
  })
})

describe('applying a plan', () => {
  it('writes the restored decks and deletes the tombstoned ones', async () => {
    const decks = localRepository()

    const result = await applyCloudDeckRestore(
      {
        restore: [deck('a'), deck('b')],
        remove: ['gone'],
        localCount: 1,
        cloudRowCount: 0,
      },
      { decks },
    )

    expect(result).toEqual({ ok: true, restored: 2, removed: 1 })
    expect(decks.saveDeck).toHaveBeenCalledWith(deck('a'))
    expect(decks.saveDeck).toHaveBeenCalledWith(deck('b'))
    expect(decks.deleteDeck).toHaveBeenCalledWith('gone')
  })

  // Writing through the sync-wrapped repository would push every restored deck
  // straight back, so the caller hands in the plain local one and this only
  // ever uses its public methods.
  it('uses only the local repository, never the cloud', async () => {
    const decks = localRepository()

    await applyCloudDeckRestore(
      { restore: [deck('a')], remove: [], localCount: 0, cloudRowCount: 0 },
      { decks },
    )

    expect(decks.saveDeck).toHaveBeenCalledTimes(1)
    expect(decks.importDecks).not.toHaveBeenCalled()
  })

  it('does nothing for an empty plan', async () => {
    const decks = localRepository()

    const result = await applyCloudDeckRestore(
      { restore: [], remove: [], localCount: 0, cloudRowCount: 0 },
      { decks },
    )

    expect(result).toEqual({ ok: true, restored: 0, removed: 0 })
    expect(decks.saveDeck).not.toHaveBeenCalled()
    expect(decks.deleteDeck).not.toHaveBeenCalled()
  })

  it('stops and reports when a local write fails', async () => {
    const decks = localRepository([], {
      saveDeck: vi.fn(async (value: Deck) => {
        if (value.id === 'b') throw new Error('quota exceeded')
      }),
    })

    const result = await applyCloudDeckRestore(
      {
        restore: [deck('a'), deck('b'), deck('c')],
        remove: [],
        localCount: 0,
        cloudRowCount: 0,
      },
      { decks },
    )

    expect(result).toEqual({ ok: false, reason: 'failed' })
    expect(decks.saveDeck).toHaveBeenCalledTimes(2)
  })

  it('reports progress across both halves of the plan', async () => {
    const progress: { completed: number; total: number }[] = []

    await applyCloudDeckRestore(
      {
        restore: [deck('a')],
        remove: ['gone'],
        localCount: 1,
        cloudRowCount: 0,
      },
      { decks: localRepository(), onProgress: (value) => progress.push(value) },
    )

    expect(progress).toEqual([
      { completed: 0, total: 2 },
      { completed: 1, total: 2 },
      { completed: 2, total: 2 },
    ])
  })

  // Every write is the cloud's own copy, so a second run reaches the same end.
  it('can be applied again after a failure', async () => {
    let failing = true
    const decks = localRepository([], {
      saveDeck: vi.fn(async (value: Deck) => {
        if (failing && value.id === 'b') throw new Error('quota exceeded')
      }),
    })
    const plan = {
      restore: [deck('a'), deck('b')],
      remove: [],
      localCount: 0,
      cloudRowCount: 0,
    }

    expect(await applyCloudDeckRestore(plan, { decks })).toEqual({
      ok: false,
      reason: 'failed',
    })

    failing = false
    expect(await applyCloudDeckRestore(plan, { decks })).toEqual({
      ok: true,
      restored: 2,
      removed: 0,
    })
  })
})
