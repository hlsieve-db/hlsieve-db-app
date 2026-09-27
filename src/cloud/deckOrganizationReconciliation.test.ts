import { describe, expect, it, vi } from 'vitest'

import type {
  DeckFolder,
  DeckOrganization,
  DeckTag,
} from '../domain/deckOrganization/types'
import type { DeckFolderRepository } from '../repositories/deckFolderRepository'
import type { DeckOrganizationRepository } from '../repositories/deckOrganizationRepository'
import type { DeckTagRepository } from '../repositories/deckTagRepository'
import type {
  CloudDeckFolderRecord,
  CloudDeckOrganizationRecord,
  CloudDeckOrganizationRepository,
  CloudDeckTagRecord,
} from './cloudDeckOrganizationRepository'
import {
  applyDeckOrganizationReconciliation,
  planDeckOrganizationReconciliation,
  type DeckOrganizationReconciliationInput,
  type DeckOrganizationReconciliationPlan,
} from './deckOrganizationReconciliation'

const APP_AT = '2026-09-27T00:00:00.000Z'
const SERVER_AT = '2026-09-27T04:56:42.700791+00:00'
const SERVER_LATER = '2026-09-28T04:56:42.700791+00:00'

const folder = (
  id: string,
  name: string,
  sortOrder = 0,
  at = APP_AT,
): DeckFolder => ({ id, name, sortOrder, createdAt: at, updatedAt: at })

const tag = (id: string, name: string, at = APP_AT): DeckTag => ({
  id,
  name,
  createdAt: at,
  updatedAt: at,
})

const organization = (
  deckId: string,
  overrides: Partial<DeckOrganization> = {},
): DeckOrganization => ({
  deckId,
  tagIds: [],
  createdAt: APP_AT,
  updatedAt: APP_AT,
  ...overrides,
})

const folderRow = (
  value: DeckFolder,
  deletedAt: string | null = null,
): CloudDeckFolderRecord => ({
  folder: { ...value, createdAt: SERVER_AT, updatedAt: SERVER_AT },
  createdAt: SERVER_AT,
  updatedAt: SERVER_AT,
  deletedAt,
})

const tagRow = (
  value: DeckTag,
  deletedAt: string | null = null,
): CloudDeckTagRecord => ({
  tag: { ...value, createdAt: SERVER_AT, updatedAt: SERVER_AT },
  createdAt: SERVER_AT,
  updatedAt: SERVER_AT,
  deletedAt,
})

const organizationRow = (
  value: DeckOrganization,
  deletedAt: string | null = null,
): CloudDeckOrganizationRecord => ({
  organization: { ...value, createdAt: SERVER_AT, updatedAt: SERVER_AT },
  createdAt: SERVER_AT,
  updatedAt: SERVER_AT,
  deletedAt,
})

function plan(
  input: Omit<Partial<DeckOrganizationReconciliationInput>, 'localDeckIds'> & {
    localDeckIds?: Iterable<string>
  } = {},
): DeckOrganizationReconciliationPlan {
  return planDeckOrganizationReconciliation({
    local: { folders: [], tags: [], organizations: [], ...input.local },
    cloud: { folders: [], tags: [], organizations: [], ...input.cloud },
    localDeckIds: new Set(input.localDeckIds ?? ['deck-1', 'deck-2']),
    hasUnsentFolderChanges: input.hasUnsentFolderChanges ?? false,
  })
}

describe('what each side has that the other does not', () => {
  // The account not holding something is not the account saying it was deleted.
  it('keeps what only this device has, and never removes it', () => {
    const result = plan({
      local: {
        folders: [folder('f1', '大会用')],
        tags: [tag('t1', '赤')],
        organizations: [organization('deck-1', { folderId: 'f1' })],
      },
    })

    expect(result.folders.localOnly.map((value) => value.id)).toEqual(['f1'])
    expect(result.tags.localOnly.map((value) => value.id)).toEqual(['t1'])
    expect(result.organizations.localOnly.map((value) => value.deckId)).toEqual(
      ['deck-1'],
    )
    expect(result.conflicts).toEqual([])
  })

  it('takes what only the account has', () => {
    const result = plan({
      cloud: {
        folders: [folderRow(folder('f1', '大会用'))],
        tags: [tagRow(tag('t1', '赤'))],
        organizations: [organizationRow(organization('deck-1'))],
      },
    })

    expect(result.folders.cloudOnly.map((value) => value.id)).toEqual(['f1'])
    expect(result.tags.cloudOnly.map((value) => value.id)).toEqual(['t1'])
    expect(result.organizations.cloudOnly).toHaveLength(1)
  })

  it('counts every row the account holds, tombstones included', () => {
    const result = plan({
      cloud: {
        folders: [folderRow(folder('f1', '一'), SERVER_AT)],
        tags: [tagRow(tag('t1', '赤'))],
        organizations: [organizationRow(organization('deck-1'))],
      },
    })

    expect(result.cloudRowCount).toBe(3)
  })
})

