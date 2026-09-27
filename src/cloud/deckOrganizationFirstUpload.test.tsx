import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Deck } from '../domain/decks/types'
import type {
  DeckFolder,
  DeckOrganization,
  DeckTag,
} from '../domain/deckOrganization/types'
import { hasUploadedDeckOrganization } from '../domain/cloud/deckOrganizationUploadState'
import { userLocalDataNamespace } from '../domain/storage/localDataNamespace'
import type { AppRepositories } from '../repositories/appRepositories'
import { AppRepositoriesContext } from '../repositories/appRepositoriesContext'
import type {
  CloudDeckFolderRecord,
  CloudDeckOrganizationRecord,
  CloudDeckTagRecord,
} from './cloudDeckOrganizationRepository'
import { CloudDeckSyncRetry } from './CloudDeckSyncRetry'

/**
 * The first upload for an account that turned Cloud Sync on before folders and
 * tags existed. It never reaches the moment where the upload would happen, so
 * the app looks for the work itself — once, and only where doing it blind is
 * safe.
 */

const userA = userLocalDataNamespace('user-a')
const ENABLED = '{"version":1,"status":"enabled"}'
const AT = '2026-09-27T00:00:00.000Z'
const SERVER_AT = '2026-09-27T04:56:42.700791+00:00'
const MARK_KEY = 'hlsieve:cloud-organization-uploaded--user-a'

const folder = (id: string, name = `フォルダー${id}`): DeckFolder => ({
  id,
  name,
  sortOrder: 0,
  createdAt: AT,
  updatedAt: AT,
})

const tag = (id: string, name = `タグ${id}`): DeckTag => ({
  id,
  name,
  createdAt: AT,
  updatedAt: AT,
})

const organization = (
  deckId: string,
  overrides: Partial<DeckOrganization> = {},
): DeckOrganization => ({
  deckId,
  tagIds: [],
  createdAt: AT,
  updatedAt: AT,
  ...overrides,
})

const folderRow = (
  value: DeckFolder,
  deletedAt: string | null = null,
): CloudDeckFolderRecord => ({
  folder: value,
  createdAt: SERVER_AT,
  updatedAt: SERVER_AT,
  deletedAt,
})

const tagRow = (
  value: DeckTag,
  deletedAt: string | null = null,
): CloudDeckTagRecord => ({
  tag: value,
  createdAt: SERVER_AT,
  updatedAt: SERVER_AT,
  deletedAt,
})

const organizationRow = (
  value: DeckOrganization,
): CloudDeckOrganizationRecord => ({
  organization: value,
  createdAt: SERVER_AT,
  updatedAt: SERVER_AT,
  deletedAt: null,
})

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  }
}

