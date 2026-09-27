import { describe, expect, it, vi } from 'vitest'

import type {
  DeckFolder,
  DeckOrganization,
  DeckTag,
} from '../domain/deckOrganization/types'
import type {
  CloudDeckOrganizationFailure,
  CloudDeckOrganizationRepository,
} from './cloudDeckOrganizationRepository'
import {
  retryPendingDeckOrganizationSync,
  retryPendingOrganizationForDeck,
  retryPendingOrganizationsForFolder,
  type PendingOrganizationQueueAccess,
} from './retryPendingDeckOrganizationSync'

const AT = '2026-09-27T00:00:00.000Z'

const folder = (id = 'f1'): DeckFolder => ({
  id,
  name: `フォルダー${id}`,
  sortOrder: 0,
  createdAt: AT,
  updatedAt: AT,
})

const tag = (id = 't1'): DeckTag => ({
  id,
  name: `タグ${id}`,
  createdAt: AT,
  updatedAt: AT,
})

const organization = (
  deckId = 'deck-1',
  overrides: Partial<DeckOrganization> = {},
): DeckOrganization => ({
  deckId,
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
const failing = (
  reason: CloudDeckOrganizationFailure,
): { ok: false; reason: CloudDeckOrganizationFailure } => ({
  ok: false,
  reason,
})

function queueFor(
  initial: Record<string, 'upsert' | 'tombstone'> = {},
): PendingOrganizationQueueAccess<string> & {
  entries: Map<string, 'upsert' | 'tombstone'>
} {
  const entries = new Map(Object.entries(initial))
  return {
    entries,
    read: () => Object.fromEntries(entries),
    record: vi.fn((key: string, operation: 'upsert' | 'tombstone') => {
      entries.set(key, operation)
    }),
    clear: vi.fn((key: string) => {
      entries.delete(key)
    }),
  }
}

function build({
  folders = {},
  tags = {},
  organizations = {},
  cloud = {},
  enabled = true,
  localFolders = [folder()],
  localTags = [tag()],
  localOrganizations = [organization()],
}: {
  folders?: Record<string, 'upsert' | 'tombstone'>
  tags?: Record<string, 'upsert' | 'tombstone'>
  organizations?: Record<string, 'upsert' | 'tombstone'>
  cloud?: Partial<CloudDeckOrganizationRepository>
  enabled?: boolean
  localFolders?: DeckFolder[]
  localTags?: DeckTag[]
  localOrganizations?: DeckOrganization[]
} = {}) {
  const order: string[] = []
  const cloudRepository: CloudDeckOrganizationRepository = {
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
    upsertOrganization: vi.fn(async () => {
      order.push('organization')
      return {
        ok: true as const,
        value: {
          organization: organization(),
          createdAt: AT,
          updatedAt: AT,
          deletedAt: null,
        },
      }
    }),
    tombstoneFolder: vi.fn(async () => {
      order.push('folder')
      return { ok: true as const, value: { organizationsCleared: 0 } }
    }),
    tombstoneTag: vi.fn(async () => {
      order.push('tag')
      return { ok: true as const, value: { organizationsCleared: 0 } }
    }),
    tombstoneOrganization: vi.fn(async () => {
      order.push('organization')
      return {
        ok: true as const,
        value: {
          organization: organization(),
          createdAt: AT,
          updatedAt: AT,
          deletedAt: AT,
        },
      }
    }),
    ...cloud,
  }

  const queues = {
    folders: queueFor(folders),
    tags: queueFor(tags),
    organizations: queueFor(organizations),
  }
  const onUploadSuccess = vi.fn()

  return {
    order,
    queues,
    cloud: cloudRepository,
    onUploadSuccess,
    run: () =>
      retryPendingDeckOrganizationSync({
        folders: {
          getFolder: async (id) =>
            localFolders.find((value) => value.id === id),
        },
        tags: {
          getTag: async (id) => localTags.find((value) => value.id === id),
        },
        organizations: {
          getOrganization: async (deckId) =>
            localOrganizations.find((value) => value.deckId === deckId),
        },
        cloud: cloudRepository,
        isSyncEnabled: () => enabled,
        pending: queues,
        onUploadSuccess,
      }),
  }
}

describe('sending what could not be sent', () => {
  it('does nothing when every queue is empty', async () => {
    const { run, cloud } = build()

    expect(await run()).toEqual({ ok: true, completed: 0, remaining: 0 })
    expect(cloud.upsertFolder).not.toHaveBeenCalled()
  })

  it('does nothing while sync is off', async () => {
    const { run, cloud } = build({
      folders: { f1: 'upsert' },
      enabled: false,
    })

    await run()
    expect(cloud.upsertFolder).not.toHaveBeenCalled()
  })

  /**
   * An organization row names a folder and a deck the account has to hold
   * already, because the table has a foreign key to each. Sending it first
   * would be refused for a reason the reporter cannot act on.
   */
  it('sends the definitions before the organization', async () => {
    const { run, order } = build({
      folders: { f1: 'upsert' },
      tags: { t1: 'upsert' },
      organizations: { 'deck-1': 'upsert' },
    })

    await run()

    expect(order).toEqual(['folder', 'tag', 'organization'])
  })

  it('clears each entry it sends and counts them', async () => {
    const { run, queues, onUploadSuccess } = build({
      folders: { f1: 'upsert' },
      organizations: { 'deck-1': 'upsert' },
    })

    expect(await run()).toMatchObject({ ok: true, completed: 2, remaining: 0 })
    expect(queues.folders.entries.size).toBe(0)
    expect(queues.organizations.entries.size).toBe(0)
    expect(onUploadSuccess).toHaveBeenCalledTimes(2)
  })

  it('stops at the first refusal and says what is left', async () => {
    const { run, queues, order } = build({
      folders: { f1: 'upsert', f2: 'upsert' },
      organizations: { 'deck-1': 'upsert' },
      localFolders: [folder('f1'), folder('f2')],
      cloud: {
        upsertFolder: vi
          .fn()
          .mockResolvedValueOnce(written)
          .mockResolvedValue(failing('network')),
      },
    })

    expect(await run()).toMatchObject({
      ok: false,
      reason: 'network',
      completed: 1,
      remaining: 1,
    })
    expect(queues.folders.entries.has('f2')).toBe(true)
    // Nothing behind it was attempted.
    expect(order).not.toContain('organization')
  })

  // A deleted definition stays deleted, so retrying could never succeed.
  it('stops holding a folder the account keeps as a tombstone', async () => {
    const { run, queues, onUploadSuccess } = build({
      folders: { f1: 'upsert' },
      cloud: { upsertFolder: vi.fn(async () => skipped) },
    })

    expect(await run()).toMatchObject({ ok: true, completed: 1 })
    expect(queues.folders.entries.size).toBe(0)
    expect(onUploadSuccess).not.toHaveBeenCalled()
  })

  // Deleting from the account on a guess is the worst outcome available.
  it('drops an upsert whose subject this device no longer has', async () => {
    const { run, queues, cloud } = build({
      folders: { gone: 'upsert' },
      organizations: { 'deck-9': 'upsert' },
      localFolders: [],
      localOrganizations: [],
    })

    expect(await run()).toMatchObject({ ok: true, completed: 2 })
    expect(cloud.upsertFolder).not.toHaveBeenCalled()
    expect(cloud.tombstoneFolder).not.toHaveBeenCalled()
    expect(queues.organizations.entries.size).toBe(0)
  })

  it('treats a tombstone the account never had as done', async () => {
    const { run, queues, onUploadSuccess } = build({
      tags: { t1: 'tombstone' },
      cloud: { tombstoneTag: vi.fn(async () => failing('not-found')) },
    })

    expect(await run()).toMatchObject({ ok: true, completed: 1 })
    expect(queues.tags.entries.size).toBe(0)
    expect(onUploadSuccess).not.toHaveBeenCalled()
  })

  // Nothing can be sent until the migration is applied, and that is not a
  // failure of this attempt.
  it('carries on past a kind the account has no table for', async () => {
    const { run, queues, order } = build({
      folders: { f1: 'upsert' },
      organizations: { 'deck-1': 'upsert' },
      cloud: { upsertFolder: vi.fn(async () => failing('missing-table')) },
    })

    const result = await run()

    expect(result.ok).toBe(true)
    expect(result.missingTable).toBe(true)
    expect(queues.folders.entries.has('f1')).toBe(true)
    expect(order).toContain('organization')
  })
})

describe('sending one deck’s organization after the deck itself', () => {
  /**
   * Organizing a deck the moment it is created loses a race: both sends go out
   * without waiting, and the organization can arrive before the deck it names.
   * Waiting for the deck would mean awaiting a send the app deliberately does
   * not await, so this is what clears the expected failure.
   */
  it('sends the entry the deck was blocking', async () => {
    const pending = queueFor({ 'deck-1': 'upsert' })
    const upsertOrganization = vi.fn(async () => ({
      ok: true as const,
      value: {
        organization: organization(),
        createdAt: AT,
        updatedAt: AT,
        deletedAt: null,
      },
    }))
    const onUploadSuccess = vi.fn()

    await retryPendingOrganizationForDeck({
      deckId: 'deck-1',
      organizations: { getOrganization: async () => organization() },
      cloud: {
        upsertOrganization,
      } as unknown as CloudDeckOrganizationRepository,
      isSyncEnabled: () => true,
      pending,
      onUploadSuccess,
    })

    expect(upsertOrganization).toHaveBeenCalledWith(organization())
    expect(pending.entries.size).toBe(0)
    expect(onUploadSuccess).toHaveBeenCalled()
  })

  it('does nothing for a deck with nothing queued', async () => {
    const upsertOrganization = vi.fn()

    await retryPendingOrganizationForDeck({
      deckId: 'deck-2',
      organizations: { getOrganization: async () => organization() },
      cloud: {
        upsertOrganization,
      } as unknown as CloudDeckOrganizationRepository,
      isSyncEnabled: () => true,
      pending: queueFor({ 'deck-1': 'upsert' }),
    })

    expect(upsertOrganization).not.toHaveBeenCalled()
  })

  it('leaves the entry queued when it fails again', async () => {
    const pending = queueFor({ 'deck-1': 'upsert' })

    await retryPendingOrganizationForDeck({
      deckId: 'deck-1',
      organizations: { getOrganization: async () => organization() },
      cloud: {
        upsertOrganization: vi.fn(async () => failing('forbidden')),
      } as unknown as CloudDeckOrganizationRepository,
      isSyncEnabled: () => true,
      pending,
    })

    expect(pending.entries.get('deck-1')).toBe('upsert')
  })

  it('does nothing while sync is off or unconfigured', async () => {
    const upsertOrganization = vi.fn()
    const pending = queueFor({ 'deck-1': 'upsert' })

    await retryPendingOrganizationForDeck({
      deckId: 'deck-1',
      organizations: { getOrganization: async () => organization() },
      cloud: {
        upsertOrganization,
      } as unknown as CloudDeckOrganizationRepository,
      isSyncEnabled: () => false,
      pending,
    })
    await retryPendingOrganizationForDeck({
      deckId: 'deck-1',
      organizations: { getOrganization: async () => organization() },
      cloud: null,
      isSyncEnabled: () => true,
      pending,
    })

    expect(upsertOrganization).not.toHaveBeenCalled()
    expect(pending.entries.size).toBe(1)
  })
})

describe('sending organizations after the folder they name', () => {
  it('sends only the queued ones that name that folder', async () => {
    const pending = queueFor({ 'deck-1': 'upsert', 'deck-2': 'upsert' })
    const sent: string[] = []
    const cloud = {
      upsertOrganization: vi.fn(async (value: DeckOrganization) => {
        sent.push(value.deckId)
        return {
          ok: true as const,
          value: {
            organization: value,
            createdAt: AT,
            updatedAt: AT,
            deletedAt: null,
          },
        }
      }),
    } as unknown as CloudDeckOrganizationRepository
    const local = [
      organization('deck-1', { folderId: 'f1' }),
      organization('deck-2', { folderId: 'f2' }),
      organization('deck-3', { folderId: 'f1' }),
    ]

    await retryPendingOrganizationsForFolder({
      folderId: 'f1',
      organizations: {
        listOrganizations: async () => local,
        getOrganization: async (deckId) =>
          local.find((value) => value.deckId === deckId),
      },
      cloud,
      isSyncEnabled: () => true,
      pending,
    })

    // deck-2 names another folder; deck-3 has nothing queued.
    expect(sent).toEqual(['deck-1'])
    expect(pending.entries.has('deck-1')).toBe(false)
    expect(pending.entries.get('deck-2')).toBe('upsert')
  })

  it('does nothing when nothing is queued', async () => {
    const listOrganizations = vi.fn(async () => [])

    await retryPendingOrganizationsForFolder({
      folderId: 'f1',
      organizations: {
        listOrganizations,
        getOrganization: async () => undefined,
      },
      cloud: {} as unknown as CloudDeckOrganizationRepository,
      isSyncEnabled: () => true,
      pending: queueFor(),
    })

    expect(listOrganizations).not.toHaveBeenCalled()
  })

  it('leaves a tombstone entry to the ordinary retry', async () => {
    const upsertOrganization = vi.fn()
    const local = [organization('deck-1', { folderId: 'f1' })]

    await retryPendingOrganizationsForFolder({
      folderId: 'f1',
      organizations: {
        listOrganizations: async () => local,
        getOrganization: async () => local[0],
      },
      cloud: {
        upsertOrganization,
      } as unknown as CloudDeckOrganizationRepository,
      isSyncEnabled: () => true,
      pending: queueFor({ 'deck-1': 'tombstone' }),
    })

    expect(upsertOrganization).not.toHaveBeenCalled()
  })
})
