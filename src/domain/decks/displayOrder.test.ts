import { describe, expect, it } from 'vitest'

import type { Card } from '../cards/types'
import {
  DECK_DISPLAY_CATEGORY_ORDER,
  getDeckDisplayCategory,
  sortDeckEntriesForDisplay,
} from './displayOrder'
import type { DeckEntry } from './types'

function card(
  cardNumber: string,
  cardType: Card['cardType'],
  overrides: Partial<Card> = {},
): Card {
  return {
    cardNumber,
    name: cardNumber,
    imageUrl: `https://example.test/${cardNumber}.png`,
    cardType,
    colors: ['white'],
    isBuzz: false,
    tags: [],
    isLimited: false,
    abilities: [],
    arts: [],
    batonPass: [],
    effectTags: [],
    criticalColors: [],
    rarities: [],
    products: [],
    illustrators: [],
    qas: [],
    searchText: cardNumber.toLowerCase(),
    ...overrides,
  }
}

const cards = [
  card('OSHI-002', 'oshi'),
  card('OSHI-001', 'oshi'),
  card('DEBUT-001', 'holomem', { bloomLevel: 'debut' }),
  card('FIRST-001', 'holomem', { bloomLevel: 'first' }),
  card('BUZZ-001', 'holomem', { bloomLevel: 'first', isBuzz: true }),
  card('SECOND-001', 'holomem', { bloomLevel: 'second' }),
  card('LIMITED-001', 'support', {
    isLimited: true,
    supportSearchCategory: 'limited',
  }),
  card('GENERAL-001', 'support', { supportSearchCategory: 'general' }),
  card('TOOL-001', 'support', { supportSearchCategory: 'tool' }),
  card('FAN-001', 'support', { supportSearchCategory: 'fan' }),
  card('CHEER-001', 'cheer'),
  card('SPOT-001', 'holomem', { bloomLevel: 'spot' }),
]

const cardsByNumber = new Map(cards.map((value) => [value.cardNumber, value]))

function entries(cardNumbers: readonly string[]): DeckEntry[] {
  return cardNumbers.map((cardNumber, index) => ({
    cardNumber,
    quantity: index + 1,
  }))
}

describe('Deck display order', () => {
  it('defines the fixed category order with unknown entries last', () => {
    expect(DECK_DISPLAY_CATEGORY_ORDER).toEqual([
      'oshi',
      'debut',
      'first',
      'buzz',
      'second',
      'support_limited',
      'support_general',
      'support_tool',
      'support_fan',
      'cheer',
      'unknown',
    ])
  })

  it('uses formal Card properties and classifies Buzz independently of bloom level', () => {
    expect(cards.map((value) => getDeckDisplayCategory(value))).toEqual([
      'oshi',
      'oshi',
      'debut',
      'first',
      'buzz',
      'second',
      'support_limited',
      'support_general',
      'support_tool',
      'support_fan',
      'cheer',
      'unknown',
    ])
    expect(getDeckDisplayCategory(undefined)).toBe('unknown')
  })

  it('sorts all categories canonically and card numbers ascending within a category', () => {
    const input = entries([
      'MISSING-002',
      'CHEER-001',
      'FAN-001',
      'TOOL-001',
      'GENERAL-001',
      'LIMITED-001',
      'SECOND-001',
      'BUZZ-001',
      'FIRST-001',
      'DEBUT-001',
      'OSHI-002',
      'SPOT-001',
      'OSHI-001',
      'MISSING-001',
    ])

    expect(
      sortDeckEntriesForDisplay(input, cardsByNumber).map(
        ({ cardNumber }) => cardNumber,
      ),
    ).toEqual([
      'OSHI-001',
      'OSHI-002',
      'DEBUT-001',
      'FIRST-001',
      'BUZZ-001',
      'SECOND-001',
      'LIMITED-001',
      'GENERAL-001',
      'TOOL-001',
      'FAN-001',
      'CHEER-001',
      'MISSING-001',
      'MISSING-002',
      'SPOT-001',
    ])
  })

  it('does not mutate entries or use quantity as a sort key', () => {
    const input = [
      { cardNumber: 'OSHI-002', quantity: 1 },
      { cardNumber: 'OSHI-001', quantity: 99 },
    ]
    const before = structuredClone(input)
    const result = sortDeckEntriesForDisplay(input, cardsByNumber)

    expect(result).not.toBe(input)
    expect(result.map(({ cardNumber }) => cardNumber)).toEqual([
      'OSHI-001',
      'OSHI-002',
    ])
    expect(input).toEqual(before)
  })

  it.each([
    ['debut', { bloomLevel: 'debut' }],
    ['first', { bloomLevel: 'first' }],
    ['buzz', { bloomLevel: 'first', isBuzz: true }],
    ['second', { bloomLevel: 'second' }],
  ] as const)('sorts %s Holomem by member reading', (_, category) => {
    const localCards = [
      card('READING-002', 'holomem', {
        ...category,
        name: '白上フブキ',
        nameReading: 'しらかみふぶき',
      }),
      card('READING-001', 'holomem', {
        ...category,
        name: 'AZKi',
        nameReading: 'あずき',
      }),
    ]
    const lookup = new Map(localCards.map((value) => [value.cardNumber, value]))

    expect(
      sortDeckEntriesForDisplay(
        entries(['READING-002', 'READING-001']),
        lookup,
      ).map(({ cardNumber }) => cardNumber),
    ).toEqual(['READING-001', 'READING-002'])
  })

  it('sorts the same member by the fixed color rank and then card number', () => {
    const colors = [
      'colorless',
      'yellow',
      'purple',
      'blue',
      'red',
      'green',
      'white',
    ] as const
    const localCards = colors.flatMap((color) => [
      card(`MEMBER-${color}-002`, 'holomem', {
        name: '同じメンバー',
        nameReading: 'おなじめんばー',
        colors: [color],
        bloomLevel: 'first',
      }),
      card(`MEMBER-${color}-001`, 'holomem', {
        name: '同じメンバー',
        nameReading: 'おなじめんばー',
        colors: [color],
        bloomLevel: 'first',
      }),
    ])
    const lookup = new Map(localCards.map((value) => [value.cardNumber, value]))

    expect(
      sortDeckEntriesForDisplay(
        entries(localCards.map(({ cardNumber }) => cardNumber)),
        lookup,
      ).map(({ cardNumber }) => cardNumber),
    ).toEqual(
      [...colors]
        .reverse()
        .flatMap((color) => [`MEMBER-${color}-001`, `MEMBER-${color}-002`]),
    )
  })

  it('falls back to normalized names deterministically without changing Oshi ordering', () => {
    const localCards = [
      card('HOLO-002', 'holomem', {
        name: 'カナ',
        bloomLevel: 'first',
      }),
      card('HOLO-001', 'holomem', {
        name: 'あき',
        bloomLevel: 'first',
      }),
      card('OSHI-002', 'oshi', { name: 'あき' }),
      card('OSHI-001', 'oshi', { name: 'しらかみ' }),
    ]
    const lookup = new Map(localCards.map((value) => [value.cardNumber, value]))

    expect(
      sortDeckEntriesForDisplay(
        entries(['HOLO-002', 'OSHI-002', 'HOLO-001', 'OSHI-001']),
        lookup,
      ).map(({ cardNumber }) => cardNumber),
    ).toEqual(['OSHI-001', 'OSHI-002', 'HOLO-001', 'HOLO-002'])
  })
})
