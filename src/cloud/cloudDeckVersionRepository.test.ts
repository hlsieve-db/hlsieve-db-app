import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import type { DeckVersion } from '../domain/deckVersions/types'
import {
  createSupabaseCloudDeckVersionRepository,
  toCloudDeckVersionRecord,
  type CloudDeckVersionRepository,
} from './cloudDeckVersionRepository'

function version(overrides: Partial<DeckVersion> = {}): DeckVersion {
  return {
    id: 'version-1',
    deckId: 'deck-1',
    label: '大会前',
    createdAt: '2026-09-25T00:00:00.000Z',
    snapshot: {
      name: 'テストデッキ',
      entries: [{ cardNumber: 'hBP04-042', quantity: 4 }],
      regulationId: 'future-or-removed-rule',
    },
    ...overrides,
  }
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'version-1',
    deck_id: 'deck-1',
    label: '大会前',
    snapshot: version().snapshot,
    created_at: '2026-09-25T00:00:00.000000+00:00',
    deleted_at: null,
    ...overrides,
  }
}

type Response = {
  data: unknown
  error: { code?: string; message?: string } | null
}

function builder(response: Response) {
  const calls: { method: string; args: unknown[] }[] = []
  const chain: Record<string, unknown> = {
    then: (resolve: (value: Response) => unknown) => resolve(response),
  }
  for (const method of ['select', 'order', 'eq', 'insert', 'update']) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return chain
    }
  }
  return { chain, calls }
}

function clientWith(
  responses: Response | Response[],
  { session = true }: { session?: boolean } = {},
) {
  const queue = Array.isArray(responses) ? [...responses] : [responses]
  const builders: ReturnType<typeof builder>[] = []
  const from = vi.fn(() => {
    const current = builder(
      queue.shift() ?? { data: null, error: { message: 'missing response' } },
    )
    builders.push(current)
    return current.chain
  })
  const client = {
    from,
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: session ? { user: { id: 'user-a' } } : null },
        error: null,
      })),
    },
  } as unknown as SupabaseClient
  return { client, from, builders }
}

function repoWith(
  responses: Response | Response[],
  options: { session?: boolean } = {},
) {
  const context = clientWith(responses, options)
  const repository = createSupabaseCloudDeckVersionRepository(context.client)
  if (!repository) throw new Error('expected repository')
  return { repository, ...context }
}

const argsOf = (calls: { method: string; args: unknown[] }[], method: string) =>
  calls.filter((call) => call.method === method).map((call) => call.args)

describe('cloud deck version repository availability', () => {
  it('is null when Supabase is not configured', () => {
    expect(createSupabaseCloudDeckVersionRepository(null)).toBeNull()
  })

  it.each([
    [
      'listAll',
      (repository: CloudDeckVersionRepository) => repository.listAll(),
    ],
    [
      'insert',
      (repository: CloudDeckVersionRepository) => repository.insert(version()),
    ],
    [
      'tombstone',
      (repository: CloudDeckVersionRepository) =>
        repository.tombstone('version-1'),
    ],
  ])('does not request %s while signed out', async (_label, run) => {
    const { repository, from } = repoWith(
      { data: [row()], error: null },
      { session: false },
    )
    await expect(run(repository)).resolves.toEqual({
      ok: false,
      reason: 'unauthenticated',
    })
    expect(from).not.toHaveBeenCalled()
  })
})

describe('cloud deck version row validation', () => {
  it('reconstructs a valid DeckVersion and preserves an unknown regulation', () => {
    expect(toCloudDeckVersionRecord(row())).toEqual({
      version: {
        ...version(),
        createdAt: '2026-09-25T00:00:00.000000+00:00',
      },
      deletedAt: null,
    })
  })

  it.each([
    ['missing id', row({ id: undefined })],
    ['empty deck id', row({ deck_id: '' })],
    ['blank label', row({ label: '   ' })],
    ['invalid created time', row({ created_at: 'nope' })],
    ['invalid deletion time', row({ deleted_at: 'nope' })],
    ['missing snapshot', row({ snapshot: undefined })],
    [
      'invalid snapshot entry',
      row({
        snapshot: {
          name: 'x',
          entries: [{ cardNumber: '', quantity: 1 }],
        },
      }),
    ],
    ['non-object row', 'bad'],
  ])('rejects %s', (_label, value) => {
    expect(toCloudDeckVersionRecord(value)).toBeUndefined()
  })

  it('fails a whole list when one row is malformed', async () => {
    const { repository } = repoWith({
      data: [row(), row({ id: 'version-2', snapshot: [] })],
      error: null,
    })
    await expect(repository.listAll()).resolves.toEqual({
      ok: false,
      reason: 'invalid-data',
    })
  })
})