describe('comparing a folder or a tag', () => {
  /**
   * These tables merge the app's own timestamps with the row's sync times, so a
   * round trip replaces them. Comparing whole objects would report every row as
   * a conflict the first time a second device syncs.
   */
  it('ignores the timestamps entirely', () => {
    const result = plan({
      local: {
        folders: [folder('f1', '大会用', 0, APP_AT)],
        tags: [tag('t1', '赤', APP_AT)],
        organizations: [organization('deck-1', { tagIds: ['t1'] })],
      },
      cloud: {
        folders: [folderRow(folder('f1', '大会用'))],
        tags: [tagRow(tag('t1', '赤'))],
        organizations: [
          organizationRow(organization('deck-1', { tagIds: ['t1'] })),
        ],
      },
    })

    expect(result.conflicts).toEqual([])
    expect(result.folders.identical).toHaveLength(1)
    expect(result.tags.identical).toHaveLength(1)
    expect(result.organizations.identical).toHaveLength(1)
  })

  it('treats width and case as the same name, as the rest of the app does', () => {
    const result = plan({
      local: { folders: [folder('f1', 'ＡＢＣ')], tags: [], organizations: [] },
      cloud: {
        folders: [folderRow(folder('f1', 'abc'))],
        tags: [],
        organizations: [],
      },
    })

    expect(result.conflicts).toEqual([])
  })

  it('asks about a name the two sides disagree on, with the decks affected', () => {
    const result = plan({
      local: {
        folders: [folder('f1', '大会用')],
        tags: [],
        organizations: [
          organization('deck-1', { folderId: 'f1' }),
          organization('deck-2', { folderId: 'f1' }),
        ],
      },
      cloud: {
        folders: [folderRow(folder('f1', '本番用'))],
        tags: [],
        organizations: [
          organizationRow(organization('deck-1', { folderId: 'f1' })),
        ],
      },
    })

    expect(result.conflicts).toEqual([
      {
        kind: 'folder-name',
        id: 'f1',
        localFolder: folder('f1', '大会用'),
        cloudFolder: expect.objectContaining({ name: '本番用' }),
        localDeckCount: 2,
        cloudDeckCount: 1,
      },
    ])
  })

  it('asks about a tag name the same way', () => {
    const result = plan({
      local: {
        folders: [],
        tags: [tag('t1', '赤')],
        organizations: [organization('deck-1', { tagIds: ['t1'] })],
      },
      cloud: {
        folders: [],
        tags: [tagRow(tag('t1', 'レッド'))],
        organizations: [],
      },
    })

    expect(result.conflicts[0]).toMatchObject({
      kind: 'tag-name',
      id: 't1',
      localDeckCount: 1,
      cloudDeckCount: 0,
    })
  })

  // Two devices can each create the same name offline. Both survive.
  it('leaves two ids sharing one name alone', () => {
    const result = plan({
      local: {
        folders: [folder('mine', '大会用')],
        tags: [],
        organizations: [],
      },
      cloud: {
        folders: [folderRow(folder('theirs', '大会用'))],
        tags: [],
        organizations: [],
      },
    })

    expect(result.conflicts).toEqual([])
    expect(result.folders.localOnly.map((value) => value.id)).toEqual(['mine'])
    expect(result.folders.cloudOnly.map((value) => value.id)).toEqual([
      'theirs',
    ])
  })
})

