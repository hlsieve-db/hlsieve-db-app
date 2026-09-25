import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import type { Deck } from '../domain/decks/types'
import {
  classifyCloudDeckFailure,
  createSupabaseCloudDeckRepository,
  toCloudDeckRecord,
  type CloudDeckRepository,
} from './cloudDeckRepository'

function deck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'deck-1',
    name: 'テストデッキ',
    entries: [{ cardNumber: 'hBP04-042', quantity: 4 }],
    createdAt: '2026-09-22T00:00:00.000Z',
    updatedAt: '2026-09-22T00:00:00.000Z',
    ...overrides,
  }
}

/** A row exactly as PostgREST returns it, microseconds and offset included. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'deck-1',
    deck: deck(),
    created_at: '2026-09-22T04:56:42.700791+00:00',
    updated_at: '2026-09-22T04:56:42.700791+00:00',
    deleted_at: null,
    ...overrides,
  }
}

type Response = { data: unknown; error: unknown }

/**
 * A stand-in for the query builder. Every call is recorded so a test can
 * assert on the request that would have gone out, and the chain is thenable so
 * awaiting it resolves like the real one.
 */
function builder(response: Response) {
  const calls: { method: string; args: unknown[] }[] = []
  const chain: Record<string, unknown> = {
    then: (resolve: (value: Response) => unknown) => resolve(response),
  }
  for (const method of [
    'select',
    'order',
    'gte',
    'eq',
    'upsert',
    'update',
    'insert',
  ]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return chain
    }
  }
  return { chain, calls }
}

function clientWith(
  response: Response,
  { session = true }: { session?: boolean } = {},
) {
  const { chain, calls } = builder(response)
  const from = vi.fn(() => chain)
  const client = {
    from,
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: session ? { user: { id: 'user-a' } } : null },
        error: null,
      })),
    },
  } as unknown as SupabaseClient
  return { client, calls, from }
}

function repoWith(
  response: Response,
  options: { session?: boolean } = {},
): {
  repository: CloudDeckRepository
  calls: { method: string; args: unknown[] }[]
  from: ReturnType<typeof vi.fn>
} {
  const { client, calls, from } = clientWith(response, options)
  const repository = createSupabaseCloudDeckRepository(client)
  if (!repository) throw new Error('expected a repository')
  return { repository, calls, from }
}

const argsOf = (calls: { method: string; args: unknown[] }[], method: string) =>
  calls.filter((call) => call.method === method).map((call) => call.args)

describe('cloud deck repository without Supabase', () => {
  // Cloud Sync is optional. A build with no keys must not get a repository,
  // exactly as it gets no auth source and no deck share source.
  it('is null rather than throwing or reaching the network', () => {
    expect(createSupabaseCloudDeckRepository(null)).toBeNull()
  })
})

