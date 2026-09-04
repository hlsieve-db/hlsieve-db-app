import type { Card } from '../cards/types'
import { DEFAULT_CARD_PAGE_SIZE } from './constants'

export type CardPaginationInput = {
  page?: number
  pageSize?: number
}

export type CardPaginationResult = {
  items: Card[]
  totalItems: number
  page: number
  pageSize: number
  totalPages: number
  hasPreviousPage: boolean
  hasNextPage: boolean
}

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer.`)
  }
}

export function paginateCards(
  cards: readonly Card[],
  input: CardPaginationInput = {},
): CardPaginationResult {
  const requestedPage = input.page ?? 1
  const pageSize = input.pageSize ?? DEFAULT_CARD_PAGE_SIZE
  requirePositiveInteger(requestedPage, 'page')
  requirePositiveInteger(pageSize, 'pageSize')

  const totalItems = cards.length
  const totalPages = Math.ceil(totalItems / pageSize)
  const page = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages)
  const start = (page - 1) * pageSize
  const items = cards.slice(start, start + pageSize)

  return {
    items,
    totalItems,
    page,
    pageSize,
    totalPages,
    hasPreviousPage: totalPages > 0 && page > 1,
    hasNextPage: page < totalPages,
  }
}
