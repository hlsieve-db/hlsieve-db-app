import { describe, expect, it } from 'vitest'

import type { Deck } from '../decks/types'
import { restoreDeckFromVersion } from './restore'
import { isDeckVersion, toDeckVersionSnapshot, type DeckVersion } from './types'

function deck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'deck-1',
    name: 'テストデッキ',
    entries: [
      { cardNumber: 'CARD-001', quantity: 2 },
      { cardNumber: 'CARD-002', quantity: 1 },
    ],
    createdAt: '2026-09-20T00:00:00.000Z',
    updatedAt: '2026-09-24T00:00:00.000Z',
    ...overrides,
  }
}

function version(overrides: Partial<DeckVersion> = {}): DeckVersion {
  return {
    id: 'version-1',
    deckId: 'deck-1',
    label: '大会前',
    createdAt: '2026-09-22T00:00:00.000Z',
    snapshot: toDeckVersionSnapshot(deck()),
    ...overrides,
  }
}

describe('keeping a deck as it is now', () => {
  it('keeps the name, the cards and the format', () => {
    const snapshot = toDeckVersionSnapshot(
      deck({ regulationId: 'selection-cup-2026-autumn' }),
    )

    expect(snapshot).toEqual({
      name: 'テストデッキ',
      entries: [
        { cardNumber: 'CARD-001', quantity: 2 },
        { cardNumber: 'CARD-002', quantity: 1 },
      ],
      regulationId: 'selection-cup-2026-autumn',
    })
  })

  // The deck goes on being edited, so a shared array would let a later edit
  // rewrite a record of the past.
  it('copies the cards rather than pointing at them', () => {
    const source = deck()
    const snapshot = toDeckVersionSnapshot(source)

    source.entries.push({ cardNumber: 'CARD-003', quantity: 4 })
    source.entries[0]!.quantity = 99

    expect(snapshot.entries).toEqual([
      { cardNumber: 'CARD-001', quantity: 2 },
      { cardNumber: 'CARD-002', quantity: 1 },
    ])
  })

  it('writes no format for an ordinary deck', () => {
    expect('regulationId' in toDeckVersionSnapshot(deck())).toBe(false)
  })

  it('keeps a format this build does not define', () => {
    expect(
      toDeckVersionSnapshot(deck({ regulationId: 'future-or-removed-rule' }))
        .regulationId,
    ).toBe('future-or-removed-rule')
  })
})

describe('putting a deck back to a snapshot', () => {
  const now = () => '2026-09-25T12:00:00.000Z'

  it('restores the name and the cards', () => {
    const current = deck({ name: '今の名前', entries: [] })

    const restored = restoreDeckFromVersion(current, version(), { now })

    expect(restored.name).toBe('テストデッキ')
    expect(restored.entries).toEqual([
      { cardNumber: 'CARD-001', quantity: 2 },
      { cardNumber: 'CARD-002', quantity: 1 },
    ])
  })

  // Restoring is an edit to a deck, not the arrival of a new one: anything
  // holding the id goes on meaning what it meant.
  it('keeps the deck it is restoring into', () => {
    const current = deck({
      id: 'deck-1',
      createdAt: '2026-09-20T00:00:00.000Z',
    })

    const restored = restoreDeckFromVersion(current, version(), { now })

    expect(restored.id).toBe('deck-1')
    expect(restored.createdAt).toBe('2026-09-20T00:00:00.000Z')
  })

  it('marks the deck as changed now', () => {
    expect(restoreDeckFromVersion(deck(), version(), { now }).updatedAt).toBe(
      '2026-09-25T12:00:00.000Z',
    )
  })

  it('copies the cards out rather than sharing them with the snapshot', () => {
    const kept = version()

    const restored = restoreDeckFromVersion(deck(), kept, { now })
    restored.entries[0]!.quantity = 99
    restored.entries.push({ cardNumber: 'CARD-009', quantity: 1 })

    expect(kept.snapshot.entries).toEqual([
      { cardNumber: 'CARD-001', quantity: 2 },
      { cardNumber: 'CARD-002', quantity: 1 },
    ])
  })

  it('restores the format the snapshot was taken under', () => {
    const kept = version({
      snapshot: toDeckVersionSnapshot(
        deck({ regulationId: 'selection-cup-2026-autumn' }),
      ),
    })

    expect(restoreDeckFromVersion(deck(), kept, { now }).regulationId).toBe(
      'selection-cup-2026-autumn',
    )
  })

  // Ordinary construction is the absence of the field, so restoring to it
  // removes the field rather than leaving the format the deck has now.
  it('takes a deck back to ordinary construction', () => {
    const current = deck({ regulationId: 'selection-cup-2026-autumn' })

    const restored = restoreDeckFromVersion(current, version(), { now })

    expect('regulationId' in restored).toBe(false)
  })

  it('restores a format this build does not define', () => {
    const kept = version({
      snapshot: toDeckVersionSnapshot(
        deck({ regulationId: 'future-or-removed-rule' }),
      ),
    })

    expect(restoreDeckFromVersion(deck(), kept, { now }).regulationId).toBe(
      'future-or-removed-rule',
    )
  })

  it('leaves the snapshot alone', () => {
    const kept = version()
    const before = JSON.stringify(kept)

    restoreDeckFromVersion(deck({ name: '別の名前' }), kept, { now })

    expect(JSON.stringify(kept)).toBe(before)
  })
})

describe('reading a stored snapshot', () => {
  it('accepts one this app wrote', () => {
    expect(isDeckVersion(version())).toBe(true)
  })

  it('accepts one whose format this build does not define', () => {
    expect(
      isDeckVersion(
        version({
          snapshot: toDeckVersionSnapshot(
            deck({ regulationId: 'future-or-removed-rule' }),
          ),
        }),
      ),
    ).toBe(true)
  })

  it('refuses one missing what restoring needs', () => {
    expect(isDeckVersion({ ...version(), deckId: '' })).toBe(false)
    expect(isDeckVersion({ ...version(), label: '  ' })).toBe(false)
    expect(isDeckVersion({ ...version(), snapshot: undefined })).toBe(false)
    expect(
      isDeckVersion({
        ...version(),
        snapshot: { name: '', entries: [] },
      }),
    ).toBe(false)
    expect(
      isDeckVersion({
        ...version(),
        snapshot: { name: 'x', entries: [{ cardNumber: 'A', quantity: 0 }] },
      }),
    ).toBe(false)
  })
})