function renderRetry({
  marked = false,
  enabled = true,
  local = {
    folders: [folder('f1')],
    tags: [tag('t1')],
    organizations: [organization('deck-1')],
  },
  cloudRows = {
    folders: [] as CloudDeckFolderRecord[],
    tags: [] as CloudDeckTagRecord[],
    organizations: [] as CloudDeckOrganizationRecord[],
  },
  listFail = false,
  upsertFolderFails = false,
  cloudDeckOrganization,
}: {
  marked?: boolean
  enabled?: boolean
  local?: {
    folders: DeckFolder[]
    tags: DeckTag[]
    organizations: DeckOrganization[]
  }
  cloudRows?: {
    folders: CloudDeckFolderRecord[]
    tags: CloudDeckTagRecord[]
    organizations: CloudDeckOrganizationRecord[]
  }
  listFail?: boolean
  upsertFolderFails?: boolean
  cloudDeckOrganization?: unknown
} = {}) {
  const storage = memoryStorage({
    ...(enabled ? { 'hlsieve:cloud-sync--user-a': ENABLED } : {}),
    ...(marked
      ? { [MARK_KEY]: '{"version":1,"at":"2026-09-26T00:00:00.000Z"}' }
      : {}),
  })

  const written = {
    ok: true as const,
    value: { written: true, skippedTombstone: false },
  }
  const refused = { ok: false as const, reason: 'network' as const }
  const listAnswer = <T,>(value: T[]) =>
    listFail
      ? { ok: false as const, reason: 'missing-table' as const }
      : { ok: true as const, value }

  const cloud = cloudDeckOrganization ?? {
    listFolders: vi.fn(async () => listAnswer(cloudRows.folders)),
    listTags: vi.fn(async () => listAnswer(cloudRows.tags)),
    listOrganizations: vi.fn(async () => listAnswer(cloudRows.organizations)),
    upsertFolder: vi.fn(async () => (upsertFolderFails ? refused : written)),
    upsertTag: vi.fn(async () => written),
    upsertOrganization: vi.fn(async (value: DeckOrganization) => ({
      ok: true as const,
      value: {
        organization: value,
        createdAt: SERVER_AT,
        updatedAt: SERVER_AT,
        deletedAt: null,
      },
    })),
    tombstoneFolder: vi.fn(),
    tombstoneTag: vi.fn(),
    tombstoneOrganization: vi.fn(),
  }

  const repositories = {
    namespace: userA,
    localDecks: { getDeck: vi.fn(async () => undefined) },
    localDeckFolders: {
      getFolder: vi.fn(async () => undefined),
      listFolders: vi.fn(async () => local.folders),
    },
    localDeckTags: {
      getTag: vi.fn(async () => undefined),
      listTags: vi.fn(async () => local.tags),
    },
    localDeckOrganizations: {
      getOrganization: vi.fn(async () => undefined),
      listOrganizations: vi.fn(async () => local.organizations),
    },
    cloudDecks: {
      listAll: vi.fn(async () => ({ ok: true, value: [] as Deck[] })),
      listUpdatedSince: vi.fn(async () => ({ ok: true, value: [] })),
      upsert: vi.fn(),
      tombstone: vi.fn(),
    },
    cloudDeckOrganization: cloud,
  } as unknown as AppRepositories

  const onRetried = vi.fn()
  render(
    <AppRepositoriesContext.Provider value={repositories}>
      <CloudDeckSyncRetry storage={storage} onRetried={onRetried} />
    </AppRepositoriesContext.Provider>,
  )
  return {
    storage,
    cloud: cloud as Record<string, ReturnType<typeof vi.fn>>,
    onRetried,
  }
}

describe('offering this device’s folders and tags once', () => {
  it('uploads them when the account holds nothing at all', async () => {
    const { cloud, storage } = renderRetry()

    await waitFor(() => expect(cloud.upsertFolder).toHaveBeenCalled())
    expect(cloud.upsertTag).toHaveBeenCalled()
    expect(cloud.upsertOrganization).toHaveBeenCalled()
    await waitFor(() =>
      expect(hasUploadedDeckOrganization(storage, userA)).toBe(true),
    )
  })

  /**
   * One tombstone is enough to stop it: this device's organization may name a
   * folder the account deleted, and writing that row would hand every other
   * device an assignment nobody made.
   */
  it('uploads nothing when the account holds only tombstones', async () => {
    const { cloud, onRetried } = renderRetry({
      cloudRows: {
        folders: [folderRow(folder('gone'), SERVER_AT)],
        tags: [],
        organizations: [],
      },
    })

    await waitFor(() => expect(onRetried).toHaveBeenCalled())
    expect(cloud.upsertFolder).not.toHaveBeenCalled()
    expect(cloud.upsertOrganization).not.toHaveBeenCalled()
  })

  it('uploads nothing when the account already holds rows', async () => {
    const { cloud, onRetried, storage } = renderRetry({
      cloudRows: {
        folders: [folderRow(folder('theirs'))],
        tags: [],
        organizations: [],
      },
    })

    await waitFor(() => expect(onRetried).toHaveBeenCalled())
    expect(cloud.upsertFolder).not.toHaveBeenCalled()
    // Marked anyway: there is no migration left to do, and this saves reading
    // three tables on every load.
    await waitFor(() =>
      expect(hasUploadedDeckOrganization(storage, userA)).toBe(true),
    )
  })

  it('does not look again once it has been done', async () => {
    const { cloud, onRetried } = renderRetry({ marked: true })

    await waitFor(() => expect(onRetried).toHaveBeenCalled())
    expect(cloud.listFolders).not.toHaveBeenCalled()
    expect(cloud.upsertFolder).not.toHaveBeenCalled()
  })

  it('marks a device with nothing to offer, rather than asking again', async () => {
    const { cloud, storage } = renderRetry({
      local: { folders: [], tags: [], organizations: [] },
    })

    await waitFor(() =>
      expect(hasUploadedDeckOrganization(storage, userA)).toBe(true),
    )
    expect(cloud.upsertFolder).not.toHaveBeenCalled()
  })

  it('says nothing and marks nothing when the tables are not there yet', async () => {
    const { cloud, storage, onRetried } = renderRetry({ listFail: true })

    await waitFor(() => expect(onRetried).toHaveBeenCalled())
    expect(cloud.upsertFolder).not.toHaveBeenCalled()
    expect(hasUploadedDeckOrganization(storage, userA)).toBe(false)
  })

  it('does nothing while sync is off', async () => {
    const { cloud } = renderRetry({ enabled: false })

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(cloud.listFolders).not.toHaveBeenCalled()
  })
})

