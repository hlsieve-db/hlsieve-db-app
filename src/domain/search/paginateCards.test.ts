import { describe, expect, it } from 'vitest'

import type { Card } from '../cards/types'
import { DEFAULT_CARD_PAGE_SIZE } from './constants'
import { paginateCards } from './paginateCards'

function cards(count: number): Card[] {
  return Array.from({ length: count }, (_, index) => ({
    cardNumber: `CARD-${String(index + 1).padStart(3, '0')}`,
    name: `Card ${index + 1}`,
    cardType: 'holomem' as const,
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
    searchText: `card ${index + 1}`,
  }))
}

describe('paginateCards', () => {
  it('defaults to one-based page 1 and pageSize 24', () => {
    const result = paginateCards(cards(50))
    expect(result).toMatchObject({
      page: 1,
      pageSize: DEFAULT_CARD_PAGE_SIZE,
      totalItems: 50,
      totalPages: 3,
      hasPreviousPage: false,
      hasNextPage: true,
    })
    expect(result.items).toHaveLength(24)
  })

  it('returns the middle page', () => {
    const result = paginateCards(cards(50), { page: 2 })
    expect(result.items[0]?.cardNumber).toBe('CARD-025')
    expect(result.items.at(-1)?.cardNumber).toBe('CARD-048')
    expect(result).toMatchObject({
      page: 2,
      hasPreviousPage: true,
      hasNextPage: true,
    })
  })

  it('returns a partial final page', () => {
    const result = paginateCards(cards(50), { page: 3 })
    expect(result.items.map((item) => item.cardNumber)).toEqual([
      'CARD-049',
      'CARD-050',
    ])
    expect(result).toMatchObject({
      page: 3,
      hasPreviousPage: true,
      hasNextPage: false,
    })
  })

  it('does not create an extra page at an exact boundary', () => {
    const result = paginateCards(cards(48), { page: 2 })
    expect(result.items).toHaveLength(24)
    expect(result).toMatchObject({ totalPages: 2, hasNextPage: false })
  })

  it('clamps a requested page above totalPages', () => {
    const result = paginateCards(cards(25), { page: 99 })
    expect(result.page).toBe(2)
    expect(result.items.map((item) => item.cardNumber)).toEqual(['CARD-025'])
  })

  it('uses page 1 metadata for no results', () => {
    expect(paginateCards([], { page: 99 })).toEqual({
      items: [],
      totalItems: 0,
      page: 1,
      pageSize: 24,
      totalPages: 0,
      hasPreviousPage: false,
      hasNextPage: false,
    })
  })

  it('handles pageSize larger than totalItems', () => {
    const result = paginateCards(cards(5), { pageSize: 100 })
    expect(result.items).toHaveLength(5)
    expect(result).toMatchObject({ totalPages: 1, page: 1 })
  })

  it('supports a custom positive integer pageSize', () => {
    const result = paginateCards(cards(25), { page: 3, pageSize: 12 })
    expect(result.items.map((item) => item.cardNumber)).toEqual(['CARD-025'])
    expect(result).toMatchObject({ pageSize: 12, totalPages: 3 })
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid page %s',
    (page) => {
      expect(() => paginateCards(cards(1), { page })).toThrow(
        'page must be a positive integer.',
      )
    },
  )

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid pageSize %s',
    (pageSize) => {
      expect(() => paginateCards(cards(1), { pageSize })).toThrow(
        'pageSize must be a positive integer.',
      )
    },
  )

  it('does not mutate the input array or cards', () => {
    const input = cards(30)
    const before = structuredClone(input)
    const result = paginateCards(input, { page: 2, pageSize: 12 })

    expect(result.items).not.toBe(input)
    expect(result.items[0]).toBe(input[12])
    expect(input).toEqual(before)
  })
})
