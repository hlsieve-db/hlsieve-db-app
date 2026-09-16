import { describe, expect, it } from 'vitest'

import type { Card } from '../cards/types'
import { normalizeSearchText } from './normalizeSearchText'
import { searchCards } from './searchCards'

function card(cardNumber: string, searchText: string, name = cardNumber): Card {
  return {
    cardNumber,
    name,
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
    searchText,
  }
}

const cards = [
  card(
    'hBP03-050',
    'hbp03-050 fuwamoco ふわもこ 白 どろー q&aの回答',
    'FUWAMOCO',
  ),
  card('hBP01-004', 'hbp01-004 白上ふぶき 白 げーまーず', '白上フブキ'),
  card('hSD01-001', 'hsd01-001 ときのそら 青 そらとも', 'ときのそら'),
]

const qaCard = card(
  'hSD16-007',
  normalizeSearchText(
    [
      'hSD16-007',
      'さくらみこ',
      'コラボしたとき、カードを1枚引く',
      '白上フブキがいる場合、この能力は使えますか？',
      'はい、使えます。ターンプレイヤーが処理します。',
      '白上フブキを別の場所から移動した場合も使えますか？',
      'いいえ、使えません。',
    ].join(' '),
  ),
  'さくらみこ',
)
qaCard.colors = ['red']
qaCard.abilities = [{ type: 'gift', text: 'コラボしたとき、カードを1枚引く' }]
qaCard.qas = [
  {
    id: 'Q633',
    question: '白上フブキがいる場合、この能力は使えますか？',
    answer: 'はい、使えます。ターンプレイヤーが処理します。',
    officialUrl: 'https://example.com/qa/Q633',
    relatedCardNumbers: ['hSD16-007'],
  },
  {
    id: 'Q634',
    question: '白上フブキを別の場所から移動した場合も使えますか？',
    answer: 'いいえ、使えません。',
    officialUrl: 'https://example.com/qa/Q634',
    relatedCardNumbers: ['hSD16-007'],
  },
]

describe('searchCards', () => {
  it.each(['', '   ', '　\t\n'])(
    'returns all cards for empty query %j',
    (query) => {
      expect(searchCards(cards, { query })).toEqual(cards)
    },
  )

  it('matches one token by substring', () => {
    expect(searchCards(cards, { query: 'q&a' })).toEqual([cards[0]])
  })

  it('returns no cards for an absent token', () => {
    expect(searchCards(cards, { query: '存在しない' })).toEqual([])
  })

  it('requires every token to match the same searchText', () => {
    expect(searchCards(cards, { query: 'ふわもこ 白' })).toEqual([cards[0]])
  })

  it('does not depend on token order', () => {
    expect(searchCards(cards, { query: '白 ふわもこ' })).toEqual([cards[0]])
  })

  it('does not match when one token is absent', () => {
    expect(searchCards(cards, { query: 'ふわもこ 赤' })).toEqual([])
  })

  it('normalizes Latin case and width', () => {
    expect(searchCards(cards, { query: 'ＦＵＷＡＭＯＣＯ' })).toEqual([
      cards[0],
    ])
  })

  it('normalizes Katakana to Hiragana', () => {
    expect(searchCards(cards, { query: 'フワモコ' })).toEqual([cards[0]])
  })

  it('normalizes half-width Katakana through NFKC', () => {
    expect(searchCards(cards, { query: 'ﾌﾜﾓｺ' })).toEqual([cards[0]])
  })

  it('looks up cardNumber case-insensitively', () => {
    expect(searchCards(cards, { query: 'HBP03-050' })).toEqual([cards[0]])
  })

  it('preserves input ordering', () => {
    expect(searchCards(cards, { query: '白' })).toEqual([cards[0], cards[1]])
  })

  it('returns a new array without mutating cards or card objects', () => {
    const input = [...cards]
    const before = structuredClone(input)
    const result = searchCards(input, { query: '' })

    expect(result).not.toBe(input)
    expect(result[0]).toBe(input[0])
    expect(input).toEqual(before)
  })

  it('does not perform generic Romaji conversion', () => {
    const withoutAlias = [card('TEST-001', 'test-001 ふわもこ')]
    expect(searchCards(withoutAlias, { query: 'fuwamoco' })).toEqual([])
  })

  it('matches indexed production terms through searchText', () => {
    expect(searchCards(cards, { query: 'どろー 回答' })).toEqual([cards[0]])
  })

  it('excludes linked Q&A by default and when explicitly disabled', () => {
    expect(searchCards([qaCard], { query: 'フブキ' })).toEqual([])
    expect(
      searchCards([qaCard], { query: 'フブキ', includeQa: false }),
    ).toEqual([])
  })

  it('includes linked Q&A questions and answers only when enabled', () => {
    expect(searchCards([qaCard], { query: 'フブキ', includeQa: true })).toEqual(
      [qaCard],
    )
    expect(
      searchCards([qaCard], {
        query: 'ターンプレイヤー',
        includeQa: true,
      }),
    ).toEqual([qaCard])
  })

  it('keeps card-body matching available regardless of the Q&A option', () => {
    expect(searchCards([qaCard], { query: 'コラボ' })).toEqual([qaCard])
    expect(searchCards([qaCard], { query: 'コラボ', includeQa: true })).toEqual(
      [qaCard],
    )
  })

  it('ANDs words across card body and Q&A without duplicating a card', () => {
    expect(
      searchCards([qaCard], {
        query: 'コラボ フブキ',
        includeQa: true,
      }),
    ).toEqual([qaCard])
    expect(
      searchCards([qaCard], {
        query: 'フブキ ターンプレイヤー',
        includeQa: true,
      }),
    ).toEqual([qaCard])
  })

  it('keeps empty-query counts identical and still ANDs structured filters', () => {
    expect(searchCards([qaCard], { query: '' })).toHaveLength(1)
    expect(searchCards([qaCard], { query: '', includeQa: true })).toHaveLength(
      1,
    )
    expect(
      searchCards([qaCard], {
        query: 'フブキ',
        includeQa: true,
        colors: ['blue'],
      }),
    ).toEqual([])
    expect(
      searchCards([qaCard], {
        query: 'フブキ',
        includeQa: true,
        colors: ['red'],
      }),
    ).toEqual([qaCard])
  })
})