describe('cloud deck repository without a session', () => {
  // Checked from the stored session, so being signed out costs no request and
  // works while offline.
  it.each([
    ['listAll', (repo: CloudDeckRepository) => repo.listAll()],
    [
      'listUpdatedSince',
      (repo: CloudDeckRepository) =>
        repo.listUpdatedSince('2026-01-01T00:00:00Z'),
    ],
    ['upsert', (repo: CloudDeckRepository) => repo.upsert(deck())],
    ['tombstone', (repo: CloudDeckRepository) => repo.tombstone('deck-1')],
  ])('reports %s as unauthenticated without a request', async (_label, run) => {
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

describe('listAll', () => {
  it('returns the account rows as records', async () => {
    const { repository } = repoWith({ data: [row()], error: null })

    await expect(repository.listAll()).resolves.toEqual({
      ok: true,
      value: [
        {
          id: 'deck-1',
          deck: deck(),
          createdAt: '2026-09-22T04:56:42.700791+00:00',
          updatedAt: '2026-09-22T04:56:42.700791+00:00',
          deletedAt: null,
        },
      ],
    })
  })

  // A sync engine cannot apply a deletion it never sees.
  it('includes tombstones', async () => {
    const { repository } = repoWith({
      data: [row({ deleted_at: '2026-09-22T05:00:00.000000+00:00' })],
      error: null,
    })
    const result = await repository.listAll()

    expect(result.ok && result.value[0].deletedAt).toBe(
      '2026-09-22T05:00:00.000000+00:00',
    )
  })

  it('orders by updated_at then id, both ascending', async () => {
    const { repository, calls } = repoWith({ data: [], error: null })
    await repository.listAll()

    expect(argsOf(calls, 'order')).toEqual([
      ['updated_at', { ascending: true }],
      ['id', { ascending: true }],
    ])
  })

  // Row level security already restricts the rows, and the repository has no
  // independent idea of who the account is to filter by.
  it('sends no user_id filter and reads no user_id column', async () => {
    const { repository, calls } = repoWith({ data: [], error: null })
    await repository.listAll()

    expect(argsOf(calls, 'eq')).toEqual([])
    expect(argsOf(calls, 'select')[0][0]).toBe(
      'id,deck,created_at,updated_at,deleted_at',
    )
  })
})

describe('listUpdatedSince', () => {
  // now() is the transaction timestamp, so one transaction stamps every row it
  // writes identically. An exclusive boundary would skip all but one of them.
  it('uses an inclusive boundary', async () => {
    const { repository, calls } = repoWith({ data: [], error: null })
    await repository.listUpdatedSince('2026-09-22T04:56:42.700791+00:00')

    expect(argsOf(calls, 'gte')).toEqual([
      ['updated_at', '2026-09-22T04:56:42.700791+00:00'],
    ])
    expect(calls.some((call) => call.method === 'gt')).toBe(false)
  })

  it('keeps the same deterministic ordering', async () => {
    const { repository, calls } = repoWith({ data: [], error: null })
    await repository.listUpdatedSince('2026-01-01T00:00:00Z')

    expect(argsOf(calls, 'order')).toEqual([
      ['updated_at', { ascending: true }],
      ['id', { ascending: true }],
    ])
  })
})

describe('upsert', () => {
  it('returns the stored record', async () => {
    const { repository } = repoWith({ data: [row()], error: null })
    const result = await repository.upsert(deck())

    expect(result).toEqual({
      ok: true,
      value: {
        id: 'deck-1',
        deck: deck(),
        createdAt: '2026-09-22T04:56:42.700791+00:00',
        updatedAt: '2026-09-22T04:56:42.700791+00:00',
        deletedAt: null,
      },
    })
  })

  // user_id defaults to auth.uid() and the timestamps come from the trigger,
  // so a client can neither claim another account's row nor backdate its own.
  it('sends only id, deck and a cleared deleted_at', async () => {
    const { repository, calls } = repoWith({ data: [row()], error: null })
    await repository.upsert(deck())

    const [payload] = argsOf(calls, 'upsert')[0] as [Record<string, unknown>]
    expect(Object.keys(payload).sort()).toEqual(['deck', 'deleted_at', 'id'])
    expect(payload).not.toHaveProperty('user_id')
    expect(payload).not.toHaveProperty('created_at')
    expect(payload).not.toHaveProperty('updated_at')
  })

  // Storing a deck again is how a tombstone is undone.
  it('clears deleted_at, which resurrects a tombstoned deck', async () => {
    const { repository, calls } = repoWith({ data: [row()], error: null })
    await repository.upsert(deck())

    const [payload] = argsOf(calls, 'upsert')[0] as [Record<string, unknown>]
    expect(payload.deleted_at).toBeNull()
  })

  // The row key is taken from the deck itself, so the two identities cannot
  // drift apart at the point of writing.
  it('sends the deck id as the row id', async () => {
    const { repository, calls } = repoWith({
      data: [row({ id: 'deck-9', deck: deck({ id: 'deck-9' }) })],
      error: null,
    })
    const original = deck({ id: 'deck-9' })
    await repository.upsert(original)

    const [payload] = argsOf(calls, 'upsert')[0] as [{ id: string; deck: Deck }]
    expect(payload.id).toBe(original.id)
    expect(payload.deck.id).toBe(original.id)
  })

  // The primary key is (user_id, id), and the conflict target names both even
  // though only id is sent; user_id resolves against the defaulted value.
  it('names the composite conflict target', async () => {
    const { repository, calls } = repoWith({ data: [row()], error: null })
    await repository.upsert(deck())

    expect(argsOf(calls, 'upsert')[0][1]).toEqual({
      onConflict: 'user_id,id',
    })
  })

  it('stores the deck unchanged, in its own format', async () => {
    const { repository, calls } = repoWith({ data: [row()], error: null })
    const original = deck({
      entries: [
        { cardNumber: 'z-last', quantity: 1 },
        { cardNumber: 'a-first', quantity: 2 },
      ],
    })
    await repository.upsert(original)

    const [payload] = argsOf(calls, 'upsert')[0] as [{ deck: Deck }]
    // Not reordered into display order, not converted to a share payload.
    expect(payload.deck).toEqual(original)
  })

  it('refuses a deck that is not one, without a request', async () => {
    const { repository, from } = repoWith({ data: [row()], error: null })

    await expect(
      repository.upsert({ id: '', name: '', entries: [] } as unknown as Deck),
    ).resolves.toEqual({ ok: false, reason: 'invalid-data' })
    expect(from).not.toHaveBeenCalled()
  })
})

describe('tombstone', () => {
  it('marks the row deleted and returns it', async () => {
    const { repository } = repoWith({
      data: [row({ deleted_at: '2026-09-22T05:00:00.000000+00:00' })],
      error: null,
    })
    const result = await repository.tombstone('deck-1')

    expect(result.ok && result.value.deletedAt).toBe(
      '2026-09-22T05:00:00.000000+00:00',
    )
  })

  // Postgres resolves the literal 'now' to the transaction timestamp, so the
  // deletion carries the server's clock rather than the device's.
  it('asks the server for the time instead of sending one', async () => {
    const { repository, calls } = repoWith({ data: [row()], error: null })
    await repository.tombstone('deck-1')

    expect(argsOf(calls, 'update')[0][0]).toEqual({ deleted_at: 'now' })
    expect(argsOf(calls, 'eq')).toEqual([['id', 'deck-1']])
  })

  it('reports a deck this account does not have as not-found', async () => {
    const { repository } = repoWith({ data: [], error: null })

    await expect(repository.tombstone('missing')).resolves.toEqual({
      ok: false,
      reason: 'not-found',
    })
  })

  it('refuses an empty id without a request', async () => {
    const { repository, from } = repoWith({ data: [row()], error: null })

    await expect(repository.tombstone('')).resolves.toEqual({
      ok: false,
      reason: 'invalid-data',
    })
    expect(from).not.toHaveBeenCalled()
  })
})

describe('no physical delete', () => {
  // The account holds no delete privilege, and a removed row could be
  // resurrected by any device still holding a copy.
  it('exposes no method that could remove a row', () => {
    const { repository } = repoWith({ data: [], error: null })

    expect(Object.keys(repository).sort()).toEqual([
      'listAll',
      'listUpdatedSince',
      'tombstone',
      'tombstoneWithVersions',
      'upsert',
    ])
  })

  it('never calls delete on the table', async () => {
    const { repository, calls } = repoWith({ data: [row()], error: null })
    await repository.listAll()
    await repository.upsert(deck())
    await repository.tombstone('deck-1')

    expect(calls.some((call) => call.method === 'delete')).toBe(false)
  })
})

describe('atomic parent and Version tombstone RPC', () => {
  it('calls the RPC and validates its result', async () => {
    const rpc = vi.fn(async () => ({
      data: [{ deck_found: true, versions_tombstoned: 3 }],
      error: null,
    }))
    const client = {
      rpc,
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { user: { id: 'user-a' } } },
          error: null,
        })),
      },
    } as unknown as SupabaseClient
    const repository = createSupabaseCloudDeckRepository(client)
    await expect(
      repository?.tombstoneWithVersions?.('deck-1'),
    ).resolves.toEqual({ ok: true, value: { versionsTombstoned: 3 } })
    expect(rpc).toHaveBeenCalledWith('tombstone_deck_with_versions', {
      p_deck_id: 'deck-1',
    })
  })

  it('maps a missing parent to the idempotent not-found state', async () => {
    const client = {
      rpc: vi.fn(async () => ({
        data: [{ deck_found: false, versions_tombstoned: 0 }],
        error: null,
      })),
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { user: { id: 'user-a' } } },
          error: null,
        })),
      },
    } as unknown as SupabaseClient
    const repository = createSupabaseCloudDeckRepository(client)
    await expect(
      repository?.tombstoneWithVersions?.('missing'),
    ).resolves.toEqual({ ok: false, reason: 'not-found' })
  })
})

