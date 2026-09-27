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
  CloudDeckOrganizationFailure,
  CloudDeckOrganizationRepository,
} from './cloudDeckOrganizationRepository'
import {
  createMissingTableMemo,
  withCloudDeckFolderSync,
  withCloudDeckOrganizationSync,
  withCloudDeckTagSync,
} from './cloudSyncedDeckOrganizationRepositories'

const AT = '2026-09-27T00:00:00.000Z'

const folder = (overrides: Partial<DeckFolder> = {}): DeckFolder => ({
  id: 'f1',
  name: '大会用',
  sortOrder: 0,
  createdAt: AT,
  updatedAt: AT,
  ...overrides,
})

const tag = (overrides: Partial<DeckTag> = {}): DeckTag => ({
  id: 't1',
  name: '赤',
  createdAt: AT,
  updatedAt: AT,
  ...overrides,
})

const organization = (
  overrides: Partial<DeckOrganization> = {},
): DeckOrganization => ({
  deckId: 'deck-1',
  tagIds: [],
  createdAt: AT,
  updatedAt: AT,
  ...overrides,
})

const written = {
  ok: true as const,
  value: { written: true, skippedTombstone: false },
}
const skipped = {
  ok: true as const,
  value: { written: false, skippedTombstone: true },
}

function cloudRepository(
  overrides: Partial<CloudDeckOrganizationRepository> = {},
): CloudDeckOrganizationRepository {
  return {
    listFolders: vi.fn(async () => ({ ok: true as const, value: [] })),
    listTags: vi.fn(async () => ({ ok: true as const, value: [] })),
    listOrganizations: vi.fn(async () => ({ ok: true as const, value: [] })),
    upsertFolder: vi.fn(async () => written),
    upsertTag: vi.fn(async () => written),
    upsertOrganization: vi.fn(async () => ({
      ok: true as const,
      value: {
        organization: organization(),
        createdAt: AT,
        updatedAt: AT,
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
        organization: organization(),
        createdAt: AT,
        updatedAt: AT,
        deletedAt: AT,
      },
    })),
    ...overrides,
  }
}

/** A queue a test can read back, in the shape the wrappers are given. */
function queue() {
  const entries = new Map<string, 'upsert' | 'tombstone'>()
  return {
    entries,
    record: vi.fn((key: string, operation: 'upsert' | 'tombstone') => {
      entries.set(key, operation)
    }),
    clear: vi.fn((key: string) => {
      entries.delete(key)
    }),
  }
}

function folderRepository(
  overrides: Partial<DeckFolderRepository> = {},
): DeckFolderRepository {
  return {
    listFolders: vi.fn(async () => []),
    getFolder: vi.fn(async () => undefined),
    saveFolder: vi.fn(async () => undefined),
    deleteFolder: vi.fn(async () => 0),
    saveFolderOrder: vi.fn(async () => undefined),
    ...overrides,
  }
}

function tagRepository(
  overrides: Partial<DeckTagRepository> = {},
): DeckTagRepository {
  return {
    listTags: vi.fn(async () => []),
    getTag: vi.fn(async () => undefined),
    saveTag: vi.fn(async () => undefined),
    deleteTag: vi.fn(async () => 0),
    ...overrides,
  }
}

function organizationRepository(
  overrides: Partial<DeckOrganizationRepository> = {},
): DeckOrganizationRepository {
  return {
    listOrganizations: vi.fn(async () => []),
    getOrganization: vi.fn(async () => undefined),
    saveOrganization: vi.fn(async () => undefined),
    deleteOrganization: vi.fn(async () => undefined),
    ...overrides,
  }
}

/** Resolves once the wrapper has reported an outcome, so a test can await it. */
function settled() {
  let resolve: () => void = () => undefined
  const done = new Promise<void>((value) => {
    resolve = value
  })
  return { done, onSyncResult: () => resolve() }
}

const failing = (
  reason: CloudDeckOrganizationFailure,
): { ok: false; reason: CloudDeckOrganizationFailure } => ({
  ok: false,
  reason,
})

