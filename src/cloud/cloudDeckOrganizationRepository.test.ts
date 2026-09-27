import { describe, expect, it, vi } from 'vitest'

import type {
  DeckFolder,
  DeckOrganization,
  DeckTag,
} from '../domain/deckOrganization/types'
import {
  classifyCloudDeckOrganizationFailure,
  createSupabaseCloudDeckOrganizationRepository,
  toCloudDeckFolderRecord,
  toCloudDeckOrganizationRecord,
  toCloudDeckTagRecord,
} from './cloudDeckOrganizationRepository'

const SERVER_AT = '2026-09-27T04:56:42.700791+00:00'
const APP_AT = '2026-09-27T00:00:00.000Z'

const folder = (overrides: Partial<DeckFolder> = {}): DeckFolder => ({
  id: 'f1',
  name: '大会用',
  sortOrder: 0,
  createdAt: APP_AT,
  updatedAt: APP_AT,
  ...overrides,
})

const tag = (overrides: Partial<DeckTag> = {}): DeckTag => ({
  id: 't1',
  name: '赤',
  createdAt: APP_AT,
  updatedAt: APP_AT,
  ...overrides,
})

const organization = (
  overrides: Partial<DeckOrganization> = {},
): DeckOrganization => ({
  deckId: 'deck-1',
  tagIds: [],
  createdAt: APP_AT,
  updatedAt: APP_AT,
  ...overrides,
})

function folderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'f1',
    name: '大会用',
    sort_order: 0,
    created_at: SERVER_AT,
    updated_at: SERVER_AT,
    deleted_at: null,
    ...overrides,
  }
}

function organizationRow(overrides: Record<string, unknown> = {}) {
  return {
    deck_id: 'deck-1',
    folder_id: null,
    tag_ids: [],
    created_at: SERVER_AT,
    updated_at: SERVER_AT,
    deleted_at: null,
    ...overrides,
  }
}

/**
 * A stand-in for the Supabase client that records what was asked of it and
 * answers with whatever the test wants back.
 */
function client({
  data = [] as unknown,
  error = null as { code?: string; message?: string } | null,
  session = true,
}: {
  data?: unknown
  error?: { code?: string; message?: string } | null
  session?: boolean
} = {}) {
  const calls: { kind: string; name: string; payload?: unknown }[] = []
  const answer = Promise.resolve({ data, error })

  const builder = () => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      eq: () => chain,
      then: (resolve: (value: unknown) => unknown) => answer.then(resolve),
    }
    return chain
  }

  const fake = {
    auth: {
      getSession: async () => ({ data: { session: session ? {} : null } }),
    },
    from: (table: string) => {
      const chain = builder() as Record<string, unknown>
      chain.upsert = (payload: unknown, options: unknown) => {
        calls.push({
          kind: 'upsert',
          name: table,
          payload: { payload, options },
        })
        return chain
      }
      chain.update = (payload: unknown) => {
        calls.push({ kind: 'update', name: table, payload })
        return chain
      }
      chain.select = () => {
        calls.push({ kind: 'select', name: table })
        return chain
      }
      return chain
    },
    rpc: (name: string, payload: unknown) => {
      calls.push({ kind: 'rpc', name, payload })
      return answer
    },
  }

  return {
    repository: createSupabaseCloudDeckOrganizationRepository(
      fake as never,
    ) as NonNullable<
      ReturnType<typeof createSupabaseCloudDeckOrganizationRepository>
    >,
    calls,
  }
}

describe('turning a row into something the app can hold', () => {
  // The database says "no folder" with null; the app says it by leaving the
  // property off. A null value reaching the app would be a third spelling.
  it('reads a null folder as no property at all', () => {
    const record = toCloudDeckOrganizationRecord(organizationRow())

    expect(record?.organization).toEqual({
      deckId: 'deck-1',
      tagIds: [],
      createdAt: SERVER_AT,
      updatedAt: SERVER_AT,
    })
    expect('folderId' in (record?.organization ?? {})).toBe(false)
  })

  it('keeps a folder it does name', () => {
    const record = toCloudDeckOrganizationRecord(
      organizationRow({ folder_id: 'f1' }),
    )

    expect(record?.organization.folderId).toBe('f1')
  })

  // The table does not police the order of the array.
  it('puts the tags back in the app order, without repeats', () => {
    const record = toCloudDeckOrganizationRecord(
      organizationRow({ tag_ids: ['t3', 't1', 't3'] }),
    )

    expect(record?.organization.tagIds).toEqual(['t1', 't3'])
  })

  it('refuses a row the app could not hold', () => {
    expect(
      toCloudDeckOrganizationRecord(organizationRow({ deck_id: '' })),
    ).toBeUndefined()
    expect(
      toCloudDeckOrganizationRecord(organizationRow({ folder_id: '' })),
    ).toBeUndefined()
    expect(
      toCloudDeckOrganizationRecord(organizationRow({ tag_ids: [1, 2] })),
    ).toBeUndefined()
    expect(
      toCloudDeckOrganizationRecord(organizationRow({ tag_ids: null })),
    ).toBeUndefined()
    expect(
      toCloudDeckOrganizationRecord(organizationRow({ created_at: 'いつか' })),
    ).toBeUndefined()
  })

  it('carries the row sync times, which are not the app format', () => {
    const record = toCloudDeckFolderRecord(folderRow({ deleted_at: SERVER_AT }))

    expect(record?.createdAt).toBe(SERVER_AT)
    expect(record?.deletedAt).toBe(SERVER_AT)
    expect(record?.folder.name).toBe('大会用')
  })

  it('refuses a folder or tag the app would refuse', () => {
    expect(
      toCloudDeckFolderRecord(folderRow({ name: ' 空白つき' })),
    ).toBeUndefined()
    expect(
      toCloudDeckFolderRecord(folderRow({ sort_order: -1 })),
    ).toBeUndefined()
    expect(
      toCloudDeckTagRecord({
        id: 't1',
        name: '',
        created_at: SERVER_AT,
        updated_at: SERVER_AT,
        deleted_at: null,
      }),
    ).toBeUndefined()
  })
})