describe('row validation', () => {
  it('accepts a row shaped the way Postgres returns one', () => {
    expect(toCloudDeckRecord(row())).toBeDefined()
  })

  // The row key and the deck's own id are one identity. A row where they
  // disagree would be restored locally under one id while the cloud keys it
  // under the other, so a later tombstone or upsert would act on the wrong row.
  it('accepts a row whose id matches the deck id', () => {
    const record = toCloudDeckRecord(
      row({ id: 'deck-7', deck: deck({ id: 'deck-7' }) }),
    )
    expect(record?.id).toBe('deck-7')
    expect(record?.deck.id).toBe('deck-7')
  })

  it('rejects a row whose id disagrees with the deck id', () => {
    expect(
      toCloudDeckRecord(row({ id: 'deck-a', deck: deck({ id: 'deck-b' }) })),
    ).toBeUndefined()
  })

  // Neither side is quietly corrected to match the other.
  it('does not rewrite either id to make them agree', () => {
    const mismatched = row({ id: 'deck-a', deck: deck({ id: 'deck-b' }) })
    toCloudDeckRecord(mismatched)

    expect(mismatched.id).toBe('deck-a')
    expect((mismatched.deck as Deck).id).toBe('deck-b')
  })

  it.each([
    ['a missing id', row({ id: undefined })],
    ['an empty id', row({ id: '' })],
    ['a non-string id', row({ id: 5 })],
    ['a missing deck', row({ deck: undefined })],
    ['a deck that is not one', row({ deck: { name: 'x' } })],
    [
      'a deck with a bad entry',
      row({ deck: deck({ entries: [{ cardNumber: '', quantity: 1 }] }) }),
    ],
    ['a missing created_at', row({ created_at: undefined })],
    ['an unparseable created_at', row({ created_at: 'not a date' })],
    ['an unparseable updated_at', row({ updated_at: 'not a date' })],
    ['an unparseable deleted_at', row({ deleted_at: 'not a date' })],
    ['a non-object row', 'nope'],
    ['an array row', []],
  ])('rejects %s', (_label, value) => {
    expect(toCloudDeckRecord(value)).toBeUndefined()
  })

  // Skipping a bad row would look like a deletion to a sync engine, so the
  // whole read fails instead, matching the local repository which throws.
  it('fails the whole list rather than dropping a row', async () => {
    const { repository } = repoWith({
      data: [row(), row({ id: 'deck-2', deck: { nonsense: true } })],
      error: null,
    })

    await expect(repository.listAll()).resolves.toEqual({
      ok: false,
      reason: 'invalid-data',
    })
  })

  it.each([
    ['listAll', (repo: CloudDeckRepository) => repo.listAll()],
    [
      'listUpdatedSince',
      (repo: CloudDeckRepository) =>
        repo.listUpdatedSince('2026-01-01T00:00:00Z'),
    ],
  ])(
    'fails %s entirely when one row has a mismatched id',
    async (_label, run) => {
      const { repository } = repoWith({
        data: [
          row(),
          row({ id: 'deck-a', deck: deck({ id: 'deck-b' }) }),
          row({ id: 'deck-3', deck: deck({ id: 'deck-3' }) }),
        ],
        error: null,
      })

      await expect(run(repository)).resolves.toEqual({
        ok: false,
        reason: 'invalid-data',
      })
    },
  )

  it('reports a response that is not a list as invalid-data', async () => {
    const { repository } = repoWith({ data: { not: 'a list' }, error: null })

    await expect(repository.listAll()).resolves.toEqual({
      ok: false,
      reason: 'invalid-data',
    })
  })
})

