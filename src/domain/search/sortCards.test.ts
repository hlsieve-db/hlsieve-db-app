import { describe, expect, it } from 'vitest'

import type { Card } from '../cards/types'
import { sortCards } from './sortCards'

function card(cardNumber: string, releaseDate?: string): Card {
  return {
    cardNumber,
    name: cardNumber,
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
    searchText: cardNumber.toLowerCase(),
    ...(releaseDate ? { releaseDate } : {}),
  }
}

function numbers(cards: readonly Card[]): string[] {
  return cards.map((item) => item.cardNumber)
}

describe('sortCards', () => {
  const cards = [
    card('CARD-003', '2025-01-01'),
    card('CARD-001'),
    card('CARD-004', '2024-01-01'),
    card('CARD-002', '2025-01-01'),
  ]

  it('preserves input order for default sort', () => {
    expect(numbers(sortCards(cards, 'default'))).toEqual(numbers(cards))
  })

  it('sorts cardNumber ascending lexically', () => {
    expect(numbers(sortCards(cards, 'card_number_asc'))).toEqual([
      'CARD-001',
      'CARD-002',
      'CARD-003',
      'CARD-004',
    ])
  })

  it('sorts releaseDate descending with missing dates last', () => {
    expect(numbers(sortCards(cards, 'release_date_desc'))).toEqual([
      'CARD-002',
      'CARD-003',
      'CARD-004',
      'CARD-001',
    ])
  })

  it('sorts releaseDate ascending with missing dates last', () => {
    expect(numbers(sortCards(cards, 'release_date_asc'))).toEqual([
      'CARD-004',
      'CARD-002',
      'CARD-003',
      'CARD-001',
    ])
  })

  it('uses cardNumber ascending as the same-date tie-break', () => {
    expect(
      numbers(
        sortCards(
          [card('CARD-009', '2025-01-01'), card('CARD-008', '2025-01-01')],
          'release_date_desc',
        ),
      ),
    ).toEqual(['CARD-008', 'CARD-009'])
  })

  it('uses cardNumber as the missing-date tie-break', () => {
    expect(
      numbers(
        sortCards([card('CARD-009'), card('CARD-008')], 'release_date_asc'),
      ),
    ).toEqual(['CARD-008', 'CARD-009'])
  })

  it('does not mutate the input array or Card objects', () => {
    const input = [...cards]
    const before = structuredClone(input)
    const result = sortCards(input, 'release_date_desc')

    expect(result).not.toBe(input)
    expect(result[0]).toBe(input[3])
    expect(input).toEqual(before)
  })

  it.each([
    'default',
    'card_number_asc',
    'release_date_desc',
    'release_date_asc',
  ] as const)('is deterministic for %s', (sort) => {
    expect(sortCards(cards, sort)).toEqual(sortCards(cards, sort))
  })
})
