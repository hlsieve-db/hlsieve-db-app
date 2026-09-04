import type { Card } from '../cards/types'
import { normalizeSearchQuery } from './normalizeSearchQuery'

export type TextSearchInput = {
  query: string
}

export function searchCards(
  cards: readonly Card[],
  input: TextSearchInput,
): Card[] {
  const tokens = normalizeSearchQuery(input.query).split(' ').filter(Boolean)
  return cards.filter((card) =>
    tokens.every((token) => card.searchText.includes(token)),
  )
}
