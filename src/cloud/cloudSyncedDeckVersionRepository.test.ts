import { describe, expect, it, vi } from 'vitest'

import type { Deck } from '../domain/decks/types'
import type { DeckVersion } from '../domain/deckVersions/types'
import type { DeckVersionRepository } from '../repositories/deckVersionRepository'
import type { CloudDeckVersionRepository } from './cloudDeckVersionRepository'
import { withCloudDeckVersionSync } from './cloudSyncedDeckVersionRepository'

const deck: Deck = {
  id: 'deck-1',
  name: 'Deck',
  entries: [],
  createdAt: '2026-09-25T00:00:00.000Z',
  updatedAt: '2026-09-25T00:00:00.000Z',
}

const version: DeckVersion = {
  id: 'version-1',
  deckId: deck.id,
  label: 'Before event',
  createdAt: '2026-09-25T01:00:00.000Z',
  snapshot: { name: deck.name, entries: [] },
}

function local(initial: DeckVersion[] = [version]) {
  const records = new Map(initial.map((value) => [value.id, value]))
  const repository: DeckVersionRepository = {
    listAllVersions: vi.fn(async () => [...records.values()]),
    listVersions: vi.fn(async (deckId) =>
      [...records.values()].filter((value) => value.deckId === deckId),
    ),
    getVersion: vi.fn(async (id) => records.get(id)),
    saveVersion: vi.fn(async (value) => {
      records.set(value.id, value)
    }),
    createVersion: vi.fn(async () => {
      records.set(version.id, version)
      return version
    }),
    deleteVersion: vi.fn(async (id) => {
      records.delete(id)
    }),
    deleteVersionsForDeck: vi.fn(async (deckId) => {
      for (const value of records.values()) {
        if (value.deckId === deckId) records.delete(value.id)
      }
    }),
  }
  return { repository, records }
}

function cloud(
  overrides: Partial<CloudDeckVersionRepository> = {},
): CloudDeckVersionRepository {
  return {
    listAll: vi.fn(async () => ({ ok: true as const, value: [] })),
    insert: vi.fn(async () => ({
      ok: true as const,
      value: { record: { version, deletedAt: null }, mutated: true },
    })),
    tombstone: vi.fn(async () => ({
      ok: true as const,
      value: {
        record: { version, deletedAt: '2026-09-25T02:00:00.000Z' },
        mutated: true,
      },
    })),
    ...overrides,
  }
}

describe('cloud-synced DeckVersion repository', () => {
  it('writes a tombstone intent before deleting locally', async () => {
    const order: string[] = []
    const store = local()
    vi.mocked(store.repository.deleteVersion).mockImplementation(async (id) => {
      order.push('local')
      store.records.delete(id)
    })
    const repository = withCloudDeckVersionSync({
      versions: store.repository,
      cloudVersions: cloud(),
      isSyncEnabled: () => true,
      pending: {
        record: () => {
          order.push('pending')
          return true
        },
        clear: vi.fn(),
      },
    })
    await repository.deleteVersion(version.id)
    expect(order).toEqual(['pending', 'local'])
  })

  it('preserves the local Version when the write-ahead intent cannot persist', async () => {
    const store = local()
    const cloudVersions = cloud()
    const repository = withCloudDeckVersionSync({
      versions: store.repository,
      cloudVersions,
      isSyncEnabled: () => true,
      pending: { record: () => false, clear: vi.fn() },
    })
    await expect(repository.deleteVersion(version.id)).rejects.toThrow(
      /deletion intent/,
    )
    expect(store.records.has(version.id)).toBe(true)
    expect(cloudVersions.tombstone).not.toHaveBeenCalled()
  })

  it('keeps the tombstone pending after the local delete if cloud fails', async () => {
    const store = local()
    const clear = vi.fn()
    const repository = withCloudDeckVersionSync({
      versions: store.repository,
      cloudVersions: cloud({
        tombstone: vi.fn(async () => ({
          ok: false as const,
          reason: 'network' as const,
        })),
      }),
      isSyncEnabled: () => true,
      pending: { record: () => true, clear },
    })
    await repository.deleteVersion(version.id)
    expect(store.records.has(version.id)).toBe(false)
    expect(clear).not.toHaveBeenCalled()
  })

  it('keeps the tombstone pending when cloud cannot prove the final state', async () => {
    const store = local()
    const clear = vi.fn()
    const repository = withCloudDeckVersionSync({
      versions: store.repository,
      cloudVersions: cloud({
        tombstone: vi.fn(async () => ({
          ok: false as const,
          reason: 'failed' as const,
        })),
      }),
      isSyncEnabled: () => true,
      pending: { record: () => true, clear },
    })

    await repository.deleteVersion(version.id)

    expect(store.records.has(version.id)).toBe(false)
    expect(clear).not.toHaveBeenCalled()
  })

  it('records failed uploads without updating the timestamp', async () => {
    const store = local([])
    const record = vi.fn(() => true)
    const success = vi.fn()
    const repository = withCloudDeckVersionSync({
      versions: store.repository,
      cloudVersions: cloud({
        insert: vi.fn(async () => ({
          ok: false as const,
          reason: 'network' as const,
        })),
      }),
      isSyncEnabled: () => true,
      pending: { record, clear: vi.fn() },
      onUploadSuccess: success,
    })
    await repository.createVersion(deck)
    expect(record).toHaveBeenCalledWith(version.id, 'upload', deck.id)
    expect(success).not.toHaveBeenCalled()
  })

  it('updates the timestamp after an actual Version mutation', async () => {
    const success = vi.fn()
    const repository = withCloudDeckVersionSync({
      versions: local([]).repository,
      cloudVersions: cloud(),
      isSyncEnabled: () => true,
      pending: { record: vi.fn(() => true), clear: vi.fn() },
      onUploadSuccess: success,
    })

    await repository.createVersion(deck)

    expect(success).toHaveBeenCalledTimes(1)
  })

  it('does not update the timestamp when the Version already exists', async () => {
    const success = vi.fn()
    const repository = withCloudDeckVersionSync({
      versions: local([]).repository,
      cloudVersions: cloud({
        insert: vi.fn(async () => ({
          ok: true as const,
          value: { record: { version, deletedAt: null }, mutated: false },
        })),
      }),
      isSyncEnabled: () => true,
      pending: { record: vi.fn(() => true), clear: vi.fn() },
      onUploadSuccess: success,
    })

    await repository.createVersion(deck)

    expect(success).not.toHaveBeenCalled()
  })

  it('is local-only when sync is disabled', async () => {
    const store = local([])
    const cloudVersions = cloud()
    const repository = withCloudDeckVersionSync({
      versions: store.repository,
      cloudVersions,
      isSyncEnabled: () => false,
      pending: { record: vi.fn(() => true), clear: vi.fn() },
    })
    await repository.createVersion(deck)
    expect(cloudVersions.insert).not.toHaveBeenCalled()
  })
})
