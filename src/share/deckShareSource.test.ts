import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { MAX_SHARED_DECK_JSON_LENGTH } from '../domain/share/deckShareCodec'
import type { SharedDeckPayloadV1 } from '../domain/share/types'
import { createSupabaseDeckShareSource } from './deckShareSource'

const payload: SharedDeckPayloadV1 = {
  v: 1,
  name: 'テストデッキ',
  entries: [{ cardNumber: 'hBP04-042', quantity: 4 }],
}

type RpcResult = { data: unknown; error: unknown }

function clientWith(rpc: (name: string, args: unknown) => Promise<RpcResult>) {
  return { rpc: vi.fn(rpc) } as unknown as SupabaseClient
}

function sourceWith(rpc: (name: string, args: unknown) => Promise<RpcResult>) {
  const source = createSupabaseDeckShareSource(clientWith(rpc))
  if (!source) throw new Error('expected a source')
  return source
}

describe('deck share source without Supabase', () => {
  // The long share URL needs no server, so a build with no keys must still
  // load and simply offer no short links.
  it('is null, rather than throwing or reaching the network', () => {
    expect(createSupabaseDeckShareSource(null)).toBeNull()
  })
})

describe('creating a short share', () => {
  it('returns the id the database allocated', async () => {
    const source = sourceWith(async () => ({
      data: 'Ab3xK9pQ',
      error: null,
    }))

    await expect(source.createShare(payload)).resolves.toEqual({
      ok: true,
      shareId: 'Ab3xK9pQ',
    })
  })

  it('sends the payload to create_deck_share unchanged', async () => {
    const rpc = vi.fn(async () => ({ data: 'Ab3xK9pQ', error: null }))
    const source = createSupabaseDeckShareSource({
      rpc,
    } as unknown as SupabaseClient)
    await source?.createShare(payload)

    expect(rpc).toHaveBeenCalledWith('create_deck_share', { deck: payload })
  })

  // Nothing oversized should leave the browser, and the same limit is checked
  // again in the database.
  it('refuses a payload past the shared size limit without calling out', async () => {
    const rpc = vi.fn(async () => ({ data: 'Ab3xK9pQ', error: null }))
    const source = createSupabaseDeckShareSource({
      rpc,
    } as unknown as SupabaseClient)
    const huge: SharedDeckPayloadV1 = {
      ...payload,
      name: 'あ'.repeat(MAX_SHARED_DECK_JSON_LENGTH),
    }

    await expect(source?.createShare(huge)).resolves.toEqual({
      ok: false,
      reason: 'too-large',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  // Creating needs an account. 42501 arrives either from the missing grant or
  // from the function's own auth.uid() check, and both mean the same thing.
  it.each([
    ['the missing grant', 'permission denied for function create_deck_share'],
    [
      'the function body',
      'Creating a deck share requires a signed in account.',
    ],
  ])('reports a sign-in rejection from %s', async (_label, message) => {
    const source = sourceWith(async () => ({
      data: null,
      error: { code: '42501', message },
    }))

    await expect(source.createShare(payload)).resolves.toEqual({
      ok: false,
      reason: 'sign-in-required',
    })
  })

  it('reports a size rejection from the database as too-large', async () => {
    const source = sourceWith(async () => ({
      data: null,
      error: { code: '22023', message: 'A deck share payload is too large.' },
    }))

    await expect(source.createShare(payload)).resolves.toEqual({
      ok: false,
      reason: 'too-large',
    })
  })

  it('reports other contract rejections as an invalid deck', async () => {
    const source = sourceWith(async () => ({
      data: null,
      error: {
        code: '22023',
        message: 'Unsupported deck share payload version.',
      },
    }))

    await expect(source.createShare(payload)).resolves.toEqual({
      ok: false,
      reason: 'invalid-deck',
    })
  })

  it('reports a network failure as failed rather than throwing', async () => {
    const source = sourceWith(async () => {
      throw new Error('offline')
    })

    await expect(source.createShare(payload)).resolves.toEqual({
      ok: false,
      reason: 'failed',
    })
  })

  // A malformed id would produce a link that can never resolve, so it is
  // treated as a failure instead of being shown to the user.
  it.each([['not an id'], [''], ['Ab3xK9p']])(
    'rejects %s coming back as the new id',
    async (returned) => {
      const source = sourceWith(async () => ({ data: returned, error: null }))

      await expect(source.createShare(payload)).resolves.toEqual({
        ok: false,
        reason: 'failed',
      })
    },
  )
})

describe('loading a short share', () => {
  it('returns the stored payload', async () => {
    const source = sourceWith(async () => ({ data: payload, error: null }))

    await expect(source.loadShare('Ab3xK9pQ')).resolves.toEqual({
      ok: true,
      payload,
    })
  })

  it('asks get_deck_share for exactly one id', async () => {
    const rpc = vi.fn(async () => ({ data: payload, error: null }))
    const source = createSupabaseDeckShareSource({
      rpc,
    } as unknown as SupabaseClient)
    await source?.loadShare('Ab3xK9pQ')

    expect(rpc).toHaveBeenCalledWith('get_deck_share', {
      share_id: 'Ab3xK9pQ',
    })
  })

  // A malformed id cannot exist, so there is nothing to ask the server.
  it.each([['Ab3x/9pQ'], ['../etc/passwd'], [''], ['Ab3xK9pQ\n']])(
    'rejects %s locally without a request',
    async (id) => {
      const rpc = vi.fn(async () => ({ data: payload, error: null }))
      const source = createSupabaseDeckShareSource({
        rpc,
      } as unknown as SupabaseClient)

      await expect(source?.loadShare(id)).resolves.toEqual({
        ok: false,
        reason: 'invalid-id',
      })
      expect(rpc).not.toHaveBeenCalled()
    },
  )

  it('reports an unknown id as not found', async () => {
    const source = sourceWith(async () => ({ data: null, error: null }))

    await expect(source.loadShare('Ab3xK9pQ')).resolves.toEqual({
      ok: false,
      reason: 'not-found',
    })
  })

  it('reports a database error as failed', async () => {
    const source = sourceWith(async () => ({
      data: null,
      error: { code: '08006', message: 'connection failure' },
    }))

    await expect(source.loadShare('Ab3xK9pQ')).resolves.toEqual({
      ok: false,
      reason: 'failed',
    })
  })

  it('reports a network failure as failed rather than throwing', async () => {
    const source = sourceWith(async () => {
      throw new Error('offline')
    })

    await expect(source.loadShare('Ab3xK9pQ')).resolves.toEqual({
      ok: false,
      reason: 'failed',
    })
  })

  // A stored row is not trusted: it may predate a contract change, or have
  // been written by something other than this app.
  it.each([
    ['a non-object', 'nope'],
    ['an array', []],
    ['a missing version', { name: 'A', entries: [] }],
    ['an unsupported version', { v: 2, name: 'A', entries: [] }],
    ['an empty name', { v: 1, name: '', entries: [] }],
    ['entries that are not an array', { v: 1, name: 'A', entries: 'x' }],
    [
      'a duplicated card number',
      {
        v: 1,
        name: 'A',
        entries: [
          { cardNumber: 'x', quantity: 1 },
          { cardNumber: 'x', quantity: 1 },
        ],
      },
    ],
    [
      'an extra field the contract does not allow',
      { v: 1, name: 'A', entries: [], userId: 'someone' },
    ],
  ])('reports %s as malformed', async (_label, stored) => {
    const source = sourceWith(async () => ({ data: stored, error: null }))

    await expect(source.loadShare('Ab3xK9pQ')).resolves.toEqual({
      ok: false,
      reason: 'malformed',
    })
  })

  it('reports an oversized stored payload as malformed', async () => {
    const source = sourceWith(async () => ({
      data: { ...payload, name: 'あ'.repeat(MAX_SHARED_DECK_JSON_LENGTH) },
      error: null,
    }))

    await expect(source.loadShare('Ab3xK9pQ')).resolves.toEqual({
      ok: false,
      reason: 'malformed',
    })
  })
})

describe('what a share carries', () => {
  // The snapshot is readable by anyone holding the link, so it must contain
  // nothing about the account that made it.
  it('sends only the version, name and entries', async () => {
    const rpc = vi.fn(async () => ({ data: 'Ab3xK9pQ', error: null }))
    const source = createSupabaseDeckShareSource({
      rpc,
    } as unknown as SupabaseClient)
    await source?.createShare(payload)

    const sent = (
      rpc.mock.calls[0] as unknown as [string, { deck: unknown }]
    )[1].deck as Record<string, unknown>
    expect(Object.keys(sent).sort()).toEqual(['entries', 'name', 'v'])
    const serialized = JSON.stringify(sent)
    ;['userId', 'user_id', 'email', 'namespace', 'deckId', 'id'].forEach(
      (field) => expect(serialized).not.toContain(field),
    )
  })
})
