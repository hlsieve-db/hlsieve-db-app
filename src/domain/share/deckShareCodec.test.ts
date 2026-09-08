import { describe, expect, it } from 'vitest'

import type { Deck } from '../decks/types'
import {
  MAX_SHARED_DECK_ENCODED_LENGTH,
  MAX_SHARED_DECK_ENTRIES,
  MAX_SHARED_DECK_JSON_LENGTH,
  buildDeckShareUrl,
  createDeckFromSharedPayload,
  decodeDeckSharePayload,
  encodeDeckSharePayload,
} from './deckShareCodec'

function deck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'local-only-id',
    name: '日本語のデッキ',
    entries: [
      { cardNumber: 'hSD01-001', quantity: 1 },
      { cardNumber: 'hBP01-001', quantity: 4 },
    ],
    createdAt: '2026-09-09T00:00:00.000Z',
    updatedAt: '2026-09-09T01:00:00.000Z',
    ...overrides,
  }
}

function encodeRaw(value: string | object): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

describe('deck share codec', () => {
  it('serializes deterministically, preserves insertion order, and roundtrips UTF-8', () => {
    const input = deck()
    const before = structuredClone(input)
    const first = encodeDeckSharePayload(input)
    const second = encodeDeckSharePayload(structuredClone(input))

    expect(first).toBe(second)
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/u)
    expect(decodeDeckSharePayload(first)).toEqual({
      ok: true,
      value: {
        v: 1,
        name: '日本語のデッキ',
        entries: input.entries,
      },
    })
    expect(input).toEqual(before)
  })

  it('includes only portable logical-deck fields', () => {
    const result = decodeDeckSharePayload(encodeDeckSharePayload(deck()))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.keys(result.value)).toEqual(['v', 'name', 'entries'])
    expect(result.value).not.toHaveProperty('id')
    expect(result.value).not.toHaveProperty('createdAt')
    expect(result.value).not.toHaveProperty('updatedAt')
    expect(result.value).not.toHaveProperty('legality')
    expect(result.value.entries[0]).toEqual({
      cardNumber: 'hSD01-001',
      quantity: 1,
    })
  })

  it.each([
    ['', 'invalid_encoding'],
    ['%', 'invalid_encoding'],
    ['A', 'invalid_encoding'],
    ['AB', 'invalid_encoding'],
  ] as const)('rejects invalid base64url %j', (encoded, code) => {
    expect(decodeDeckSharePayload(encoded)).toEqual({
      ok: false,
      error: { code },
    })
  })

  it('distinguishes invalid UTF-8 and invalid JSON', () => {
    expect(decodeDeckSharePayload('_w')).toEqual({
      ok: false,
      error: { code: 'invalid_utf8' },
    })
    expect(decodeDeckSharePayload(encodeRaw('not json'))).toEqual({
      ok: false,
      error: { code: 'invalid_json' },
    })
  })

  it.each([
    [{ name: 'deck', entries: [] }, 'invalid_payload'],
    [{ v: 2, name: 'deck', entries: [] }, 'unsupported_version'],
    [{ v: 1, name: '', entries: [] }, 'invalid_payload'],
    [{ v: 1, name: ' '.repeat(2), entries: [] }, 'invalid_payload'],
    [{ v: 1, name: ` ${'a'.repeat(2)}`, entries: [] }, 'invalid_payload'],
    [{ v: 1, name: 'a'.repeat(101), entries: [] }, 'invalid_payload'],
    [{ v: 1, name: 'deck', entries: [], extra: true }, 'invalid_payload'],
    [
      {
        v: 1,
        name: 'deck',
        entries: [{ cardNumber: 'A', quantity: 1, officialId: 'forbidden' }],
      },
      'invalid_payload',
    ],
  ] as const)('strictly rejects malformed payloads %#', (value, code) => {
    expect(decodeDeckSharePayload(encodeRaw(value))).toEqual({
      ok: false,
      error: { code },
    })
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid quantity %s',
    (quantity) => {
      expect(
        decodeDeckSharePayload(
          encodeRaw({
            v: 1,
            name: 'deck',
            entries: [{ cardNumber: 'A', quantity }],
          }),
        ),
      ).toEqual({ ok: false, error: { code: 'invalid_payload' } })
    },
  )

  it('rejects duplicate, blank, padded, and overly long card numbers', () => {
    const invalidEntries = [
      [
        { cardNumber: 'A', quantity: 1 },
        { cardNumber: 'A', quantity: 2 },
      ],
      [{ cardNumber: '', quantity: 1 }],
      [{ cardNumber: ' A', quantity: 1 }],
      [{ cardNumber: 'A'.repeat(101), quantity: 1 }],
    ]
    for (const entries of invalidEntries) {
      expect(
        decodeDeckSharePayload(encodeRaw({ v: 1, name: 'deck', entries })),
      ).toEqual({ ok: false, error: { code: 'invalid_payload' } })
    }
  })

  it('enforces encoded, decoded, and entry-count technical limits', () => {
    expect(
      decodeDeckSharePayload('A'.repeat(MAX_SHARED_DECK_ENCODED_LENGTH + 1)),
    ).toEqual({ ok: false, error: { code: 'payload_too_large' } })

    const oversizedJson = `"${'a'.repeat(MAX_SHARED_DECK_JSON_LENGTH)}"`
    expect(decodeDeckSharePayload(encodeRaw(oversizedJson))).toEqual({
      ok: false,
      error: { code: 'payload_too_large' },
    })

    const entries = Array.from(
      { length: MAX_SHARED_DECK_ENTRIES + 1 },
      (_, index) => ({ cardNumber: `CARD-${index}`, quantity: 1 }),
    )
    expect(
      decodeDeckSharePayload(encodeRaw({ v: 1, name: 'deck', entries })),
    ).toEqual({ ok: false, error: { code: 'invalid_payload' } })
  })

  it('refuses to encode invalid Deck values', () => {
    expect(() => encodeDeckSharePayload(deck({ name: ' name ' }))).toThrow()
    expect(() =>
      encodeDeckSharePayload(
        deck({ entries: [{ cardNumber: ' CARD', quantity: 1 }] }),
      ),
    ).toThrow()
    expect(() =>
      encodeDeckSharePayload(
        deck({
          entries: Array.from(
            { length: MAX_SHARED_DECK_ENTRIES + 1 },
            (_, index) => ({ cardNumber: `CARD-${index}`, quantity: 1 }),
          ),
        }),
      ),
    ).toThrow()
  })

  it('builds a current-origin URL with only the d query', () => {
    const url = new URL(buildDeckShareUrl(deck(), 'https://cards.example.test'))
    expect(url.origin).toBe('https://cards.example.test')
    expect(url.pathname).toBe('/deck/share')
    expect([...url.searchParams.keys()]).toEqual(['d'])
    expect(decodeDeckSharePayload(url.searchParams.get('d') ?? '').ok).toBe(
      true,
    )
  })

  it('creates a fresh local Deck with current identity and cloned entries', () => {
    const payload = {
      v: 1 as const,
      name: '共有デッキ',
      entries: [{ cardNumber: 'CARD-001', quantity: 2 }],
    }
    const first = createDeckFromSharedPayload(payload, {
      id: () => 'new-1',
      now: () => '2026-09-09T10:00:00.000Z',
    })
    const second = createDeckFromSharedPayload(payload, {
      id: () => 'new-2',
      now: () => '2026-09-09T10:01:00.000Z',
    })

    expect(first).toEqual({
      id: 'new-1',
      name: '共有デッキ',
      entries: payload.entries,
      createdAt: '2026-09-09T10:00:00.000Z',
      updatedAt: '2026-09-09T10:00:00.000Z',
    })
    expect(second.id).toBe('new-2')
    expect(first.entries).not.toBe(payload.entries)
    expect(first.entries[0]).not.toBe(payload.entries[0])
  })
})
