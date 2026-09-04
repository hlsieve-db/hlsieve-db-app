import { describe, expect, it } from 'vitest'

import type { Card } from '../cards/types'
import { getCardSearchResults } from './getCardSearchResults'
import { searchCards } from './searchCards'

function card(
  cardNumber: string,
  releaseDate: string | undefined,
  overrides: Partial<Card> = {},
): Card {
  return {
    cardNumber,
    name: cardNumber,
    cardType: 'holomem',
    colors: ['red'],
    bloomLevel: 'first',
    isBuzz: false,
    tags: [],
    abilities: [],
    arts: [],
    batonPass: [],
    effectTags: ['draw'],
    criticalColors: [],
    rarities: [],
    products: [],
    illustrators: [],
    qas: [],
    searchText: `${cardNumber.toLowerCase()} target どろー`,
    ...(releaseDate ? { releaseDate } : {}),
    ...overrides,
  }
}

const cards = [
  card('CARD-005', '2025-01-01'),
  card('CARD-001', '2024-01-01', { colors: ['blue'], isBuzz: true }),
  card('CARD-004', '2023-01-01'),
  card('CARD-002', '2022-01-01', { cardType: 'oshi' }),
  card('CARD-003', undefined, {
    searchText: 'card-003 other',
    effectTags: [],
  }),
]

describe('getCardSearchResults', () => {
  it('applies query, then sort, then pagination', () => {
    const result = getCardSearchResults(cards, {
      query: 'target',
      sort: 'card_number_asc',
      page: 2,
      pageSize: 2,
    })
    expect(result.items.map((item) => item.cardNumber)).toEqual([
      'CARD-004',
      'CARD-005',
    ])
    expect(result.totalItems).toBe(4)
  })

  it('applies structured filters before sorting and pagination', () => {
    const result = getCardSearchResults(cards, {
      query: '',
      colors: ['red'],
      cardTypes: ['holomem'],
      effectTags: ['draw'],
      sort: 'release_date_asc',
      pageSize: 2,
    })
    expect(result.items.map((item) => item.cardNumber)).toEqual([
      'CARD-004',
      'CARD-005',
    ])
    expect(result.totalItems).toBe(2)
  })

  it('preserves filtered input order with default sort', () => {
    const result = getCardSearchResults(cards, {
      query: 'target',
      sort: 'default',
      pageSize: 10,
    })
    expect(result.items).toEqual(searchCards(cards, { query: 'target' }))
  })

  it('sorts by releaseDate before slicing pages', () => {
    const first = getCardSearchResults(cards, {
      query: '',
      sort: 'release_date_desc',
      page: 1,
      pageSize: 2,
    })
    const second = getCardSearchResults(cards, {
      query: '',
      sort: 'release_date_desc',
      page: 2,
      pageSize: 2,
    })
    expect(
      [...first.items, ...second.items].map((item) => item.cardNumber),
    ).toEqual(['CARD-005', 'CARD-001', 'CARD-004', 'CARD-002'])
  })

  it('bases page metadata on the filtered count', () => {
    const result = getCardSearchResults(cards, {
      query: 'target',
      page: 1,
      pageSize: 3,
    })
    expect(result).toMatchObject({ totalItems: 4, totalPages: 2 })
  })

  it('clamps the page after filtering narrows the result', () => {
    const result = getCardSearchResults(cards, {
      query: '',
      colors: ['blue'],
      page: 10,
      pageSize: 1,
    })
    expect(result).toMatchObject({ totalItems: 1, totalPages: 1, page: 1 })
    expect(result.items.map((item) => item.cardNumber)).toEqual(['CARD-001'])
  })

  it('returns no-result pagination metadata', () => {
    expect(
      getCardSearchResults(cards, { query: 'missing', page: 10 }),
    ).toMatchObject({
      items: [],
      totalItems: 0,
      totalPages: 0,
      page: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    })
  })

  it('preserves query, structured filter, and Buzz semantics', () => {
    const result = getCardSearchResults(cards, {
      query: 'ドロー',
      colors: ['blue'],
      bloom: ['buzz'],
      effectTags: ['draw'],
      pageSize: 10,
    })
    expect(result.items.map((item) => item.cardNumber)).toEqual(['CARD-001'])
  })

  it('does not mutate cards or input', () => {
    const cardInput = structuredClone(cards)
    const input = {
      query: 'target',
      sort: 'release_date_desc' as const,
      page: 2,
      pageSize: 2,
      colors: ['red'] as const,
    }
    const cardsBefore = structuredClone(cardInput)
    const inputBefore = structuredClone(input)

    const result = getCardSearchResults(cardInput, input)

    expect(result.items[0]).toBe(cardInput[3])
    expect(cardInput).toEqual(cardsBefore)
    expect(input).toEqual(inputBefore)
  })
})