describe('sending a folder', () => {
  it('writes locally first, then sends it', async () => {
    const folders = folderRepository()
    const cloud = cloudRepository()
    const pending = queue()
    const { done, onSyncResult } = settled()
    const repository = withCloudDeckFolderSync({
      folders,
      cloud,
      isSyncEnabled: () => true,
      pending,
      onSyncResult,
    })

    await repository.saveFolder(folder())

    // Local is done by the time the call returns.
    expect(folders.saveFolder).toHaveBeenCalledWith(folder())
    await done
    expect(cloud.upsertFolder).toHaveBeenCalledWith(folder())
    expect(pending.entries.size).toBe(0)
  })

  it('remembers a folder the account refused', async () => {
    const cloud = cloudRepository({
      upsertFolder: vi.fn(async () => failing('network')),
    })
    const pending = queue()
    const { done, onSyncResult } = settled()

    await withCloudDeckFolderSync({
      folders: folderRepository(),
      cloud,
      isSyncEnabled: () => true,
      pending,
      onSyncResult,
    }).saveFolder(folder())

    await done
    expect(pending.entries.get('f1')).toBe('upsert')
  })

  // A deleted definition stays deleted. The write is settled rather than kept,
  // because retrying it could never succeed.
  it('stops holding a write the account skipped as a tombstone', async () => {
    const cloud = cloudRepository({ upsertFolder: vi.fn(async () => skipped) })
    const pending = queue()
    pending.entries.set('f1', 'upsert')
    const { done, onSyncResult } = settled()

    await withCloudDeckFolderSync({
      folders: folderRepository(),
      cloud,
      isSyncEnabled: () => true,
      pending,
      onSyncResult,
    }).saveFolder(folder())

    await done
    expect(pending.entries.size).toBe(0)
  })

  it('sends nothing when the local write fails', async () => {
    const cloud = cloudRepository()
    const folders = folderRepository({
      saveFolder: vi.fn(async () => {
        throw new Error('invalid')
      }),
    })

    await expect(
      withCloudDeckFolderSync({
        folders,
        cloud,
        isSyncEnabled: () => true,
        pending: queue(),
      }).saveFolder(folder()),
    ).rejects.toThrow('invalid')
    expect(cloud.upsertFolder).not.toHaveBeenCalled()
  })

  it('sends every folder of a reorder, one at a time', async () => {
    const cloud = cloudRepository()
    const order = [folder(), folder({ id: 'f2', name: '練習用', sortOrder: 1 })]
    let seen = 0
    const { done, onSyncResult } = settled()

    await withCloudDeckFolderSync({
      folders: folderRepository(),
      cloud,
      isSyncEnabled: () => true,
      pending: queue(),
      onSyncResult: () => {
        seen += 1
        if (seen === order.length) onSyncResult()
      },
    }).saveFolderOrder(order)

    await done
    expect(cloud.upsertFolder).toHaveBeenCalledTimes(2)
  })

  // The folder is gone locally, so an unsent write for it is no longer an
  // intent the reporter holds.
  it('drops a queued write for a folder it is deleting', async () => {
    const pending = queue()
    pending.entries.set('f1', 'upsert')
    const cloud = cloudRepository()
    const { done, onSyncResult } = settled()

    const changed = await withCloudDeckFolderSync({
      folders: folderRepository({ deleteFolder: vi.fn(async () => 2) }),
      cloud,
      isSyncEnabled: () => true,
      pending,
      onSyncResult,
    }).deleteFolder('f1')

    expect(changed).toBe(2)
    await done
    expect(cloud.tombstoneFolder).toHaveBeenCalledWith('f1')
    expect(pending.entries.size).toBe(0)
  })

  // Isolated from the send: with nothing to send, dropping the queued write is
  // the only thing deleting can do about it, and it still has to happen.
  it('drops the queued write even while sync is off', async () => {
    const pending = queue()
    pending.entries.set('f1', 'upsert')
    const cloud = cloudRepository()

    await withCloudDeckFolderSync({
      folders: folderRepository(),
      cloud,
      isSyncEnabled: () => false,
      pending,
    }).deleteFolder('f1')

    expect(pending.entries.size).toBe(0)
    expect(cloud.tombstoneFolder).not.toHaveBeenCalled()
  })

  it('drops the queued write for a tag even while sync is off', async () => {
    const pending = queue()
    pending.entries.set('t1', 'upsert')

    await withCloudDeckTagSync({
      tags: tagRepository(),
      cloud: cloudRepository(),
      isSyncEnabled: () => false,
      pending,
    }).deleteTag('t1')

    expect(pending.entries.size).toBe(0)
  })

  it('treats a folder the account never had as deleted already', async () => {
    const cloud = cloudRepository({
      tombstoneFolder: vi.fn(async () => failing('not-found')),
    })
    const pending = queue()
    const { done, onSyncResult } = settled()

    await withCloudDeckFolderSync({
      folders: folderRepository(),
      cloud,
      isSyncEnabled: () => true,
      pending,
      onSyncResult,
    }).deleteFolder('f1')

    await done
    expect(pending.entries.size).toBe(0)
  })

  it('says when the account has accepted a folder', async () => {
    const onFolderUploaded = vi.fn()
    const { done, onSyncResult } = settled()

    await withCloudDeckFolderSync({
      folders: folderRepository(),
      cloud: cloudRepository(),
      isSyncEnabled: () => true,
      pending: queue(),
      onSyncResult,
      onFolderUploaded,
    }).saveFolder(folder())

    await done
    expect(onFolderUploaded).toHaveBeenCalledWith('f1')
  })
})