describe('what an organization write sends and gets back', () => {
  it('sends no folder as null, and reads it back as no property', async () => {
    const { repository, calls } = client({ data: [organizationRow()] })

    const result = await repository.upsertOrganization(organization())

    expect(calls[0]?.payload).toMatchObject({
      payload: { deck_id: 'deck-1', folder_id: null, tag_ids: [] },
      options: { onConflict: 'user_id,deck_id' },
    })
    expect(result.ok && result.value.organization).toEqual({
      deckId: 'deck-1',
      tagIds: [],
      createdAt: SERVER_AT,
      updatedAt: SERVER_AT,
    })
  })

  it('round trips a folder and tags unchanged', async () => {
    const { repository, calls } = client({
      data: [organizationRow({ folder_id: 'f1', tag_ids: ['t1', 't2'] })],
    })

    const result = await repository.upsertOrganization(
      organization({ folderId: 'f1', tagIds: ['t1', 't2'] }),
    )

    expect(calls[0]?.payload).toMatchObject({
      payload: { folder_id: 'f1', tag_ids: ['t1', 't2'] },
    })
    expect(result.ok && result.value.organization.folderId).toBe('f1')
    expect(result.ok && result.value.organization.tagIds).toEqual(['t1', 't2'])
  })

  // Unlike a folder, the row says what the device holds now.
  it('clears the tombstone, so an organization can come back', async () => {
    const { repository, calls } = client({ data: [organizationRow()] })

    await repository.upsertOrganization(organization())

    expect(calls[0]?.payload).toMatchObject({
      payload: { deleted_at: null },
    })
  })

  it('refuses to send something the app would not store', async () => {
    const { repository, calls } = client()

    const result = await repository.upsertOrganization(
      organization({ tagIds: ['t2', 't1'] }),
    )

    expect(result).toEqual({ ok: false, reason: 'invalid-data' })
    expect(calls).toEqual([])
  })
})

describe('writing a folder or a tag', () => {
  // The client library cannot express "leave a tombstoned row alone", so the
  // write goes through the function that can.
  it('goes through the function that will not revive a deleted one', async () => {
    const { repository, calls } = client({
      data: [{ written: true, skipped_tombstone: false }],
    })

    const result = await repository.upsertFolder(folder({ sortOrder: 2 }))

    expect(calls[0]).toEqual({
      kind: 'rpc',
      name: 'upsert_deck_folder',
      payload: { p_id: 'f1', p_name: '大会用', p_sort_order: 2 },
    })
    expect(result).toEqual({
      ok: true,
      value: { written: true, skippedTombstone: false },
    })
  })

  it('reports a write the account skipped as a tombstone', async () => {
    const { repository } = client({
      data: [{ written: false, skipped_tombstone: true }],
    })

    const result = await repository.upsertTag(tag())

    expect(result).toEqual({
      ok: true,
      value: { written: false, skippedTombstone: true },
    })
  })

  it('refuses a malformed answer rather than guessing', async () => {
    const { repository } = client({ data: [{ written: 'yes' }] })

    expect(await repository.upsertFolder(folder())).toEqual({
      ok: false,
      reason: 'invalid-data',
    })
  })
})

