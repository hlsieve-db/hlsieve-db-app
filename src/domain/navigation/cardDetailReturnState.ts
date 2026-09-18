import {
  parseSearchUrlState,
  serializeSearchUrlState,
  type SearchUrlState,
} from '../search/searchUrlState'

export type CardDetailReturnState =
  | { source: 'card-search'; returnTo: string }
  | { source: 'deck-editor'; deckId: string; search: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function cardSearchDetailState(returnTo: string): CardDetailReturnState {
  return { source: 'card-search', returnTo }
}

export function deckEditorDetailState(
  deckId: string,
  searchState: SearchUrlState,
): CardDetailReturnState {
  return {
    source: 'deck-editor',
    deckId,
    search: serializeSearchUrlState(searchState).toString(),
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
    return {
      source: 'deck-editor',
      deckId: value.deckId,
      search: value.search,
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