/**
 * Reordering rewrites every folder, so one folder's position says nothing on its
 * own. Whose order wins is decided by whether this device still has folder
 * changes it could not send — not by comparing a server clock with a device
 * clock, which a wrong clock would turn into a wrong answer.
 */
describe('whose order applies', () => {
  const twoSides = {
    local: {
      folders: [folder('f1', '大会用', 0), folder('f2', '練習用', 1)],
      tags: [],
      organizations: [],
    },
    cloud: {
      folders: [
        folderRow(folder('f1', '大会用', 1)),
        folderRow(folder('f2', '練習用', 0)),
      ],
      tags: [],
      organizations: [],
    },
  }

  it('takes the account’s order when this device has nothing unsent', () => {
    const result = plan({ ...twoSides, hasUnsentFolderChanges: false })

    expect(
      result.folders.reordered.map((value) => [value.id, value.sortOrder]),
    ).toEqual([
      ['f1', 1],
      ['f2', 0],
    ])
    expect(result.conflicts).toEqual([])
  })

  // The account has not seen this device's order yet, so it cannot be newer.
  it('keeps this device’s order while a folder change is unsent', () => {
    const result = plan({ ...twoSides, hasUnsentFolderChanges: true })

    expect(result.folders.reordered).toEqual([])
    expect(
      result.folders.identical.map((value) => [value.id, value.sortOrder]),
    ).toEqual([
      ['f1', 0],
      ['f2', 1],
    ])
  })

  it('is never a conflict either way', () => {
    expect(
      plan({ ...twoSides, hasUnsentFolderChanges: true }).conflicts,
    ).toEqual([])
    expect(
      plan({ ...twoSides, hasUnsentFolderChanges: false }).conflicts,
    ).toEqual([])
  })
})

describe('what the account has deleted', () => {
  // A deleted definition stays deleted: an offline device reconnecting with a
  // folder it has not heard about must not resurrect it for everyone.
  it('removes a deleted folder or tag here, without asking', () => {
    const result = plan({
      local: {
        folders: [folder('f1', '大会用')],
        tags: [tag('t1', '赤')],
        organizations: [],
      },
      cloud: {
        folders: [folderRow(folder('f1', '大会用'), SERVER_LATER)],
        tags: [tagRow(tag('t1', '赤'), SERVER_LATER)],
        organizations: [],
      },
    })

    expect(result.folders.tombstoned).toEqual(['f1'])
    expect(result.tags.tombstoned).toEqual(['t1'])
    expect(result.conflicts).toEqual([])
  })

  it('says nothing about a deleted folder this device never had', () => {
    const result = plan({
      cloud: {
        folders: [folderRow(folder('f1', '大会用'), SERVER_LATER)],
        tags: [],
        organizations: [],
      },
    })

    expect(result.folders.tombstoned).toEqual([])
    expect(result.folders.cloudOnly).toEqual([])
  })

  // Unlike a definition, this is a real disagreement, as it is for a deck.
  it('asks about a deleted organization this device still has', () => {
    const result = plan({
      local: {
        folders: [],
        tags: [],
        organizations: [organization('deck-1', { tagIds: [] })],
      },
      cloud: {
        folders: [],
        tags: [],
        organizations: [organizationRow(organization('deck-1'), SERVER_LATER)],
      },
    })

    expect(result.conflicts).toEqual([
      {
        kind: 'organization-tombstone',
        id: 'deck-1',
        localOrganization: organization('deck-1'),
      },
    ])
  })

  it('applies a deleted organization this device does not have', () => {
    const result = plan({
      cloud: {
        folders: [],
        tags: [],
        organizations: [organizationRow(organization('deck-1'), SERVER_LATER)],
      },
    })

    expect(result.organizations.tombstoned).toEqual(['deck-1'])
  })
})

describe('an organization whose deck is not here', () => {
  it('is not taken, because it has nothing to describe', () => {
    const result = plan({
      cloud: {
        folders: [],
        tags: [],
        organizations: [organizationRow(organization('deck-9'))],
      },
      localDeckIds: ['deck-1'],
    })

    expect(result.organizations.orphaned).toEqual(['deck-9'])
    expect(result.organizations.cloudOnly).toEqual([])
  })

  /**
   * A tab loaded before the newer deletion function existed tombstones the deck
   * and its versions but leaves the organization active. That row must not come
   * back as an organization for a deck that is gone.
   */
  it('is not taken when the deck itself was deleted', () => {
    const result = plan({
      cloud: {
        folders: [],
        tags: [],
        organizations: [organizationRow(organization('deck-old'))],
      },
      localDeckIds: ['deck-1'],
    })

    expect(result.organizations.orphaned).toEqual(['deck-old'])
  })
})

