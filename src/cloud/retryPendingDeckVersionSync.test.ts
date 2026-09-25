import { describe, expect, it, vi } from 'vitest'

import type { Deck } from '../domain/decks/types'
import type { DeckVersion } from '../domain/deckVersions/types'
import {
  readPendingDeckVersionSync,
  recordPendingDeckVersionSync,
} from '../domain/cloud/pendingDeckVersionSync'
import { userLocalDataNamespace } from '../domain/storage/localDataNamespace'
import type { CloudDeckRepository } from './cloudDeckRepository'
import type { CloudDeckVersionRepository } from './cloudDeckVersionRepository'
import { retryPendingDeckVersionSync } from './retryPendingDeckVersionSync'

const namespace = userLocalDataNamespace('user-a')
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
  label: 'Snapshot',
  createdAt: '2026-09-25T01:00:00.000Z',
  snapshot: { name: deck.name, entries: [] },
}

function storage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

function options(store: ReturnType<typeof storage>) {
  const cloudVersions: CloudDeckVersionRepository = {
    listAll: vi.fn(async () => ({ ok: true as const, value: [] })),
    insert: vi.fn(async () => ({
      ok: true as const,
      value: { record: { version, deletedAt: null }, mutated: true },
    })),
    tombstone: vi.fn(async () => ({
      ok: true as const,
      value: { record: null, mutated: false },
    })),
  }
  const cloudDecks = {
    listAll: vi.fn(async () => ({
      ok: true,
      value: [
        {
          id: deck.id,
          deck,
          createdAt: deck.createdAt,
          updatedAt: deck.updatedAt,
          deletedAt: null,
        },
      ],
    })),
  } as unknown as CloudDeckRepository
  return {
    decks: { getDeck: vi.fn(async () => deck) },
    versions: {
      getVersion: vi.fn(async (id: string) =>
        id === version.id ? version : undefined,
      ),
      deleteVersion: vi.fn(async () => undefined),
    },
    cloudDecks,
    cloudVersions,
    isSyncEnabled: () => true,
    namespace,
    storage: store,
  }
}

describe('retrying pending DeckVersion operations', () => {
  it('sends tombstones before uploads regardless of insertion order', async () => {
    const store = storage()
    recordPendingDeckVersionSync(
      version.id,
      { operation: 'upload', deckId: deck.id },
      store,
      namespace,
    )
    recordPendingDeckVersionSync(
      'deleted-version',
      { operation: 'tombstone', deckId: deck.id },
      store,
      namespace,
    )
    const h = options(store)
    const calls: string[] = []
    vi.mocked(h.cloudVersions.tombstone).mockImplementation(async () => {
      calls.push('tombstone')
      return { ok: true, value: { record: null, mutated: false } }
    })
    vi.mocked(h.cloudVersions.insert).mockImplementation(async () => {
      calls.push('upload')
      return {
        ok: true,
        value: { record: { version, deletedAt: null }, mutated: true },
      }
    })
    await retryPendingDeckVersionSync(h)
    expect(calls).toEqual(['tombstone', 'upload'])
    expect(readPendingDeckVersionSync(store, namespace)).toEqual({})
  })

  it('keeps a failed tombstone queued', async () => {
    const store = storage()
    recordPendingDeckVersionSync(
      version.id,
      { operation: 'tombstone', deckId: deck.id },
      store,
      namespace,
    )
    const h = options(store)
    vi.mocked(h.cloudVersions.tombstone).mockResolvedValue({
      ok: false,
      reason: 'network',
    })
    expect(await retryPendingDeckVersionSync(h)).toMatchObject({ ok: false })
    expect(readPendingDeckVersionSync(store, namespace)).toHaveProperty(
      version.id,
    )
  })

  it('clears a stale upload whose local Version is gone', async () => {
    const store = storage()
    recordPendingDeckVersionSync(
      'missing',
      { operation: 'upload', deckId: deck.id },
      store,
      namespace,
    )
    const h = options(store)
    await retryPendingDeckVersionSync(h)
    expect(readPendingDeckVersionSync(store, namespace)).toEqual({})
    expect(h.cloudVersions.insert).not.toHaveBeenCalled()
  })

  it('defers upload while the parent is unresolved', async () => {
    const store = storage()
    recordPendingDeckVersionSync(
      version.id,
      { operation: 'upload', deckId: deck.id },
      store,
      namespace,
    )
    const h = options(store)
    vi.mocked(h.cloudDecks.listAll).mockResolvedValue({ ok: true, value: [] })
    expect(await retryPendingDeckVersionSync(h)).toEqual({
      ok: true,
      completed: 0,
      remaining: 1,
    })
    expect(h.cloudVersions.insert).not.toHaveBeenCalled()
  })
})
