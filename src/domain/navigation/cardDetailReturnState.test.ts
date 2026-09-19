import { describe, expect, it } from 'vitest'

import { DEFAULT_SEARCH_URL_STATE } from '../search/searchUrlState'
import {
  cardSearchDetailState,
  deckEditorDetailState,
  deckEditorLocationState,
  deckEditorReturnLocationState,
  deckEditorScrollPosition,
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

  it('carries the Deck Editor scroll offsets back through the return link', () => {
    const searchState = {
      ...DEFAULT_SEARCH_URL_STATE,
      query: 'フブキ',
      includeQa: true,
      page: 2,
    }
    const detailState = deckEditorDetailState('deck-1', searchState, {
      pageScrollY: 940,
      resultScrollTop: 260,
    })
    expect(readCardDetailReturnState(detailState)).toEqual(detailState)

    const returned = readCardDetailReturnState(detailState)
    expect(returned?.source).toBe('deck-editor')
    const locationState = deckEditorReturnLocationState(
      returned as Extract<typeof detailState, { source: 'deck-editor' }>,
    )
    expect(deckEditorSearchState(locationState)).toEqual(searchState)
    expect(deckEditorScrollPosition(locationState)).toEqual({
      pageScrollY: 940,
      resultScrollTop: 260,
    })
  })

  it('omits the scroll offsets when none were captured', () => {
    const detailState = deckEditorDetailState(
      'deck-1',
      DEFAULT_SEARCH_URL_STATE,
    )
    expect(detailState).not.toHaveProperty('scroll')
    expect(
      deckEditorScrollPosition(
        deckEditorLocationState(DEFAULT_SEARCH_URL_STATE),
      ),
    ).toBeUndefined()
    expect(deckEditorScrollPosition(undefined)).toBeUndefined()
    expect(deckEditorScrollPosition({ deckScroll: 'nope' })).toBeUndefined()
  })

  it.each([
    [
      'negative offsets',
      { pageScrollY: -120, resultScrollTop: -8 },
      { pageScrollY: 0, resultScrollTop: 0 },
    ],
    [
      'NaN offsets',
      { pageScrollY: Number.NaN, resultScrollTop: 40 },
      { pageScrollY: 0, resultScrollTop: 40 },
    ],
    [
      'infinite offsets',
      { pageScrollY: Number.POSITIVE_INFINITY, resultScrollTop: 12 },
      { pageScrollY: 0, resultScrollTop: 12 },
    ],
  ])('clamps unusable scroll offsets: %s', (_name, scroll, expected) => {
    const detailState = deckEditorDetailState(
      'deck-1',
      DEFAULT_SEARCH_URL_STATE,
      scroll,
    )
    expect(readCardDetailReturnState(detailState)).toEqual(
      expect.objectContaining({ scroll: expected }),
    )
  })

  it('drops the scroll offsets entirely when every value is unusable', () => {
    const detailState = deckEditorDetailState(
      'deck-1',
      DEFAULT_SEARCH_URL_STATE,
      { pageScrollY: Number.NaN, resultScrollTop: Number.NaN },
    )
    expect(detailState).not.toHaveProperty('scroll')
  })
})