describe('references that will not resolve', () => {
  // The local rule is that every reference resolves, so a row from the account
  // is trimmed before it is stored rather than stored broken.
  it('drops a folder nothing will define, and says so', () => {
    const result = plan({
      cloud: {
        folders: [],
        tags: [],
        organizations: [
          organizationRow(organization('deck-1', { folderId: 'gone' })),
        ],
      },
    })

    expect(result.organizations.cloudOnly[0]).toEqual({
      deckId: 'deck-1',
      tagIds: [],
      createdAt: SERVER_AT,
      updatedAt: SERVER_AT,
    })
    expect(result.organizations.normalizations).toEqual([
      { deckId: 'deck-1', droppedFolderId: 'gone', droppedTagIds: [] },
    ])
  })

  it('drops the tags nothing will define, keeping the rest', () => {
    const result = plan({
      local: { folders: [], tags: [tag('t1', '赤')], organizations: [] },
      cloud: {
        folders: [],
        tags: [tagRow(tag('t1', '赤'))],
        organizations: [
          organizationRow(organization('deck-1', { tagIds: ['t1', 'gone'] })),
        ],
      },
    })

    expect(result.organizations.cloudOnly[0]?.tagIds).toEqual(['t1'])
    expect(result.organizations.normalizations).toEqual([
      { deckId: 'deck-1', droppedTagIds: ['gone'] },
    ])
  })

  // The folder the row names is being removed in this same plan.
  it('drops a folder the account has deleted', () => {
    const result = plan({
      local: { folders: [folder('f1', '大会用')], tags: [], organizations: [] },
      cloud: {
        folders: [folderRow(folder('f1', '大会用'), SERVER_LATER)],
        tags: [],
        organizations: [
          organizationRow(organization('deck-1', { folderId: 'f1' })),
        ],
      },
    })

    expect(result.organizations.cloudOnly[0]?.folderId).toBeUndefined()
    expect(result.organizations.normalizations[0]?.droppedFolderId).toBe('f1')
  })

  it('keeps a folder only this device has', () => {
    const result = plan({
      local: { folders: [folder('f1', '大会用')], tags: [], organizations: [] },
      cloud: {
        folders: [],
        tags: [],
        organizations: [
          organizationRow(organization('deck-1', { folderId: 'f1' })),
        ],
      },
    })

    expect(result.organizations.cloudOnly[0]?.folderId).toBe('f1')
    expect(result.organizations.normalizations).toEqual([])
  })
})

describe('comparing what a deck is organized by', () => {
  it('ignores the order and repeats in the stored tags', () => {
    const result = plan({
      local: {
        folders: [],
        tags: [tag('t1', '赤'), tag('t2', '青')],
        organizations: [organization('deck-1', { tagIds: ['t1', 't2'] })],
      },
      cloud: {
        folders: [],
        tags: [tagRow(tag('t1', '赤')), tagRow(tag('t2', '青'))],
        organizations: [
          organizationRow({
            ...organization('deck-1'),
            tagIds: ['t2', 't1', 't2'],
          }),
        ],
      },
    })

    expect(result.conflicts).toEqual([])
    expect(result.organizations.identical).toHaveLength(1)
  })

  // Folder and tags together: choosing them apart offers no useful answer.
  it('asks once about the whole assignment', () => {
    const result = plan({
      local: {
        folders: [folder('f1', '大会用'), folder('f2', '練習用', 1)],
        tags: [tag('t1', '赤')],
        organizations: [
          organization('deck-1', { folderId: 'f1', tagIds: ['t1'] }),
        ],
      },
      cloud: {
        folders: [
          folderRow(folder('f1', '大会用')),
          folderRow(folder('f2', '練習用', 1)),
        ],
        tags: [tagRow(tag('t1', '赤'))],
        organizations: [
          organizationRow(
            organization('deck-1', { folderId: 'f2', tagIds: [] }),
          ),
        ],
      },
    })

    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]).toMatchObject({
      kind: 'organization-assignment',
      id: 'deck-1',
    })
  })
})

