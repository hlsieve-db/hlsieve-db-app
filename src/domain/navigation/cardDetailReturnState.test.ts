import { describe, expect, it } from 'vitest'

import { DEFAULT_SEARCH_URL_STATE } from '../search/searchUrlState'
import {
  cardSearchDetailState,
  deckEditorDetailState,
  deckEditorLocationState,
  deckEditorSearchState,
  readCardDetailReturnState,
} from './cardDetailReturnState'

describe('Card Detail return navigation state', () => {
  it('keeps the complete canonical Card Search destination', () => {
    const value = cardSearchDetailState(
      '/cards?q=フブキ&qa=1&type=support_mascot&sort=card_number_asc&page=2',
    )
    expect(readCardDetailReturnState(value)).toEqual(value)
  })

  it('rejects stale or unrelated Card Search destinations', () => {
    expect(
      readCardDetailReturnState({
        source: 'card-search',
        returnTo: '/decks/deck-1',
      }),
    ).toBeUndefined()
    expect(readCardDetailReturnState(undefined)).toBeUndefined()
  })

  it('round-trips temporary Deck Editor search state without a route query', () => {
    const searchState = {
      ...DEFAULT_SEARCH_URL_STATE,
      query: 'フブキ',
      includeQa: true,
      colors: ['white'] as const,
      cardTypes: ['support_mascot'] as const,
      sort: 'card_number_asc' as const,
      page: 3,
    }
    const detailState = deckEditorDetailState('deck-1', searchState)
    expect(readCardDetailReturnState(detailState)).toEqual(detailState)
    expect(deckEditorSearchState(deckEditorLocationState(searchState))).toEqual(
      searchState,
    )
  })
})