describe('listAll deck versions', () => {
  it('returns active rows and tombstones in deterministic order', async () => {
    const tombstonedAt = '2026-09-25T01:00:00.000000+00:00'
    const { repository, builders, from } = repoWith({
      data: [row(), row({ deleted_at: tombstonedAt })],
      error: null,
    })
    const result = await repository.listAll()

    expect(result.ok && result.value.map((value) => value.deletedAt)).toEqual([
      null,
      tombstonedAt,
    ])
    expect(from).toHaveBeenCalledWith('deck_versions')
    expect(argsOf(builders[0].calls, 'order')).toEqual([
      ['created_at', { ascending: true }],
      ['id', { ascending: true }],
    ])
    expect(argsOf(builders[0].calls, 'select')[0][0]).toBe(
      'id,deck_id,label,snapshot,created_at,deleted_at',
    )
    expect(argsOf(builders[0].calls, 'eq')).toEqual([])
  })
})

describe('insert immutable deck version', () => {
  it('inserts a new version without user_id or deleted_at', async () => {
    const { repository, builders } = repoWith({ data: [row()], error: null })
    await expect(repository.insert(version())).resolves.toMatchObject({
      ok: true,
      value: { deletedAt: null },
    })

    const [payload] = argsOf(builders[0].calls, 'insert')[0] as [
      Record<string, unknown>,
    ]
    expect(payload).toEqual({
      id: 'version-1',
      deck_id: 'deck-1',
      label: '大会前',
      snapshot: version().snapshot,
      created_at: '2026-09-25T00:00:00.000Z',
    })
    expect(payload).not.toHaveProperty('user_id')
    expect(payload).not.toHaveProperty('deleted_at')
    expect(builders[0].calls.some((call) => call.method === 'upsert')).toBe(
      false,
    )
  })

  it('treats an identical duplicate as success', async () => {
    const duplicate = { code: '23505', message: 'duplicate key' }
    const { repository } = repoWith([
      { data: null, error: duplicate },
      { data: [row()], error: null },
    ])
    await expect(repository.insert(version())).resolves.toMatchObject({
      ok: true,
      value: { deletedAt: null },
    })
  })

  it('returns an existing tombstone and never revives it', async () => {
    const deletedAt = '2026-09-25T01:00:00.000000+00:00'
    const { repository, builders } = repoWith([
      { data: null, error: { code: '23505' } },
      { data: [row({ deleted_at: deletedAt })], error: null },
    ])
    await expect(repository.insert(version())).resolves.toMatchObject({
      ok: true,
      value: { deletedAt },
    })
    expect(
      builders.some(({ calls }) =>
        calls.some((call) => call.method === 'update'),
      ),
    ).toBe(false)
  })

  it('reports an immutable-content mismatch as an integrity conflict', async () => {
    const { repository } = repoWith([
      { data: null, error: { code: '23505' } },
      { data: [row({ label: '別内容' })], error: null },
    ])
    await expect(repository.insert(version())).resolves.toEqual({
      ok: false,
      reason: 'integrity-conflict',
    })
  })

  it('compares unknown regulation ids literally', async () => {
    const { repository } = repoWith([
      { data: null, error: { code: '23505' } },
      {
        data: [
          row({
            snapshot: {
              ...version().snapshot,
              regulationId: 'different-future-rule',
            },
          }),
        ],
        error: null,
      },
    ])
    await expect(repository.insert(version())).resolves.toEqual({
      ok: false,
      reason: 'integrity-conflict',
    })
  })

  it('rejects an invalid local version without a request', async () => {
    const { repository, from } = repoWith({ data: [row()], error: null })
    await expect(repository.insert(version({ label: '' }))).resolves.toEqual({
      ok: false,
      reason: 'invalid-data',
    })
    expect(from).not.toHaveBeenCalled()
  })
})

describe('tombstone deck version', () => {
  it('uses a server timestamp and returns the tombstone', async () => {
    const deletedAt = '2026-09-25T01:00:00.000000+00:00'
    const { repository, builders } = repoWith({
      data: [row({ deleted_at: deletedAt })],
      error: null,
    })
    await expect(repository.tombstone('version-1')).resolves.toMatchObject({
      ok: true,
      value: { deletedAt },
    })
    expect(argsOf(builders[0].calls, 'update')[0][0]).toEqual({
      deleted_at: 'now',
    })
    expect(argsOf(builders[0].calls, 'eq')).toEqual([['id', 'version-1']])
  })

  it('treats a missing row as an idempotent success', async () => {
    const { repository } = repoWith({ data: [], error: null })
    await expect(repository.tombstone('missing')).resolves.toEqual({
      ok: true,
      value: null,
    })
  })

  it('rejects an empty id without a request', async () => {
    const { repository, from } = repoWith({ data: [], error: null })
    await expect(repository.tombstone('')).resolves.toEqual({
      ok: false,
      reason: 'invalid-data',
    })
    expect(from).not.toHaveBeenCalled()
  })
})

describe('cloud deck version failures and surface', () => {
  it('maps permission and network failures without exposing server text', async () => {
    const { repository } = repoWith({
      data: null,
      error: { code: '42501', message: 'secret database detail' },
    })
    const result = await repository.listAll()
    expect(result).toEqual({ ok: false, reason: 'forbidden' })
    expect(JSON.stringify(result)).not.toContain('secret')
  })

  it('exposes no physical delete or generic upsert method', () => {
    const { repository } = repoWith({ data: [], error: null })
    expect(Object.keys(repository).sort()).toEqual([
      'insert',
      'listAll',
      'tombstone',
    ])
  })
})
