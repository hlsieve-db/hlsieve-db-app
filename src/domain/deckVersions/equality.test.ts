import { describe, expect, it } from 'vitest'

import type { DeckVersion } from './types'
import { deckVersionContentEquals } from './equality'

function version(overrides: Partial<DeckVersion> = {}): DeckVersion {
  return {
    id: 'version-1',
    deckId: 'deck-1',
    label: '大会前',
    createdAt: '2026-09-25T00:00:00.000Z',
    snapshot: {
      name: 'テストデッキ',
      entries: [
        { cardNumber: 'hBP04-042', quantity: 4 },
        { cardNumber: 'hSD01-001', quantity: 1 },
      ],
      regulationId: 'future-or-removed-rule',
    },
    ...overrides,
  }
}

describe('deckVersionContentEquals', () => {
  it('accepts the same immutable content and equivalent timestamp spellings', () => {
    expect(
      deckVersionContentEquals(
        version(),
        version({ createdAt: '2026-09-25T09:00:00.000+09:00' }),
      ),
    ).toBe(true)
  })

  it.each([
    ['id', version({ id: 'version-2' })],
    ['deck id', version({ deckId: 'deck-2' })],
    ['label', version({ label: '大会後' })],
    ['created time', version({ createdAt: '2026-09-25T00:00:01.000Z' })],
    [
      'snapshot name',
      version({ snapshot: { ...version().snapshot, name: '別デッキ' } }),
    ],
    [
      'entry quantity',
      version({
        snapshot: {
          ...version().snapshot,
          entries: [{ cardNumber: 'hBP04-042', quantity: 3 }],
        },
      }),
    ],
    [
      'entry order',
      version({
        snapshot: {
          ...version().snapshot,
          entries: [...version().snapshot.entries].reverse(),
        },
      }),
    ],
    [
      'unknown regulation id',
      version({
        snapshot: {
          ...version().snapshot,
          regulationId: 'another-unknown-rule',
        },
      }),
    ],
  ])('rejects a different %s', (_label, other) => {
    expect(deckVersionContentEquals(version(), other)).toBe(false)
  })

  it('distinguishes absent regulation from an unknown regulation', () => {
    const standard = version({
      snapshot: { name: 'テストデッキ', entries: [] },
    })
    expect(deckVersionContentEquals(standard, version())).toBe(false)
  })
})