function localStores() {
  const folders: DeckFolderRepository = {
    listFolders: vi.fn(async () => []),
    getFolder: vi.fn(async () => undefined),
    saveFolder: vi.fn(async () => undefined),
    deleteFolder: vi.fn(async () => 0),
    saveFolderOrder: vi.fn(async () => undefined),
  }
  const tags: DeckTagRepository = {
    listTags: vi.fn(async () => []),
    getTag: vi.fn(async () => undefined),
    saveTag: vi.fn(async () => undefined),
    deleteTag: vi.fn(async () => 0),
  }
  const organizations: DeckOrganizationRepository = {
    listOrganizations: vi.fn(async () => []),
    getOrganization: vi.fn(async () => undefined),
    saveOrganization: vi.fn(async () => undefined),
    deleteOrganization: vi.fn(async () => undefined),
  }
  return { folders, tags, organizations }
}

function cloudStore(
  overrides: Partial<CloudDeckOrganizationRepository> = {},
): CloudDeckOrganizationRepository {
  return {
    listFolders: vi.fn(async () => ({ ok: true as const, value: [] })),
    listTags: vi.fn(async () => ({ ok: true as const, value: [] })),
    listOrganizations: vi.fn(async () => ({ ok: true as const, value: [] })),
    upsertFolder: vi.fn(async () => ({
      ok: true as const,
      value: { written: true, skippedTombstone: false },
    })),
    upsertTag: vi.fn(async () => ({
      ok: true as const,
      value: { written: true, skippedTombstone: false },
    })),
    upsertOrganization: vi.fn(async () => ({
      ok: true as const,
      value: {
        organization: organization('deck-1'),
        createdAt: SERVER_AT,
        updatedAt: SERVER_AT,
        deletedAt: null,
      },
    })),
    tombstoneFolder: vi.fn(async () => ({
      ok: true as const,
      value: { organizationsCleared: 0 },
    })),
    tombstoneTag: vi.fn(async () => ({
      ok: true as const,
      value: { organizationsCleared: 0 },
    })),
    tombstoneOrganization: vi.fn(async () => ({
      ok: true as const,
      value: {
        organization: organization('deck-1'),
        createdAt: SERVER_AT,
        updatedAt: SERVER_AT,
        deletedAt: SERVER_AT,
      },
    })),
    ...overrides,
  }
}

function queues() {
  const calls: string[] = []
  const make = (kind: string) => ({
    record: vi.fn((id: string, operation: string) => {
      calls.push(`${kind}:record:${id}:${operation}`)
    }),
    clear: vi.fn((id: string) => {
      calls.push(`${kind}:clear:${id}`)
    }),
  })
  return {
    calls,
    folders: make('folder'),
    tags: make('tag'),
    organizations: make('organization'),
  }
}

/**
 * Sending what only this device has is not part of reading the account: it is
 * the first upload, and the button that repeats it, asking for exactly that.
 */
