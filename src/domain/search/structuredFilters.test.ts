import { describe, expect, it } from 'vitest'

import type { Card } from '../cards/types'
import { searchCards, type SearchCardsInput } from './searchCards'

function card(overrides: Partial<Card>): Card {
  return {
    cardNumber: 'TEST-001',
    name: 'テストカード',
    cardType: 'holomem',
    colors: [],
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
    searchText: 'てすとかーど',
    ...overrides,
  }
}

const cards = [
  card({
    cardNumber: 'MULTI-001',
    name: 'マルチ',
    cardType: 'holomem',
    colors: ['red', 'blue', 'green'],
    bloomLevel: 'first',
    isBuzz: true,
    criticalColors: ['red', 'blue'],
    effectTags: ['draw', 'deck_search', 'gift'],
    searchText: 'まるち どろー',
  }),
  card({
    cardNumber: 'RED-001',
    name: 'レッド',
    cardType: 'holomem',
    colors: ['red'],
    bloomLevel: 'first',
    criticalColors: ['red'],
    effectTags: ['draw'],
    searchText: 'れっど どろー',
  }),
  card({
    cardNumber: 'BLUE-001',
    name: 'ブルー',
    cardType: 'oshi',
    colors: ['blue'],
    bloomLevel: 'second',
    criticalColors: [],
    effectTags: ['deck_search'],
    searchText: 'ぶるー さーち',
  }),
  card({
    cardNumber: 'COLORLESS-001',
    name: '無色',
    cardType: 'support',
    colors: ['colorless'],
    bloomLevel: 'debut',
    debutType: 'normal',
    searchText: '無色 さぽーと',
  }),
  card({
    cardNumber: 'EXTRA-001',
    name: 'エクストラ',
    cardType: 'cheer',
    colors: ['green'],
    bloomLevel: 'debut',
    debutType: 'extra',
    searchText: 'えくすとら えーる',
  }),
  card({
    cardNumber: 'SPOT-001',
    name: 'スポット',
    colors: ['purple'],
    bloomLevel: 'spot',
    searchText: 'すぽっと',
  }),
  card({
    cardNumber: 'NONE-001',
    name: 'レベルなし',
    colors: ['yellow'],
    searchText: 'れべるなし',
  }),
]

function ids(input: SearchCardsInput): string[] {
  return searchCards(cards, input).map((item) => item.cardNumber)
}

describe('structured colors filter', () => {
  it('treats undefined and empty selections as no-op', () => {
    expect(ids({ query: '' })).toEqual(cards.map((item) => item.cardNumber))
    expect(ids({ query: '', colors: [], colorMode: 'and' })).toEqual(
      cards.map((item) => item.cardNumber),
    )
  })

  it('uses OR for a single color', () => {
    expect(ids({ query: '', colors: ['red'] })).toEqual([
      'MULTI-001',
      'RED-001',
    ])
  })

  it('uses OR for multiple colors by default', () => {
    expect(ids({ query: '', colors: ['red', 'blue'] })).toEqual([
      'MULTI-001',
      'RED-001',
      'BLUE-001',
    ])
  })

  it('requires all selected colors in AND mode', () => {
    expect(
      ids({ query: '', colors: ['red', 'blue'], colorMode: 'and' }),
    ).toEqual(['MULTI-001'])
  })

  it('rejects a card missing one AND color', () => {
    expect(
      ids({ query: 'れっど', colors: ['red', 'blue'], colorMode: 'and' }),
    ).toEqual([])
  })

  it('allows additional card colors in AND mode', () => {
    expect(
      ids({ query: '', colors: ['red', 'blue'], colorMode: 'and' }),
    ).toContain('MULTI-001')
  })

  it('treats colorless as an ordinary domain color', () => {
    expect(ids({ query: '', colors: ['colorless'] })).toEqual(['COLORLESS-001'])
  })

  it('ignores duplicate selected colors', () => {
    expect(
      ids({ query: '', colors: ['red', 'red'], colorMode: 'and' }),
    ).toEqual(['MULTI-001', 'RED-001'])
  })
})

describe('structured card type filter', () => {
  it('matches one card type', () => {
    expect(ids({ query: '', cardTypes: ['oshi'] })).toEqual(['BLUE-001'])
  })

  it('combines selected card types with OR', () => {
    expect(ids({ query: '', cardTypes: ['oshi', 'support'] })).toEqual([
      'BLUE-001',
      'COLORLESS-001',
    ])
  })

  it('returns no cards when no card type matches', () => {
    expect(ids({ query: 'まるち', cardTypes: ['cheer'] })).toEqual([])
  })

  it('treats an empty card type selection as no-op', () => {
    expect(ids({ query: 'どろー', cardTypes: [] })).toEqual([
      'MULTI-001',
      'RED-001',
    ])
  })
})

describe('structured bloom filter', () => {
  it.each([
    ['debut_normal', ['COLORLESS-001']],
    ['debut_extra', ['EXTRA-001']],
    ['first', ['MULTI-001', 'RED-001']],
    ['second', ['BLUE-001']],
    ['spot', ['SPOT-001']],
  ] as const)('matches %s', (bloom, expected) => {
    expect(ids({ query: '', bloom: [bloom] })).toEqual(expected)
  })

  it('uses only isBuzz for the Buzz pseudo filter', () => {
    expect(ids({ query: '', bloom: ['buzz'] })).toEqual(['MULTI-001'])
  })

  it('does not match a non-Buzz card at the same bloom level', () => {
    expect(ids({ query: 'れっど', bloom: ['buzz'] })).toEqual([])
  })

  it('combines first and Buzz with OR', () => {
    expect(ids({ query: '', bloom: ['first', 'buzz'] })).toEqual([
      'MULTI-001',
      'RED-001',
    ])
  })

  it('does not match an undefined bloomLevel', () => {
    expect(ids({ query: 'れべるなし', bloom: ['first'] })).toEqual([])
  })

  it('treats an empty bloom selection as no-op', () => {
    expect(ids({ query: 'れべるなし', bloom: [] })).toEqual(['NONE-001'])
  })
})