/**
 * The three ways two devices can meet, spelled out because each one is a case
 * where the wrong answer loses somebody's work.
 */
describe('two devices meeting', () => {
  // Device A uploads first; device B then finds rows and uploads nothing, so
  // B's own folders stay put and A's are left for the panel to reconcile.
  it('leaves the second device’s folders alone once the first has uploaded', async () => {
    const { cloud, onRetried } = renderRetry({
      local: {
        folders: [folder('b-folder', 'Bのフォルダー')],
        tags: [],
        organizations: [],
      },
      cloudRows: {
        folders: [folderRow(folder('a-folder', 'Aのフォルダー'))],
        tags: [],
        organizations: [],
      },
    })

    await waitFor(() => expect(onRetried).toHaveBeenCalled())
    expect(cloud.upsertFolder).not.toHaveBeenCalled()
  })

  /**
   * A uploaded, B deleted one of A's folders, and C now starts. C must not
   * resurrect it, and the tombstone alone is enough to keep C from uploading
   * blind.
   */
  it('does not resurrect a folder another device deleted', async () => {
    const { cloud, onRetried } = renderRetry({
      local: {
        folders: [folder('a-folder', 'Aのフォルダー')],
        tags: [],
        organizations: [organization('deck-1', { folderId: 'a-folder' })],
      },
      cloudRows: {
        folders: [folderRow(folder('a-folder', 'Aのフォルダー'), SERVER_AT)],
        tags: [],
        organizations: [],
      },
    })

    await waitFor(() => expect(onRetried).toHaveBeenCalled())
    expect(cloud.upsertFolder).not.toHaveBeenCalled()
    expect(cloud.upsertOrganization).not.toHaveBeenCalled()
  })

  /**
   * The network went while the definitions were going up. The device is not
   * marked, so the next attempt looks again — finds the definitions it managed
   * to send, and leaves the rest to the panel rather than uploading blind over
   * an account that now holds rows.
   */
  it('leaves a half-finished upload unmarked', async () => {
    const { storage, onRetried } = renderRetry({ upsertFolderFails: true })

    await waitFor(() => expect(onRetried).toHaveBeenCalled())
    expect(hasUploadedDeckOrganization(storage, userA)).toBe(false)
  })

  it('does not upload again once the definitions are there', async () => {
    const { cloud, onRetried } = renderRetry({
      local: {
        folders: [folder('f1')],
        tags: [tag('t1')],
        organizations: [organization('deck-1')],
      },
      cloudRows: {
        folders: [folderRow(folder('f1'))],
        tags: [tagRow(tag('t1'))],
        organizations: [] as CloudDeckOrganizationRecord[],
      },
    })

    await waitFor(() => expect(onRetried).toHaveBeenCalled())
    expect(cloud.upsertOrganization).not.toHaveBeenCalled()
  })

  it('counts an organization row as the account holding something', async () => {
    const { cloud, onRetried } = renderRetry({
      cloudRows: {
        folders: [],
        tags: [],
        organizations: [organizationRow(organization('deck-9'))],
      },
    })

    await waitFor(() => expect(onRetried).toHaveBeenCalled())
    expect(cloud.upsertFolder).not.toHaveBeenCalled()
  })
})