describe('error mapping', () => {
  it.each([
    ['a row level security refusal', { code: '42501' }, 'forbidden'],
    ['an expired token', { code: 'PGRST301' }, 'unauthenticated'],
    ['a 401', { code: '401' }, 'unauthenticated'],
    ['a fetch failure', { message: 'Failed to fetch' }, 'network'],
    ['a timeout', { message: 'network timeout' }, 'network'],
    ['anything else', { code: '23505', message: 'duplicate key' }, 'failed'],
    ['no error object', null, 'failed'],
  ])('maps %s', (_label, error, expected) => {
    expect(classifyCloudDeckFailure(error)).toBe(expected)
  })

  it('surfaces a permission error from a real call', async () => {
    const { repository } = repoWith({
      data: null,
      error: { code: '42501', message: 'permission denied for table decks' },
    })

    await expect(repository.listAll()).resolves.toEqual({
      ok: false,
      reason: 'forbidden',
    })
  })

  it('reports a thrown request as network rather than propagating', async () => {
    const { chain } = builder({ data: null, error: null })
    chain.then = () => {
      throw new Error('offline')
    }
    const client = {
      from: () => chain,
      auth: {
        getSession: async () => ({
          data: { session: { user: { id: 'user-a' } } },
          error: null,
        }),
      },
    } as unknown as SupabaseClient
    const repository = createSupabaseCloudDeckRepository(client)

    await expect(repository?.listAll()).resolves.toEqual({
      ok: false,
      reason: 'network',
    })
  })

  it('shows nothing the database said', async () => {
    const { repository } = repoWith({
      data: null,
      error: {
        code: '42501',
        message: 'permission denied for table decks',
        details: 'internal',
      },
    })
    const result = await repository.listAll()

    expect(JSON.stringify(result)).not.toContain('permission denied')
    expect(JSON.stringify(result)).not.toContain('internal')
  })
})

describe('session handling', () => {
  // getUser() would be a network round trip before every operation and would
  // fail while offline, undoing the offline session restore in the auth layer.
  it('reads the stored session and never asks the server who the caller is', async () => {
    const { client, calls } = clientWith({ data: [row()], error: null })
    const repository = createSupabaseCloudDeckRepository(client)
    await repository?.listAll()

    const auth = (client as unknown as { auth: Record<string, unknown> }).auth
    expect(auth.getSession).toHaveBeenCalled()
    expect(auth.getUser).toBeUndefined()
    expect(calls.length).toBeGreaterThan(0)
  })
})
