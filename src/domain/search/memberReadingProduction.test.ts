import { describe, expect, it } from 'vitest'

import cardsFile from '../../../public/cards.json'
import type { Card } from '../cards/types'
import { searchCards } from './searchCards'

const cards = cardsFile.cards as Card[]

function numbersForName(name: string): string[] {
  return cards
    .filter((card) => card.name === name)
    .map((card) => card.cardNumber)
    .sort()
}

function searchNumbers(query: string): string[] {
  return searchCards(cards, { query })
    .map((card) => card.cardNumber)
    .sort()
}

function matchingIdentityNumbers(query: string, name: string): string[] {
  const expected = new Set(numbersForName(name))
  return searchNumbers(query).filter((cardNumber) => expected.has(cardNumber))
}

describe('production member reading search', () => {
  it('finds every current AZKi logical card with hiragana, Katakana, and mixed kana', () => {
    const expected = numbersForName('AZKi')
    expect(expected.length).toBeGreaterThan(0)

    expect(searchNumbers('あずき')).toEqual(expected)
    expect(searchNumbers('アズキ')).toEqual(expected)
    expect(searchNumbers('あズき')).toEqual(expected)
  })

  it.each(['しらかみふぶき', 'シラカミフブキ', 'しらかみフブキ'])(
    'finds every Shirokami Fubuki card with %s',
    (query) => {
      expect(searchNumbers(query)).toEqual(numbersForName('白上フブキ'))
    },
  )

  it.each([
    'パヴォリア・レイネ',
    'パヴォリアレイネ',
    'パヴォリア レイネ',
    'パヴォリア　レイネ',
  ])('keeps foreign-name separator variants equivalent: %s', (query) => {
    expect(matchingIdentityNumbers(query, 'パヴォリア・レイネ')).toEqual(
      numbersForName('パヴォリア・レイネ'),
    )
  })

  it.each([
    'あきろーぜんたーる',
    'アキローゼンタール',
    'アキ・ローゼンタール',
    'アキ ローゼンタール',
    'アキロゼ',
    'あきろぜ',
    'あきロゼ',
  ])('finds every Aki Rosenthal card with %s', (query) => {
    expect(matchingIdentityNumbers(query, 'アキ・ローゼンタール')).toEqual(
      numbersForName('アキ・ローゼンタール'),
    )
  })

  it('keeps ordinary multi-word AND search semantics', () => {
    const result = searchCards(cards, { query: 'しらかみふぶき コラボ' })

    expect(result.length).toBeGreaterThan(0)
    expect(result.every((card) => card.name === '白上フブキ')).toBe(true)
  })
})