describe('structured critical color filter', () => {
  it('matches any selected critical color by default', () => {
    expect(ids({ query: '', criticalColors: ['blue'] })).toEqual(['MULTI-001'])
  })

  it('supports explicit OR mode', () => {
    expect(
      ids({
        query: '',
        criticalColors: ['red', 'blue'],
        criticalColorMode: 'or',
      }),
    ).toEqual(['MULTI-001', 'RED-001'])
  })

  it('requires all selected critical colors in AND mode', () => {
    expect(
      ids({
        query: '',
        criticalColors: ['red', 'blue'],
        criticalColorMode: 'and',
      }),
    ).toEqual(['MULTI-001'])
  })

  it('rejects a card missing one critical color', () => {
    expect(
      ids({
        query: 'れっど',
        criticalColors: ['red', 'blue'],
        criticalColorMode: 'and',
      }),
    ).toEqual([])
  })

  it('does not match an empty card value when a color is selected', () => {
    expect(ids({ query: 'ぶるー', criticalColors: ['red'] })).toEqual([])
  })

  it('treats an empty selection as no-op', () => {
    expect(ids({ query: 'ぶるー', criticalColors: [] })).toEqual(['BLUE-001'])
  })

  it('ignores duplicate selected critical colors', () => {
    expect(
      ids({
        query: '',
        criticalColors: ['red', 'red'],
        criticalColorMode: 'and',
      }),
    ).toEqual(['MULTI-001', 'RED-001'])
  })
})

describe('structured EffectTag filter', () => {
  it('matches one tag', () => {
    expect(ids({ query: '', effectTags: ['gift'] })).toEqual(['MULTI-001'])
  })

  it('requires all selected tags by default', () => {
    expect(ids({ query: '', effectTags: ['draw', 'deck_search'] })).toEqual([
      'MULTI-001',
    ])
  })

  it('rejects a card missing one tag in default AND mode', () => {
    expect(
      ids({ query: 'れっど', effectTags: ['draw', 'deck_search'] }),
    ).toEqual([])
  })

  it('allows additional card tags in AND mode', () => {
    expect(ids({ query: '', effectTags: ['draw', 'gift'] })).toEqual([
      'MULTI-001',
    ])
  })

  it('supports OR mode', () => {
    expect(
      ids({
        query: '',
        effectTags: ['draw', 'deck_search'],
        effectTagMode: 'or',
      }),
    ).toEqual(['MULTI-001', 'RED-001', 'BLUE-001'])
  })

  it('treats an empty selection as no-op', () => {
    expect(ids({ query: 'すぽっと', effectTags: [] })).toEqual(['SPOT-001'])
  })

  it('ignores duplicate selected tags in AND mode', () => {
    expect(ids({ query: '', effectTags: ['draw', 'draw'] })).toEqual([
      'MULTI-001',
      'RED-001',
    ])
  })
})

describe('combined structured filters', () => {
  const allFilters: SearchCardsInput = {
    query: 'ドロー',
    colors: ['red', 'blue'],
    colorMode: 'and',
    cardTypes: ['holomem'],
    bloom: ['first', 'buzz'],
    criticalColors: ['red', 'blue'],
    criticalColorMode: 'and',
    effectTags: ['draw', 'deck_search'],
  }

  it('combines query and color with AND', () => {
    expect(ids({ query: 'どろー', colors: ['blue'] })).toEqual(['MULTI-001'])
  })

  it('combines color and card type with AND', () => {
    expect(ids({ query: '', colors: ['blue'], cardTypes: ['oshi'] })).toEqual([
      'BLUE-001',
    ])
  })

  it('combines bloom and EffectTag with AND', () => {
    expect(ids({ query: '', bloom: ['buzz'], effectTags: ['draw'] })).toEqual([
      'MULTI-001',
    ])
  })

  it('combines every category with AND', () => {
    expect(ids(allFilters)).toEqual(['MULTI-001'])
  })

  it('excludes a card when one category fails', () => {
    expect(ids({ ...allFilters, cardTypes: ['oshi'] })).toEqual([])
  })

  it('preserves text-only results when filters are empty', () => {
    expect(
      ids({
        query: 'どろー',
        colors: [],
        cardTypes: [],
        bloom: [],
        criticalColors: [],
        effectTags: [],
      }),
    ).toEqual(['MULTI-001', 'RED-001'])
  })

  it('preserves input order', () => {
    expect(ids({ query: '', colors: ['red', 'blue'] })).toEqual([
      'MULTI-001',
      'RED-001',
      'BLUE-001',
    ])
  })

  it('does not mutate cards, nested fields, input, or selections', () => {
    const cardInput = structuredClone(cards)
    const searchInput = structuredClone(allFilters)
    const cardsBefore = structuredClone(cardInput)
    const inputBefore = structuredClone(searchInput)

    const result = searchCards(cardInput, searchInput)

    expect(result).not.toBe(cardInput)
    expect(result[0]).toBe(cardInput[0])
    expect(cardInput).toEqual(cardsBefore)
    expect(searchInput).toEqual(inputBefore)
  })
})
