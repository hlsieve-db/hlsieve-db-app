import { describe, expect, it } from 'vitest'

import { DECK_NAME_MAX_LENGTH } from './constants'
import { buildDuplicateDeckName, duplicateDeck } from './duplicate'
import type { Deck } from './types'

function deck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'deck-1',
    name: '白上フブキ',
    entries: [
      { cardNumber: 'CARD-001', quantity: 2 },
      { cardNumber: 'CARD-002', quantity: 1 },
    ],
    createdAt: '2026-09-20T00:00:00.000Z',
    updatedAt: '2026-09-22T00:00:00.000Z',
    ...overrides,
  }
}

const options = {
  id: () => 'copy-1',
  now: () => '2026-09-25T12:00:00.000Z',
}

describe('naming a copy', () => {
  it('adds the suffix to the original name', () => {
    expect(buildDuplicateDeckName('白上フブキ', [])).toBe('白上フブキのコピー')
  })

  // The first copy reads better without a number.
  it('numbers from two once a name is taken', () => {
    expect(buildDuplicateDeckName('白上フブキ', ['白上フブキのコピー'])).toBe(
      '白上フブキのコピー 2',
    )
    expect(
      buildDuplicateDeckName('白上フブキ', [
        '白上フブキのコピー',
        '白上フブキのコピー 2',
      ]),
    ).toBe('白上フブキのコピー 3')
  })

  it('ignores names belonging to other decks', () => {
    expect(buildDuplicateDeckName('白上フブキ', ['別のデッキ'])).toBe(
      '白上フブキのコピー',
    )
  })

  // The suffix is what says this is a copy, so the original name gives way.
  it('stays within the deck name limit', () => {
    const long = 'あ'.repeat(DECK_NAME_MAX_LENGTH)

    const first = buildDuplicateDeckName(long, [])
    const second = buildDuplicateDeckName(long, [first])

    expect(first.length).toBeLessThanOrEqual(DECK_NAME_MAX_LENGTH)
    expect(second.length).toBeLessThanOrEqual(DECK_NAME_MAX_LENGTH)
    expect(first.endsWith('のコピー')).toBe(true)
    expect(second.endsWith('のコピー 2')).toBe(true)
  })
})

describe('copying a deck', () => {
  it('is a new deck with the same cards', () => {
    const original = deck()

    const copy = duplicateDeck(original, options)

    expect(copy.id).toBe('copy-1')
    expect(copy.id).not.toBe(original.id)
    expect(copy.entries).toEqual(original.entries)
    expect(copy.createdAt).toBe('2026-09-25T12:00:00.000Z')
    expect(copy.updatedAt).toBe('2026-09-25T12:00:00.000Z')
  })

  it('keeps the format it was built for', () => {
    expect(
      duplicateDeck(
        deck({ regulationId: 'selection-cup-2026-autumn' }),
        options,
      ).regulationId,
    ).toBe('selection-cup-2026-autumn')
  })

  it('keeps a format this build does not define', () => {
    expect(
      duplicateDeck(deck({ regulationId: 'future-or-removed-rule' }), options)
        .regulationId,
    ).toBe('future-or-removed-rule')
  })

  it('leaves an ordinary deck ordinary', () => {
    expect('regulationId' in duplicateDeck(deck(), options)).toBe(false)
  })

  // The two decks are edited separately from here.
  it('copies the cards rather than sharing them', () => {
    const original = deck()

    const copy = duplicateDeck(original, options)
    copy.entries[0]!.quantity = 99
    copy.entries.push({ cardNumber: 'CARD-003', quantity: 4 })

    expect(original.entries).toEqual([
      { cardNumber: 'CARD-001', quantity: 2 },
      { cardNumber: 'CARD-002', quantity: 1 },
    ])
  })

  it('leaves the original alone', () => {
    const original = deck()
    const before = JSON.stringify(original)

    duplicateDeck(original, options)

    expect(JSON.stringify(original)).toBe(before)
  })

  it('avoids a name already in use', () => {
    expect(
      duplicateDeck(deck(), {
        ...options,
        existingNames: ['白上フブキ', '白上フブキのコピー'],
      }).name,
    ).toBe('白上フブキのコピー 2')
  })
})
