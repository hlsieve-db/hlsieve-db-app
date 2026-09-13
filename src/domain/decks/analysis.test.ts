import { describe, expect, it } from 'vitest'

import type { Card } from '../cards/types'
import { CURRENT_DECK_RESTRICTIONS } from './restrictions'
import type { Deck } from './types'
import { analyzeDeck } from './analysis'

function card(cardNumber: string, overrides: Partial<Card> = {}): Card {
  return {
    cardNumber,
    name: cardNumber,
    cardType: 'holomem',
    colors: ['red'],
    isBuzz: false,
    tags: [],
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

function deck(entries: Deck['entries'] = []): Deck {
  return {
    id: 'deck-1',
    name: '分析デッキ',
    entries,
    createdAt: '2026-09-13T00:00:00.000Z',
    updatedAt: '2026-09-13T00:00:00.000Z',
  }
}

const cards = [
  card('OSHI-1', { cardType: 'oshi', name: '推し' }),
  card('RED-1', { bloomLevel: 'debut', debutType: 'normal' }),
  card('MULTI-1', {
    colors: ['blue', 'red', 'blue'],
    bloomLevel: 'first',
    isBuzz: true,
  }),
  card('EXTRA-1', { bloomLevel: 'debut', debutType: 'extra' }),
  card('SECOND-1', { bloomLevel: 'second' }),
  card('LIMITED-1', {
    cardType: 'support',
    supportSearchCategory: 'limited',
    isLimited: true,
  }),
  card('GENERAL-1', {
    cardType: 'support',
    supportSearchCategory: 'general',
  }),
  card('TOOL-1', {
    cardType: 'support',
    supportSearchCategory: 'tool',
    supportType: 'tool',
  }),
  card('FAN-1', {
    cardType: 'support',
    supportSearchCategory: 'fan',
    supportType: 'fan',
  }),
  card('UNCATEGORIZED-1', { cardType: 'support', colors: [] }),
  card('CHEER-R', { cardType: 'cheer', colors: ['red'] }),
  card('CHEER-M', { cardType: 'cheer', colors: ['blue', 'green'] }),
  card('hBP01-030', { name: 'IRyS' }),
]

describe('analyzeDeck', () => {
  it('returns zero-safe empty analysis', () => {
    const result = analyzeDeck({
      deck: deck(),
      cards,
      restrictions: CURRENT_DECK_RESTRICTIONS,
    })

    expect(result.totals).toEqual({
      oshi: 0,
      main: 0,
      cheer: 0,
      unknown: 0,
      total: 0,
    })
    expect(result.colors).toEqual([])
    expect(result.cardTypes).toEqual([])
    expect(result.bloomLevels).toEqual([])
    expect(result.cheerColors).toEqual([])
  })

  it('aggregates actual zone totals and retains unknown quantity in total', () => {
    const result = analyzeDeck({
      deck: deck([
        { cardNumber: 'OSHI-1', quantity: 1 },
        { cardNumber: 'RED-1', quantity: 3 },
        { cardNumber: 'CHEER-R', quantity: 4 },
        { cardNumber: 'UNKNOWN', quantity: 2 },
      ]),
      cards,
      restrictions: [],
    })

    expect(result.totals).toEqual({
      oshi: 1,
      main: 3,
      cheer: 4,
      unknown: 2,
      total: 10,
    })
    expect(result.oshiCards[0]).toMatchObject({ quantity: 1 })
    expect(result.unknownCards).toEqual([
      { cardNumber: 'UNKNOWN', quantity: 2 },
    ])
  })

  it('uses exclusive canonical multicolor categories that total 100%', () => {
    const result = analyzeDeck({
      deck: deck([
        { cardNumber: 'RED-1', quantity: 3 },
        { cardNumber: 'MULTI-1', quantity: 2 },
        { cardNumber: 'UNCATEGORIZED-1', quantity: 1 },
      ]),
      cards,
      restrictions: [],
    })

    expect(result.colors).toEqual([
      { key: 'red', label: '赤', quantity: 3, percentage: 50 },
      { key: 'red/blue', label: '赤/青', quantity: 2, percentage: 33.3 },
      { key: 'unknown', label: '分類不能', quantity: 1, percentage: 16.7 },
    ])
    expect(result.colors.reduce((sum, item) => sum + item.quantity, 0)).toBe(6)
  })

  it('uses existing support search categories and aggregates quantities', () => {
    const result = analyzeDeck({
      deck: deck([
        { cardNumber: 'RED-1', quantity: 4 },
        { cardNumber: 'LIMITED-1', quantity: 1 },
        { cardNumber: 'GENERAL-1', quantity: 2 },
        { cardNumber: 'TOOL-1', quantity: 3 },
        { cardNumber: 'FAN-1', quantity: 4 },
        { cardNumber: 'UNCATEGORIZED-1', quantity: 1 },
      ]),
      cards,
      restrictions: [],
    })

    expect(
      result.cardTypes.map(({ label, quantity }) => [label, quantity]),
    ).toEqual([
      ['ホロメン', 4],
      ['LIMITED', 1],
      ['サポート（LIMITED以外）', 2],
      ['ツール', 3],
      ['ファン', 4],
      ['分類不能', 1],
    ])
    expect(result.cardTypes[0]?.percentage).toBe(26.7)
  })

  it('keeps Bloom stages exclusive and Buzz as a separate overlapping count', () => {
    const result = analyzeDeck({
      deck: deck([
        { cardNumber: 'RED-1', quantity: 3 },
        { cardNumber: 'MULTI-1', quantity: 2 },
        { cardNumber: 'EXTRA-1', quantity: 1 },
        { cardNumber: 'SECOND-1', quantity: 4 },
        { cardNumber: 'TOOL-1', quantity: 8 },
      ]),
      cards,
      restrictions: [],
    })

    expect(
      result.bloomLevels.map(({ label, quantity }) => [label, quantity]),
    ).toEqual([
      ['Debut（通常）', 3],
      ['Debut（エクストラ）', 1],
      ['1st', 2],
      ['2nd', 4],
    ])
    expect(result.buzzQuantity).toBe(2)
    expect(
      result.bloomLevels.reduce((sum, item) => sum + item.quantity, 0),
    ).toBe(10)
  })

  it('analyzes Cheer colors with the same multicolor semantics', () => {
    const result = analyzeDeck({
      deck: deck([
        { cardNumber: 'CHEER-R', quantity: 12 },
        { cardNumber: 'CHEER-M', quantity: 8 },
      ]),
      cards,
      restrictions: [],
    })

    expect(result.cheerColors).toEqual([
      { key: 'red', label: '赤', quantity: 12, percentage: 60 },
      { key: 'green/blue', label: '緑/青', quantity: 8, percentage: 40 },
    ])
  })

  it('uses the supplied restriction source and marks at-limit and over-limit entries', () => {
    const atLimit = analyzeDeck({
      deck: deck([{ cardNumber: 'hBP01-030', quantity: 1 }]),
      cards,
      restrictions: CURRENT_DECK_RESTRICTIONS,
    })
    const overLimit = analyzeDeck({
      deck: deck([{ cardNumber: 'hBP01-030', quantity: 2 }]),
      cards,
      restrictions: CURRENT_DECK_RESTRICTIONS,
    })

    expect(atLimit.restrictedCards).toEqual([
      {
        cardNumber: 'hBP01-030',
        name: 'IRyS',
        quantity: 1,
        maxCopies: 1,
        isOverLimit: false,
      },
    ])
    expect(overLimit.restrictedCards[0]?.isOverLimit).toBe(true)
    expect(
      analyzeDeck({
        deck: deck([{ cardNumber: 'hBP01-030', quantity: 2 }]),
        cards,
        restrictions: [],
      }).restrictedCards,
    ).toEqual([])
  })

  it('is deterministic and does not mutate inputs', () => {
    const sourceDeck = deck([
      { cardNumber: 'MULTI-1', quantity: 2 },
      { cardNumber: 'RED-1', quantity: 1 },
    ])
    const entriesBefore = structuredClone(sourceDeck.entries)

    expect(analyzeDeck({ deck: sourceDeck, cards, restrictions: [] })).toEqual(
      analyzeDeck({ deck: sourceDeck, cards, restrictions: [] }),
    )
    expect(sourceDeck.entries).toEqual(entriesBefore)
  })
})
