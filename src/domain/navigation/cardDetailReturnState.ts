import {
  parseSearchUrlState,
  serializeSearchUrlState,
  type SearchUrlState,
} from '../search/searchUrlState'

export type DeckEditorScrollPosition = {
  pageScrollY: number
  resultScrollTop: number
}

export type DeckEditorReturnState = {
  source: 'deck-editor'
  deckId: string
  search: string
  scroll?: DeckEditorScrollPosition
}

export type CardDetailReturnState =
  { source: 'card-search'; returnTo: string } | DeckEditorReturnState

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readScrollOffset(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.max(0, value)
}

function readScrollPosition(
  value: unknown,
): DeckEditorScrollPosition | undefined {
  if (!isRecord(value)) return undefined
  const pageScrollY = readScrollOffset(value.pageScrollY)
  const resultScrollTop = readScrollOffset(value.resultScrollTop)
  if (pageScrollY === undefined && resultScrollTop === undefined) {
    return undefined
  }
  return {
    pageScrollY: pageScrollY ?? 0,
    resultScrollTop: resultScrollTop ?? 0,
  }
}

export function cardSearchDetailState(returnTo: string): CardDetailReturnState {
  return { source: 'card-search', returnTo }
}

export function deckEditorDetailState(
  deckId: string,
  searchState: SearchUrlState,
  scroll?: DeckEditorScrollPosition,
): CardDetailReturnState {
  const sanitizedScroll = readScrollPosition(scroll)
  return {
    source: 'deck-editor',
    deckId,
    search: serializeSearchUrlState(searchState).toString(),
    ...(sanitizedScroll ? { scroll: sanitizedScroll } : {}),
  }
}

export function readCardDetailReturnState(
  value: unknown,
): CardDetailReturnState | undefined {
  if (!isRecord(value)) return undefined
  if (
    value.source === 'card-search' &&
    typeof value.returnTo === 'string' &&
    (value.returnTo === '/cards' || value.returnTo.startsWith('/cards?'))
  ) {
    return { source: 'card-search', returnTo: value.returnTo }
  }
  if (
    value.source === 'deck-editor' &&
    typeof value.deckId === 'string' &&
    value.deckId.length > 0 &&
    typeof value.search === 'string'
  ) {
    const scroll = readScrollPosition(value.scroll)
    return {
      source: 'deck-editor',
      deckId: value.deckId,
      search: value.search,
      ...(scroll ? { scroll } : {}),
    }
  }
  return undefined
}

export function deckEditorSearchState(
  value: unknown,
): SearchUrlState | undefined {
  if (!isRecord(value) || typeof value.deckSearch !== 'string') {
    return undefined
  }
  return parseSearchUrlState(value.deckSearch)
}

export function deckEditorLocationState(searchState: SearchUrlState) {
  return { deckSearch: serializeSearchUrlState(searchState).toString() }
}

export function deckEditorReturnLocationState(state: DeckEditorReturnState) {
  return {
    deckSearch: state.search,
    ...(state.scroll ? { deckScroll: state.scroll } : {}),
  }
}

export function deckEditorScrollPosition(
  value: unknown,
): DeckEditorScrollPosition | undefined {
  if (!isRecord(value)) return undefined
  return readScrollPosition(value.deckScroll)
}
