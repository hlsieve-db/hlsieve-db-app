import type { Card } from '../cards/types'
import { paginateCards, type CardPaginationResult } from './paginateCards'
import { searchCards, type SearchCardsInput } from './searchCards'
import { sortCards } from './sortCards'
import type { CardSort } from './types'

export type CardSearchResultsInput = SearchCardsInput & {
  sort?: CardSort
  page?: number
  pageSize?: number
}

export function getCardSearchResults(
  cards: readonly Card[],
  input: CardSearchResultsInput,
): CardPaginationResult {
  const filtered = searchCards(cards, input)
  const sorted = sortCards(filtered, input.sort ?? 'default')
  return paginateCards(sorted, {
    page: input.page,
    pageSize: input.pageSize,
  })
}