describe('sending a tag', () => {
  it('sends it and clears the queue', async () => {
    const cloud = cloudRepository()
    const pending = queue()
    pending.entries.set('t1', 'upsert')
    const { done, onSyncResult } = settled()

    await withCloudDeckTagSync({
      tags: tagRepository(),
      cloud,
      isSyncEnabled: () => true,
      pending,
      onSyncResult,
    }).saveTag(tag())

    await done
    expect(cloud.upsertTag).toHaveBeenCalledWith(tag())
    expect(pending.entries.size).toBe(0)
  })

  it('drops a queued write for a tag it is deleting', async () => {
    const pending = queue()
    pending.entries.set('t1', 'upsert')
    const { done, onSyncResult } = settled()

    const changed = await withCloudDeckTagSync({
      tags: tagRepository({ deleteTag: vi.fn(async () => 3) }),
      cloud: cloudRepository(),
      isSyncEnabled: () => true,
      pending,
      onSyncResult,
    }).deleteTag('t1')

    expect(changed).toBe(3)
    await done
    expect(pending.entries.size).toBe(0)
  })
})

describe('sending what a deck is organized by', () => {
  it('sends it after writing it locally', async () => {
    const organizations = organizationRepository()
    const cloud = cloudRepository()
    const { done, onSyncResult } = settled()

    await withCloudDeckOrganizationSync({
      organizations,
      cloud,
      isSyncEnabled: () => true,
      pending: queue(),
      onSyncResult,
    }).saveOrganization(organization())

    expect(organizations.saveOrganization).toHaveBeenCalled()
    await done
    expect(cloud.upsertOrganization).toHaveBeenCalledWith(organization())
  })

  // The deck it names may not have reached the account yet, which that table
  // refuses. The entry is kept so the deck's own upload can clear it.
  it('remembers one the account refused', async () => {
    const cloud = cloudRepository({
      upsertOrganization: vi.fn(async () => failing('forbidden')),
    })
    const pending = queue()
    const { done, onSyncResult } = settled()

    await withCloudDeckOrganizationSync({
      organizations: organizationRepository(),
      cloud,
      isSyncEnabled: () => true,
      pending,
      onSyncResult,
    }).saveOrganization(organization())

    await done
    expect(pending.entries.get('deck-1')).toBe('upsert')
  })

  it('tombstones it when it is deleted', async () => {
    const cloud = cloudRepository()
    const { done, onSyncResult } = settled()

    await withCloudDeckOrganizationSync({
      organizations: organizationRepository(),
      cloud,
      isSyncEnabled: () => true,
      pending: queue(),
      onSyncResult,
    }).deleteOrganization('deck-1')

    await done
    expect(cloud.tombstoneOrganization).toHaveBeenCalledWith('deck-1')
  })
})

/**
 * Until the migration is applied, the account has no tables for any of this.
 * A write with nowhere to go is not an unsent change: it is a change that will
 * be sent the first time there is somewhere to send it.
 */
