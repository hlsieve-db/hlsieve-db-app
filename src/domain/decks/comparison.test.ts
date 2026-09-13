import { describe, expect, it } from 'vitest'

import type { Card } from '../cards/types'
import { compareDecks } from './comparison'
import { CURRENT_DECK_RESTRICTIONS } from './restrictions'
import type { Deck } from './types'

function card(cardNumber: string, overrides: Partial<Card> = {}): Card {
  return {
    cardNumber,
    name: cardNumber,
    cardType: 'holomem',
    colors: ['red'],
    bloomLevel: 'debut',
    debutType: 'normal',
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

function deck(id: string, entries: Deck['entries'] = []): Deck {
  return {
    id,
    name: id,
    entries,
    createdAt: '2026-09-14T00:00:00.000Z',
    updatedAt: '2026-09-14T00:00:00.000Z',
  }
}

const cards = [
  card('OSHI-A', { cardType: 'oshi', name: '推しA' }),
  card('OSHI-B', { cardType: 'oshi', name: '推しB', colors: ['blue'] }),
  card('OSHI-UNKNOWN', {
    cardType: 'oshi',
    name: '色不明の推し',
    colors: [],
  }),
  card('MAIN-A', { name: '日本語カード' }),
  card('MAIN-B', { colors: ['blue', 'red'], bloomLevel: 'first' }),
  card('BUZZ', { colors: ['blue'], bloomLevel: 'second', isBuzz: true }),
  card('SUPPORT', {
    cardType: 'support',
    colors: [],
    supportSearchCategory: 'limited',
  }),
  card('CHEER-R', { cardType: 'cheer', colors: ['red'] }),
  card('CHEER-B', { cardType: 'cheer', colors: ['blue'] }),
  card('hBP01-030', { name: 'IRyS', bloomLevel: 'first' }),
]

function compare(before: Deck, after: Deck) {
  return compareDecks({
    beforeDeck: before,
    afterDeck: after,
    cards,
    restrictions: CURRENT_DECK_RESTRICTIONS,
  })
}

describe('compareDecks', () => {
  it('reports identical and empty Decks without changes', () => {
    expect(compare(deck('A'), deck('B'))).toMatchObject({
      cardChanges: [],
      isIdentical: true,
    })
    const same = deck('same', [{ cardNumber: 'MAIN-A', quantity: 2 }])
    expect(compare(same, same).isIdentical).toBe(true)
  })

  it('classifies additions, removals, increases, and decreases by delta', () => {
    const result = compare(
      deck('A', [
        { cardNumber: 'MAIN-A', quantity: 2 },
        { cardNumber: 'MAIN-B', quantity: 4 },
        { cardNumber: 'BUZZ', quantity: 3 },
      ]),
      deck('B', [
        { cardNumber: 'MAIN-A', quantity: 4 },
        { cardNumber: 'MAIN-B', quantity: 1 },
        { cardNumber: 'SUPPORT', quantity: 2 },
      ]),
    )

    expect(
      result.cardChanges.map(
        ({ cardNumber, kind, beforeQuantity, afterQuantity, delta }) => [
          cardNumber,
          kind,
          beforeQuantity,
          afterQuantity,
          delta,
        ],
      ),
    ).toEqual([
      ['BUZZ', 'removed', 3, 0, -3],
      ['MAIN-A', 'increased', 2, 4, 2],
      ['MAIN-B', 'decreased', 4, 1, -3],
      ['SUPPORT', 'added', 0, 2, 2],
    ])
  })

  it('aggregates duplicate cardNumber entries before comparing', () => {
    const result = compare(
      deck('A', [
        { cardNumber: 'MAIN-A', quantity: 1 },
        { cardNumber: 'MAIN-A', quantity: 2 },
      ]),
      deck('B', [{ cardNumber: 'MAIN-A', quantity: 4 }]),
    )
    expect(result.cardChanges).toMatchObject([
      { cardNumber: 'MAIN-A', beforeQuantity: 3, afterQuantity: 4, delta: 1 },
    ])
  })

  it('retains unknown cards and sorts by zone then cardNumber', () => {
    const result = compare(
      deck('A'),
      deck('B', [
        { cardNumber: 'UNKNOWN-Z', quantity: 1 },
        { cardNumber: 'CHEER-R', quantity: 1 },
        { cardNumber: 'MAIN-B', quantity: 1 },
        { cardNumber: 'OSHI-A', quantity: 1 },
        { cardNumber: 'UNKNOWN-A', quantity: 2 },
      ]),
    )
    expect(
      result.cardChanges.map(({ cardNumber, name, zone }) => [
        cardNumber,
        name,
        zone,
      ]),
    ).toEqual([
      ['OSHI-A', '推しA', 'oshi'],
      ['MAIN-B', 'MAIN-B', 'main'],
      ['CHEER-R', 'CHEER-R', 'cheer'],
      ['UNKNOWN-A', undefined, 'unknown'],
      ['UNKNOWN-Z', undefined, 'unknown'],
    ])
  })

  it('compares Oshi identities for same, changed, and missing states', () => {
    const oshiA = { cardNumber: 'OSHI-A', quantity: 1 }
    const same = compare(deck('A', [oshiA]), deck('B', [oshiA]))
    const changed = compare(
      deck('A', [oshiA]),
      deck('B', [{ cardNumber: 'OSHI-B', quantity: 1 }]),
    )
    const missing = compare(deck('A', [oshiA]), deck('B'))

    expect(same.oshi.changed).toBe(false)
    expect(changed.oshi.changed).toBe(true)
    expect(changed.oshi.after[0]?.card.cardNumber).toBe('OSHI-B')
    expect(missing.oshi.changed).toBe(true)
    expect(missing.oshi.after).toEqual([])
  })

  it('keeps a known Oshi identity when its color is unavailable', () => {
    const result = compare(
      deck('A', [{ cardNumber: 'OSHI-A', quantity: 1 }]),
      deck('B', [{ cardNumber: 'OSHI-UNKNOWN', quantity: 1 }]),
    )

    expect(result.oshi.changed).toBe(true)
    expect(result.oshi.after).toMatchObject([
      {
        card: { cardNumber: 'OSHI-UNKNOWN', name: '色不明の推し', colors: [] },
        quantity: 1,
      },
    ])
  })

  it('compares totals, exclusive multicolor, type, Bloom, Buzz, and Cheer', () => {
    const result = compare(
      deck('A', [
        { cardNumber: 'MAIN-A', quantity: 2 },
        { cardNumber: 'BUZZ', quantity: 1 },
        { cardNumber: 'CHEER-R', quantity: 2 },
      ]),
      deck('B', [
        { cardNumber: 'MAIN-B', quantity: 3 },
        { cardNumber: 'SUPPORT', quantity: 1 },
        { cardNumber: 'BUZZ', quantity: 2 },
        { cardNumber: 'CHEER-B', quantity: 4 },
      ]),
    )

    expect(result.analysisDiff.totals).toContainEqual({
      key: 'main',
      beforeQuantity: 3,
      afterQuantity: 6,
      delta: 3,
    })
    expect(result.analysisDiff.colors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: '赤', beforeQuantity: 2 }),
        expect.objectContaining({
          label: '赤/青',
          beforeQuantity: 0,
          afterQuantity: 3,
        }),
      ]),
    )
    expect(result.analysisDiff.cardTypes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'ホロメン' }),
        expect.objectContaining({ label: 'LIMITED', afterQuantity: 1 }),
      ]),
    )
    expect(result.analysisDiff.bloomLevels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Debut（通常）' }),
        expect.objectContaining({ label: '1st', afterQuantity: 3 }),
        expect.objectContaining({ label: '2nd' }),
      ]),
    )
    expect(result.analysisDiff.buzz).toEqual({
      beforeQuantity: 1,
      afterQuantity: 2,
      delta: 1,
    })
    expect(result.analysisDiff.cheerColors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: '赤', afterQuantity: 0 }),
        expect.objectContaining({ label: '青', beforeQuantity: 0 }),
      ]),
    )
  })

  it('keeps percentage values finite and represents missing-side categories', () => {
    const result = compare(
      deck('A', [{ cardNumber: 'MAIN-A', quantity: 1 }]),
      deck('B', [{ cardNumber: 'MAIN-B', quantity: 1 }]),
    )
    expect(result.analysisDiff.colors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: '赤',
          beforePercentage: 100,
          afterPercentage: undefined,
        }),
        expect.objectContaining({
          label: '赤/青',
          beforePercentage: undefined,
          afterPercentage: 100,
        }),
      ]),
    )
    for (const item of result.analysisDiff.colors) {
      for (const value of [item.beforePercentage, item.afterPercentage]) {
        if (value !== undefined) expect(Number.isFinite(value)).toBe(true)
      }
    }
  })

  it('compares restrictions from the supplied single source', () => {
    const before = deck('A', [{ cardNumber: 'hBP01-030', quantity: 1 }])
    const after = deck('B', [{ cardNumber: 'hBP01-030', quantity: 2 }])
    const result = compare(before, after)

    expect(result.analysisDiff.restrictions).toEqual([
      {
        cardNumber: 'hBP01-030',
        name: 'IRyS',
        maxCopies: 1,
        beforeQuantity: 1,
        afterQuantity: 2,
        beforeOverLimit: false,
        afterOverLimit: true,
      },
    ])
    expect(
      compareDecks({
        beforeDeck: before,
        afterDeck: after,
        cards,
        restrictions: [],
      }).analysisDiff.restrictions,
    ).toEqual([])
  })

  it('represents unchanged restrictions and over-limit to valid changes', () => {
    const same = compare(
      deck('A', [{ cardNumber: 'hBP01-030', quantity: 1 }]),
      deck('B', [{ cardNumber: 'hBP01-030', quantity: 1 }]),
    )
    const becomesValid = compare(
      deck('A', [{ cardNumber: 'hBP01-030', quantity: 2 }]),
      deck('B', [{ cardNumber: 'hBP01-030', quantity: 1 }]),
    )

    expect(same.analysisDiff.restrictions[0]).toMatchObject({
      beforeQuantity: 1,
      afterQuantity: 1,
      beforeOverLimit: false,
      afterOverLimit: false,
    })
    expect(becomesValid.analysisDiff.restrictions[0]).toMatchObject({
      beforeQuantity: 2,
      afterQuantity: 1,
      beforeOverLimit: true,
      afterOverLimit: false,
    })
  })
})
