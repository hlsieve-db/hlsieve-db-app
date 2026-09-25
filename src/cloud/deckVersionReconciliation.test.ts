import { describe, expect, it, vi } from 'vitest'

import type { Deck } from '../domain/decks/types'
import type { DeckVersion } from '../domain/deckVersions/types'
import type { DeckVersionRepository } from '../repositories/deckVersionRepository'
import type { CloudDeckRepository } from './cloudDeckRepository'
import type { CloudDeckVersionRepository } from './cloudDeckVersionRepository'
import { reconcileDeckVersions } from './deckVersionReconciliation'

const parent: Deck = {
  id: 'deck-1',
  name: 'Deck',
  entries: [],
  createdAt: '2026-09-25T00:00:00.000Z',
  updatedAt: '2026-09-25T00:00:00.000Z',
}

const version = (overrides: Partial<DeckVersion> = {}): DeckVersion => ({
  id: 'version-1',
  deckId: parent.id,
  label: 'Snapshot',
  createdAt: '2026-09-25T01:00:00.000Z',
  snapshot: { name: parent.name, entries: [] },
  ...overrides,
})

const parentRecord = (overrides: Record<string, unknown> = {}) => ({
  id: parent.id,
  deck: parent,
  createdAt: '2026-09-25T00:00:00.000Z',
  updatedAt: '2026-09-25T00:00:00.000Z',
  deletedAt: null,
  ...overrides,
})

function harness({
  local = [],
  cloud = [],
  parents = [parentRecord()],
}: {
  local?: DeckVersion[]
  cloud?: { version: DeckVersion; deletedAt: string | null }[]
  parents?: ReturnType<typeof parentRecord>[]
} = {}) {
  const records = new Map(local.map((value) => [value.id, value]))
  const versions = {
    listAllVersions: vi.fn(async () => [...records.values()]),
    saveVersion: vi.fn(async (value: DeckVersion) => {
      records.set(value.id, value)
    }),
    deleteVersion: vi.fn(async (id: string) => {
      records.delete(id)
    }),
  } as Pick<
    DeckVersionRepository,
    'listAllVersions' | 'saveVersion' | 'deleteVersion'
  >
  const cloudVersions: CloudDeckVersionRepository = {
    listAll: vi.fn(async () => ({ ok: true as const, value: cloud })),
    insert: vi.fn(async (value) => ({
      ok: true as const,
      value: { record: { version: value, deletedAt: null }, mutated: true },
    })),
    tombstone: vi.fn(),
  }
  const cloudDecks = {
    listAll: vi.fn(async () => ({ ok: true, value: parents })),
  } as unknown as CloudDeckRepository
  const decks = { listDecks: vi.fn(async () => [parent]) }
  return { records, versions, cloudVersions, cloudDecks, decks }
}

describe('DeckVersion reconciliation', () => {
  it('uploads a local-only Version after its parent is resolved', async () => {
    const h = harness({ local: [version()] })
    const result = await reconcileDeckVersions(h)
    expect(result).toMatchObject({ ok: true, uploaded: 1 })
    expect(h.cloudVersions.insert).toHaveBeenCalledWith(version())
  })

  it('restores a cloud-only Version only under a resolved local parent', async () => {
    const h = harness({ cloud: [{ version: version(), deletedAt: null }] })
    const result = await reconcileDeckVersions(h)
    expect(result).toMatchObject({ ok: true, restored: 1 })
    expect(h.records.get('version-1')).toEqual(version())
  })

  it('defers children while the parent is missing or tombstoned', async () => {
    const h = harness({
      local: [version()],
      parents: [parentRecord({ deletedAt: '2026-09-25T02:00:00.000Z' })],
    })
    const result = await reconcileDeckVersions(h)
    expect(result).toMatchObject({ ok: true, uploaded: 0, deferred: 1 })
    expect(h.cloudVersions.insert).not.toHaveBeenCalled()
  })

  it('does nothing when both immutable copies are identical', async () => {
    const h = harness({
      local: [version()],
      cloud: [{ version: version(), deletedAt: null }],
    })
    const result = await reconcileDeckVersions(h)
    expect(result).toMatchObject({ ok: true, uploaded: 0, restored: 0 })
    expect(h.cloudVersions.insert).not.toHaveBeenCalled()
    expect(h.versions.saveVersion).not.toHaveBeenCalled()
  })

  it('lets a cloud tombstone remove the local Version', async () => {
    const h = harness({
      local: [version()],
      cloud: [{ version: version(), deletedAt: '2026-09-25T02:00:00.000Z' }],
    })
    const result = await reconcileDeckVersions(h)
    expect(result).toMatchObject({ ok: true, removed: 1 })
    expect(h.records.has('version-1')).toBe(false)
  })

  it('blocks every write on a same-id immutable mismatch', async () => {
    const h = harness({
      local: [version()],
      cloud: [{ version: version({ label: 'Different' }), deletedAt: null }],
    })
    const result = await reconcileDeckVersions(h)
    expect(result).toMatchObject({ ok: false, reason: 'integrity-conflict' })
    expect(h.versions.saveVersion).not.toHaveBeenCalled()
    expect(h.versions.deleteVersion).not.toHaveBeenCalled()
    expect(h.cloudVersions.insert).not.toHaveBeenCalled()
  })

  it('never restores an active cloud row over a pending tombstone', async () => {
    const h = harness({ cloud: [{ version: version(), deletedAt: null }] })
    const result = await reconcileDeckVersions({
      ...h,
      pending: {
        isTombstone: () => true,
        recordUpload: vi.fn(),
        clear: vi.fn(),
      },
    })
    expect(result).toMatchObject({ ok: true, restored: 0 })
    expect(h.records.size).toBe(0)
  })

  it('uploads in deterministic Version id order', async () => {
    const h = harness({
      local: [version({ id: 'z' }), version({ id: 'a' })],
    })
    await reconcileDeckVersions(h)
    expect(
      vi.mocked(h.cloudVersions.insert).mock.calls.map(([value]) => value.id),
    ).toEqual(['a', 'z'])
  })
})