describe('sending what only this device has', () => {
  const localSide = {
    local: {
      folders: [folder('f1', '大会用')],
      tags: [tag('t1', '赤')],
      organizations: [
        organization('deck-1', { folderId: 'f1', tagIds: ['t1'] }),
      ],
    },
  }

  it('sends nothing unless the caller asks for it', async () => {
    const cloud = cloudStore()

    await applyDeckOrganizationReconciliation(
      plan(localSide),
      {},
      {
        local: localStores(),
        cloud,
      },
    )

    expect(cloud.upsertFolder).not.toHaveBeenCalled()
    expect(cloud.upsertTag).not.toHaveBeenCalled()
    expect(cloud.upsertOrganization).not.toHaveBeenCalled()
  })

  it('sends the definitions before the rows that name them', async () => {
    const order: string[] = []
    const cloud = cloudStore({
      upsertFolder: vi.fn(async () => {
        order.push('folder')
        return {
          ok: true as const,
          value: { written: true, skippedTombstone: false },
        }
      }),
      upsertTag: vi.fn(async () => {
        order.push('tag')
        return {
          ok: true as const,
          value: { written: true, skippedTombstone: false },
        }
      }),
      upsertOrganization: vi.fn(async () => {
        order.push('organization')
        return {
          ok: true as const,
          value: {
            organization: organization('deck-1'),
            createdAt: SERVER_AT,
            updatedAt: SERVER_AT,
            deletedAt: null,
          },
        }
      }),
    })

    const result = await applyDeckOrganizationReconciliation(
      plan(localSide),
      {},
      { local: localStores(), cloud, uploadLocalOnly: true },
    )

    expect(order).toEqual(['folder', 'tag', 'organization'])
    expect(result.uploaded).toBe(3)
  })

  // The write goes through the function that refuses to revive one.
  it('does not revive a definition the account holds as a tombstone', async () => {
    const cloud = cloudStore({
      upsertFolder: vi.fn(async () => ({
        ok: true as const,
        value: { written: false, skippedTombstone: true },
      })),
    })

    const result = await applyDeckOrganizationReconciliation(
      plan(localSide),
      {},
      { local: localStores(), cloud, uploadLocalOnly: true },
    )

    // The tag and the organization still counted; the folder did not.
    expect(result.uploaded).toBe(2)
  })

  it('remembers what the account refused, and carries on', async () => {
    const pending = queues()
    const cloud = cloudStore({
      upsertFolder: vi.fn(async () => ({
        ok: false as const,
        reason: 'network' as const,
      })),
    })

    const result = await applyDeckOrganizationReconciliation(
      plan(localSide),
      {},
      { local: localStores(), cloud, pending, uploadLocalOnly: true },
    )

    expect(pending.calls).toContain('folder:record:f1:upsert')
    expect(result.failure).toBe('network')
    expect(cloud.upsertTag).toHaveBeenCalled()
  })
})