describe('while the account has no such tables', () => {
  it('keeps nothing queued', async () => {
    const cloud = cloudRepository({
      upsertFolder: vi.fn(async () => failing('missing-table')),
    })
    const pending = queue()
    const { done, onSyncResult } = settled()

    await withCloudDeckFolderSync({
      folders: folderRepository(),
      cloud,
      isSyncEnabled: () => true,
      pending,
      onSyncResult,
    }).saveFolder(folder())

    await done
    expect(pending.entries.size).toBe(0)
    expect(pending.record).not.toHaveBeenCalled()
  })

  it('reports nothing as having reached the account', async () => {
    const onUploadSuccess = vi.fn()
    const cloud = cloudRepository({
      upsertTag: vi.fn(async () => failing('missing-table')),
    })
    const { done, onSyncResult } = settled()

    await withCloudDeckTagSync({
      tags: tagRepository(),
      cloud,
      isSyncEnabled: () => true,
      pending: queue(),
      onSyncResult,
      onUploadSuccess,
    }).saveTag(tag())

    await done
    expect(onUploadSuccess).not.toHaveBeenCalled()
  })

  // One answer is enough: a folder rename should not fire a request that is
  // known to fail. A reload asks again, which is how it starts working once the
  // migration is applied.
  it('stops asking for the rest of the page', async () => {
    const cloud = cloudRepository({
      upsertFolder: vi.fn(async () => failing('missing-table')),
    })
    const { done, onSyncResult } = settled()
    const repository = withCloudDeckFolderSync({
      folders: folderRepository(),
      cloud,
      isSyncEnabled: () => true,
      pending: queue(),
      onSyncResult,
    })

    await repository.saveFolder(folder())
    await done
    await repository.saveFolder(folder({ name: '二度目' }))

    expect(cloud.upsertFolder).toHaveBeenCalledTimes(1)
  })

  it('quiets the other kinds too, since they share the answer', async () => {
    const cloud = cloudRepository({
      upsertFolder: vi.fn(async () => failing('missing-table')),
    })
    const missingTable = createMissingTableMemo()
    const { done, onSyncResult } = settled()
    const folders = withCloudDeckFolderSync({
      folders: folderRepository(),
      cloud,
      isSyncEnabled: () => true,
      pending: queue(),
      missingTable,
      onSyncResult,
    })
    const organizations = withCloudDeckOrganizationSync({
      organizations: organizationRepository(),
      cloud,
      isSyncEnabled: () => true,
      pending: queue(),
      missingTable,
    })

    await folders.saveFolder(folder())
    await done
    await organizations.saveOrganization(organization())

    expect(cloud.upsertOrganization).not.toHaveBeenCalled()
  })

  // An unsent write is recoverable; a lost one is not.
  it('still queues a failure it does not recognise', async () => {
    const cloud = cloudRepository({
      upsertFolder: vi.fn(async () => failing('failed')),
    })
    const pending = queue()
    const { done, onSyncResult } = settled()

    await withCloudDeckFolderSync({
      folders: folderRepository(),
      cloud,
      isSyncEnabled: () => true,
      pending,
      onSyncResult,
    }).saveFolder(folder())

    await done
    expect(pending.entries.get('f1')).toBe('upsert')
  })
})

describe('when sync is off', () => {
  it('sends nothing and queues nothing', async () => {
    const cloud = cloudRepository()
    const pending = queue()
    const folders = withCloudDeckFolderSync({
      folders: folderRepository(),
      cloud,
      isSyncEnabled: () => false,
      pending,
    })

    await folders.saveFolder(folder())
    await folders.deleteFolder('f1')

    expect(cloud.upsertFolder).not.toHaveBeenCalled()
    expect(cloud.tombstoneFolder).not.toHaveBeenCalled()
    expect(pending.record).not.toHaveBeenCalled()
  })

  it('keeps working with no cloud repository at all', async () => {
    const organizations = organizationRepository()
    const repository = withCloudDeckOrganizationSync({
      organizations,
      cloud: null,
      isSyncEnabled: () => true,
      pending: queue(),
    })

    await expect(
      repository.saveOrganization(organization()),
    ).resolves.toBeUndefined()
    expect(organizations.saveOrganization).toHaveBeenCalled()
  })

  it('leaves reads untouched', async () => {
    const folders = folderRepository({
      listFolders: vi.fn(async () => [folder()]),
    })
    const repository = withCloudDeckFolderSync({
      folders,
      cloud: cloudRepository(),
      isSyncEnabled: () => true,
      pending: queue(),
    })

    expect(await repository.listFolders()).toEqual([folder()])
    expect(await repository.getFolder('f1')).toBeUndefined()
  })
})
