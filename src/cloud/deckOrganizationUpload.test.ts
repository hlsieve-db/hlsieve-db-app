import { describe, expect, it, vi } from 'vitest'

import type {
  DeckFolder,
  DeckOrganization,
  DeckTag,
} from '../domain/deckOrganization/types'
import type { CloudDeckOrganizationRepository } from './cloudDeckOrganizationRepository'
import { syncLocalDeckOrganizationToCloud } from './deckOrganizationUpload'

const AT = '2026-09-27T00:00:00.000Z'
const SERVER_AT = '2026-09-27T04:56:42.700791+00:00'

const folder = (id: string): DeckFolder => ({
  id,
  name: `フォルダー${id}`,
  sortOrder: 0,
  createdAt: AT,
  updatedAt: AT,
})

const tag = (id: string): DeckTag => ({
  id,
  name: `タグ${id}`,
  createdAt: AT,
  updatedAt: AT,
})

const organization = (deckId: string): DeckOrganization => ({
  deckId,
  tagIds: [],
  createdAt: AT,
  updatedAt: AT,
})

const written = {
  ok: true as const,
  value: { written: true, skippedTombstone: false },
}

function cloudRepository(
  overrides: Partial<CloudDeckOrganizationRepository> = {},
  order: string[] = [],
): CloudDeckOrganizationRepository {
  return {
    listFolders: vi.fn(async () => ({ ok: true as const, value: [] })),
    listTags: vi.fn(async () => ({ ok: true as const, value: [] })),
    listOrganizations: vi.fn(async () => ({ ok: true as const, value: [] })),
    upsertFolder: vi.fn(async () => {
      order.push('folder')
      return written
    }),
    upsertTag: vi.fn(async () => {
      order.push('tag')
      return written
    }),
    upsertOrganization: vi.fn(async (value: DeckOrganization) => {
      order.push('organization')
      return {
        ok: true as const,
        value: {
          organization: value,
          createdAt: SERVER_AT,
          updatedAt: SERVER_AT,
          deletedAt: null,
        },
      }
    }),
    tombstoneFolder: vi.fn(),
    tombstoneTag: vi.fn(),
    tombstoneOrganization: vi.fn(),
    ...overrides,
  } as CloudDeckOrganizationRepository
}

const everything = {
  folders: [folder('f1'), folder('f2')],
  tags: [tag('t1')],
  organizations: [organization('deck-1')],
}

describe('the first upload', () => {
  it('sends everything this device holds, and counts it', async () => {
    const cloud = cloudRepository()

    const result = await syncLocalDeckOrganizationToCloud({
      local: everything,
      cloud,
    })

    expect(result).toEqual({
      ok: true,
      uploaded: { folders: 2, tags: 1, organizations: 1 },
    })
    expect(cloud.upsertFolder).toHaveBeenCalledTimes(2)
  })

  /**
   * An organization names a folder the account has to hold already. Locally
   * every reference resolves, so sending the definitions first is enough to keep
   * it resolving there too.
   */
  it('sends the definitions before the rows that name them', async () => {
    const order: string[] = []

    await syncLocalDeckOrganizationToCloud({
      local: everything,
      cloud: cloudRepository({}, order),
    })

    expect(order).toEqual(['folder', 'folder', 'tag', 'organization'])
  })

  it('reads nothing from the account', async () => {
    const cloud = cloudRepository()

    await syncLocalDeckOrganizationToCloud({ local: everything, cloud })

    expect(cloud.listFolders).not.toHaveBeenCalled()
    expect(cloud.listTags).not.toHaveBeenCalled()
    expect(cloud.listOrganizations).not.toHaveBeenCalled()
  })

  it('finishes successfully with nothing to send', async () => {
    const cloud = cloudRepository()

    const result = await syncLocalDeckOrganizationToCloud({
      local: { folders: [], tags: [], organizations: [] },
      cloud,
    })

    expect(result).toEqual({
      ok: true,
      uploaded: { folders: 0, tags: 0, organizations: 0 },
    })
    expect(cloud.upsertFolder).not.toHaveBeenCalled()
  })

  // Carrying on would fire the rest at a server that has just refused.
  it('stops at the first refusal and says what got through', async () => {
    const order: string[] = []
    const cloud = cloudRepository(
      {
        upsertTag: vi.fn(async () => ({
          ok: false as const,
          reason: 'network' as const,
        })),
      },
      order,
    )

    const result = await syncLocalDeckOrganizationToCloud({
      local: everything,
      cloud,
    })

    expect(result).toEqual({
      ok: false,
      reason: 'network',
      uploaded: { folders: 2, tags: 0, organizations: 0 },
    })
    expect(order).not.toContain('organization')
  })

  // Nothing was written, and saying otherwise would overstate what the account
  // now has.
  it('does not count a definition the account keeps as a tombstone', async () => {
    const cloud = cloudRepository({
      upsertFolder: vi.fn(async () => ({
        ok: true as const,
        value: { written: false, skippedTombstone: true },
      })),
    })

    const result = await syncLocalDeckOrganizationToCloud({
      local: everything,
      cloud,
    })

    expect(result).toMatchObject({ ok: true, uploaded: { folders: 0 } })
  })

  it('is safe to run twice', async () => {
    const cloud = cloudRepository()

    const first = await syncLocalDeckOrganizationToCloud({
      local: everything,
      cloud,
    })
    const second = await syncLocalDeckOrganizationToCloud({
      local: everything,
      cloud,
    })

    expect(second).toEqual(first)
  })

  it('reports having nowhere to send it', async () => {
    const result = await syncLocalDeckOrganizationToCloud({
      local: everything,
      cloud: null,
    })

    expect(result).toEqual({
      ok: false,
      reason: 'unavailable',
      uploaded: { folders: 0, tags: 0, organizations: 0 },
    })
  })

  it('reports progress over everything it has to send', async () => {
    const progress: { completed: number; total: number }[] = []

    await syncLocalDeckOrganizationToCloud({
      local: everything,
      cloud: cloudRepository(),
      onProgress: (value) => progress.push(value),
    })

    expect(progress).toEqual([
      { completed: 0, total: 4 },
      { completed: 1, total: 4 },
      { completed: 2, total: 4 },
      { completed: 3, total: 4 },
      { completed: 4, total: 4 },
    ])
  })
})