describe('applying what the account has, and what the reporter chose', () => {
  /**
   * The deletion came from the account. Writing it through a wrapped store would
   * send it back as this device's own deletion, and the same goes for every row
   * taken from the account.
   */
  it('sends nothing to the account when it only applies what came from it', async () => {
    const local = localStores()
    const cloud = cloudStore()
    const pending = queues()
    const result = await applyDeckOrganizationReconciliation(
      plan({
        local: {
          folders: [folder('f1', '大会用')],
          tags: [tag('t1', '赤')],
          organizations: [organization('deck-1')],
        },
        cloud: {
          folders: [
            folderRow(folder('f1', '大会用'), SERVER_LATER),
            folderRow(folder('f2', '練習用', 1)),
          ],
          tags: [
            tagRow(tag('t1', '赤'), SERVER_LATER),
            tagRow(tag('t2', '青')),
          ],
          organizations: [
            organizationRow(organization('deck-2', { tagIds: [] })),
          ],
        },
      }),
      {},
      { local, cloud, pending },
    )

    for (const call of Object.values(cloud)) {
      expect(call).not.toHaveBeenCalled()
    }
    expect(local.folders.deleteFolder).toHaveBeenCalledWith('f1')
    expect(local.tags.deleteTag).toHaveBeenCalledWith('t1')
    expect(local.folders.saveFolder).toHaveBeenCalled()
    expect(result).toMatchObject({ restored: 3, removed: 2, uploaded: 0 })
  })

  /**
   * Definitions first, then the rows that name them. The other order would store
   * a row pointing at a folder this device does not have yet, which is the one
   * state the local rules do not allow.
   */
  it('writes the definitions before the rows that name them', async () => {
    const order: string[] = []
    const local = localStores()
    local.folders.saveFolder = vi.fn(async () => {
      order.push('folder')
    })
    local.tags.saveTag = vi.fn(async () => {
      order.push('tag')
    })
    local.organizations.saveOrganization = vi.fn(async () => {
      order.push('organization')
    })
    local.folders.deleteFolder = vi.fn(async () => {
      order.push('folder-delete')
      return 0
    })

    await applyDeckOrganizationReconciliation(
      plan({
        local: {
          folders: [folder('gone', '消える')],
          tags: [],
          organizations: [],
        },
        cloud: {
          folders: [
            folderRow(folder('gone', '消える'), SERVER_LATER),
            folderRow(folder('f1', '大会用')),
          ],
          tags: [tagRow(tag('t1', '赤'))],
          organizations: [
            organizationRow(
              organization('deck-1', { folderId: 'f1', tagIds: ['t1'] }),
            ),
          ],
        },
      }),
      {},
      { local, cloud: cloudStore() },
    )

    expect(order).toEqual(['folder-delete', 'folder', 'tag', 'organization'])
  })

  it('keeps this device’s name when that is what was chosen', async () => {
    const local = localStores()
    const cloud = cloudStore()
    const pending = queues()
    const conflictPlan = plan({
      local: { folders: [folder('f1', '大会用')], tags: [], organizations: [] },
      cloud: {
        folders: [folderRow(folder('f1', '本番用'))],
        tags: [],
        organizations: [],
      },
    })

    const result = await applyDeckOrganizationReconciliation(
      conflictPlan,
      { 'folder-name:f1': 'local' },
      { local, cloud, pending },
    )

    expect(cloud.upsertFolder).toHaveBeenCalledWith(folder('f1', '大会用'))
    expect(local.folders.saveFolder).not.toHaveBeenCalled()
    expect(result).toMatchObject({ resolved: ['folder-name:f1'], uploaded: 1 })
    expect(pending.calls).toContain('folder:clear:f1')
  })

  // The name comes from the account; where the folder sits in the order does not.
  it('takes the account’s name while keeping this device’s place in the order', async () => {
    const local = localStores()
    const cloud = cloudStore()
    const conflictPlan = plan({
      local: {
        folders: [folder('f1', '大会用', 3)],
        tags: [],
        organizations: [],
      },
      cloud: {
        folders: [folderRow(folder('f1', '本番用', 0))],
        tags: [],
        organizations: [],
      },
    })

    await applyDeckOrganizationReconciliation(
      conflictPlan,
      { 'folder-name:f1': 'cloud' },
      { local, cloud },
    )

    expect(local.folders.saveFolder).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'f1', name: '本番用', sortOrder: 3 }),
    )
    expect(cloud.upsertFolder).not.toHaveBeenCalled()
  })

  it('leaves a conflict nobody chose outstanding', async () => {
    const conflictPlan = plan({
      local: { folders: [folder('f1', '大会用')], tags: [], organizations: [] },
      cloud: {
        folders: [folderRow(folder('f1', '本番用'))],
        tags: [],
        organizations: [],
      },
    })

    const result = await applyDeckOrganizationReconciliation(
      conflictPlan,
      {},
      { local: localStores(), cloud: cloudStore() },
    )

    expect(result.unresolved).toEqual(['folder-name:f1'])
    expect(result.resolved).toEqual([])
  })

  it('settles a whole assignment in one choice', async () => {
    const local = localStores()
    const cloud = cloudStore()
    const conflictPlan = plan({
      local: {
        folders: [folder('f1', '大会用'), folder('f2', '練習用', 1)],
        tags: [],
        organizations: [organization('deck-1', { folderId: 'f1' })],
      },
      cloud: {
        folders: [
          folderRow(folder('f1', '大会用')),
          folderRow(folder('f2', '練習用', 1)),
        ],
        tags: [],
        organizations: [
          organizationRow(organization('deck-1', { folderId: 'f2' })),
        ],
      },
    })

    await applyDeckOrganizationReconciliation(
      conflictPlan,
      { 'organization-assignment:deck-1': 'cloud' },
      { local, cloud },
    )

    expect(local.organizations.saveOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ deckId: 'deck-1', folderId: 'f2' }),
    )
    expect(cloud.upsertOrganization).not.toHaveBeenCalled()
  })

  it('accepts the account’s deletion of an organization when chosen', async () => {
    const local = localStores()
    const pending = queues()
    const conflictPlan = plan({
      local: { folders: [], tags: [], organizations: [organization('deck-1')] },
      cloud: {
        folders: [],
        tags: [],
        organizations: [organizationRow(organization('deck-1'), SERVER_LATER)],
      },
    })

    const result = await applyDeckOrganizationReconciliation(
      conflictPlan,
      { 'organization-tombstone:deck-1': 'cloud' },
      { local, cloud: cloudStore(), pending },
    )

    expect(local.organizations.deleteOrganization).toHaveBeenCalledWith(
      'deck-1',
    )
    expect(result.removed).toBe(1)
    expect(pending.calls).toContain('organization:clear:deck-1')
  })

  it('sends this device’s organization back up when that is chosen instead', async () => {
    const cloud = cloudStore()
    const conflictPlan = plan({
      local: { folders: [], tags: [], organizations: [organization('deck-1')] },
      cloud: {
        folders: [],
        tags: [],
        organizations: [organizationRow(organization('deck-1'), SERVER_LATER)],
      },
    })

    const result = await applyDeckOrganizationReconciliation(
      conflictPlan,
      { 'organization-tombstone:deck-1': 'local' },
      { local: localStores(), cloud },
    )

    expect(cloud.upsertOrganization).toHaveBeenCalledWith(
      organization('deck-1'),
    )
    expect(result.uploaded).toBe(1)
  })

  // A retry would otherwise act on an older intent for the same thing.
  it('keeps the unsent-change queue honest when a send fails', async () => {
    const pending = queues()
    const cloud = cloudStore({
      upsertOrganization: vi.fn(async () => ({
        ok: false as const,
        reason: 'network' as const,
      })),
    })
    const conflictPlan = plan({
      local: { folders: [], tags: [], organizations: [organization('deck-1')] },
      cloud: {
        folders: [],
        tags: [],
        organizations: [organizationRow(organization('deck-1'), SERVER_LATER)],
      },
    })

    const result = await applyDeckOrganizationReconciliation(
      conflictPlan,
      { 'organization-tombstone:deck-1': 'local' },
      { local: localStores(), cloud, pending },
    )

    expect(pending.calls).toContain('organization:record:deck-1:upsert')
    expect(result).toMatchObject({
      unresolved: ['organization-tombstone:deck-1'],
      failure: 'network',
    })
  })

  it('reports what worked even though something else failed', async () => {
    const cloud = cloudStore({
      upsertFolder: vi.fn(async () => ({
        ok: false as const,
        reason: 'forbidden' as const,
      })),
    })
    const conflictPlan = plan({
      local: {
        folders: [folder('f1', '大会用')],
        tags: [tag('t1', '赤')],
        organizations: [],
      },
      cloud: {
        folders: [folderRow(folder('f1', '本番用'))],
        tags: [tagRow(tag('t1', 'レッド'))],
        organizations: [],
      },
    })

    const result = await applyDeckOrganizationReconciliation(
      conflictPlan,
      { 'folder-name:f1': 'local', 'tag-name:t1': 'local' },
      { local: localStores(), cloud },
    )

    expect(result.resolved).toEqual(['tag-name:t1'])
    expect(result.unresolved).toEqual(['folder-name:f1'])
    expect(result.failure).toBe('forbidden')
  })

  it('writes one order for a reorder rather than one folder at a time', async () => {
    const local = localStores()
    const reorderPlan = plan({
      local: {
        folders: [folder('f1', '一', 0), folder('f2', '二', 1)],
        tags: [],
        organizations: [],
      },
      cloud: {
        folders: [
          folderRow(folder('f1', '一', 1)),
          folderRow(folder('f2', '二', 0)),
        ],
        tags: [],
        organizations: [],
      },
    })

    await applyDeckOrganizationReconciliation(
      reorderPlan,
      {},
      {
        local,
        cloud: cloudStore(),
      },
    )

    expect(local.folders.saveFolderOrder).toHaveBeenCalledTimes(1)
    expect(local.folders.saveFolder).not.toHaveBeenCalled()
  })

  it('can settle nothing when Cloud Sync is unavailable, and says so', async () => {
    const local = localStores()
    const conflictPlan = plan({
      local: { folders: [folder('f1', '大会用')], tags: [], organizations: [] },
      cloud: {
        folders: [folderRow(folder('f1', '本番用'))],
        tags: [],
        organizations: [],
      },
    })

    const result = await applyDeckOrganizationReconciliation(
      conflictPlan,
      { 'folder-name:f1': 'local' },
      { local, cloud: null },
    )

    expect(result.unresolved).toEqual(['folder-name:f1'])
    expect(local.folders.saveFolder).not.toHaveBeenCalled()
  })
})