describe('removing things', () => {
  it('tombstones a folder through the function and reports the decks', async () => {
    const { repository, calls } = client({
      data: [{ folder_found: true, organizations_cleared: 3 }],
    })

    const result = await repository.tombstoneFolder('f1')

    expect(calls[0]).toEqual({
      kind: 'rpc',
      name: 'tombstone_deck_folder',
      payload: { p_folder_id: 'f1' },
    })
    expect(result).toEqual({ ok: true, value: { organizationsCleared: 3 } })
  })

  it('tombstones a tag the same way', async () => {
    const { repository, calls } = client({
      data: [{ tag_found: false, organizations_cleared: 0 }],
    })

    const result = await repository.tombstoneTag('t1')

    expect(calls[0]?.name).toBe('tombstone_deck_tag')
    expect(result).toEqual({ ok: true, value: { organizationsCleared: 0 } })
  })

  it('lets the server choose the deletion time of an organization', async () => {
    const { repository, calls } = client({
      data: [organizationRow({ deleted_at: SERVER_AT })],
    })

    const result = await repository.tombstoneOrganization('deck-1')

    expect(calls[0]).toEqual({
      kind: 'update',
      name: 'deck_organizations',
      payload: { deleted_at: 'now' },
    })
    expect(result.ok && result.value.deletedAt).toBe(SERVER_AT)
  })

  // Row level security makes another account's row invisible rather than
  // forbidden, so nothing matching reads as an organization this account
  // does not have.
  it('reports an organization the account does not hold', async () => {
    const { repository } = client({ data: [] })

    expect(await repository.tombstoneOrganization('deck-1')).toEqual({
      ok: false,
      reason: 'not-found',
    })
  })
})

describe('how a failure is worded', () => {
  it('names the tables not being there as its own case', () => {
    expect(classifyCloudDeckOrganizationFailure({ code: '42P01' })).toBe(
      'missing-table',
    )
    expect(classifyCloudDeckOrganizationFailure({ code: '42883' })).toBe(
      'missing-table',
    )
    expect(classifyCloudDeckOrganizationFailure({ code: 'PGRST202' })).toBe(
      'missing-table',
    )
    expect(classifyCloudDeckOrganizationFailure({ code: 'PGRST205' })).toBe(
      'missing-table',
    )
  })

  // An unrecognised code keeps the change queued: an unsent write is
  // recoverable, a lost one is not.
  it('treats a code it does not know as an ordinary failure', () => {
    expect(classifyCloudDeckOrganizationFailure({ code: 'PGRST999' })).toBe(
      'failed',
    )
    expect(classifyCloudDeckOrganizationFailure({ code: '42501' })).toBe(
      'forbidden',
    )
    expect(classifyCloudDeckOrganizationFailure({ code: 'PGRST301' })).toBe(
      'unauthenticated',
    )
    expect(
      classifyCloudDeckOrganizationFailure({ message: 'network timeout' }),
    ).toBe('network')
  })

  it('says nothing about the database in the result', async () => {
    const { repository } = client({
      error: {
        code: '42P01',
        message: 'relation "deck_folders" does not exist',
      },
    })

    const result = await repository.listFolders()

    expect(result).toEqual({ ok: false, reason: 'missing-table' })
    expect(JSON.stringify(result)).not.toContain('relation')
  })

  it('does not ask at all while nobody is signed in', async () => {
    const { repository, calls } = client({ session: false })

    expect(await repository.listTags()).toEqual({
      ok: false,
      reason: 'unauthenticated',
    })
    expect(calls).toEqual([])
  })

  it('reports a request that never completed as a network failure', async () => {
    const fake = {
      auth: { getSession: async () => ({ data: { session: {} } }) },
      from: () => {
        throw new Error('offline')
      },
      rpc: () => {
        throw new Error('offline')
      },
    }
    const repository = createSupabaseCloudDeckOrganizationRepository(
      fake as never,
    )

    expect(await repository?.listOrganizations()).toEqual({
      ok: false,
      reason: 'network',
    })
  })

  it('is absent where Cloud Sync is not configured', () => {
    expect(createSupabaseCloudDeckOrganizationRepository(null)).toBeNull()
  })
})

describe('reading every row', () => {
  it('asks for a deterministic order', async () => {
    const order = vi.fn()
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: (...args: unknown[]) => {
        order(...args)
        return chain
      },
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
    }
    const fake = {
      auth: { getSession: async () => ({ data: { session: {} } }) },
      from: () => chain,
      rpc: () => Promise.resolve({ data: [], error: null }),
    }

    await createSupabaseCloudDeckOrganizationRepository(
      fake as never,
    )?.listFolders()

    expect(order).toHaveBeenNthCalledWith(1, 'updated_at', { ascending: true })
    expect(order).toHaveBeenNthCalledWith(2, 'id', { ascending: true })
  })

  // A short list would look like a deletion to a sync engine.
  it('refuses the whole list when one row is malformed', async () => {
    const { repository } = client({
      data: [folderRow(), folderRow({ name: '' })],
    })

    expect(await repository.listFolders()).toEqual({
      ok: false,
      reason: 'invalid-data',
    })
  })

  it('keeps tombstones, which say what the account deleted', async () => {
    const { repository } = client({
      data: [folderRow({ deleted_at: SERVER_AT })],
    })

    const result = await repository.listFolders()

    expect(result.ok && result.value[0]?.deletedAt).toBe(SERVER_AT)
  })
})
