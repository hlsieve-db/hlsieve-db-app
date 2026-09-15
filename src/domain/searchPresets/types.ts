import {
  isCardTypeFilterValue,
  normalizeCardTypeFilterValues,
  parseSearchUrlState,
  serializeSearchUrlState,
  type SearchUrlState,
} from '../search/searchUrlState'

export const SEARCH_PRESET_NAME_MAX_LENGTH = 50

export type SavedSearchState = Omit<SearchUrlState, 'page'>

export type SavedSearchPreset = {
  id: string
  name: string
  searchState: SavedSearchState
  createdAt: string
  updatedAt: string
}

export function toSavedSearchState(state: SearchUrlState): SavedSearchState {
  return {
    query: state.query,
    colors: [...state.colors],
    colorMode: state.colorMode,
    cardTypes: [...state.cardTypes],
    bloom: [...state.bloom],
    criticalColors: [...state.criticalColors],
    criticalColorMode: state.criticalColorMode,
    effectTags: [...state.effectTags],
    effectTagMode: state.effectTagMode,
    sort: state.sort,
  }
}

export function presetToSearchUrlState(
  state: SavedSearchState,
): SearchUrlState {
  return {
    ...toSavedSearchState({
      ...state,
      cardTypes: normalizeCardTypeFilterValues(state.cardTypes),
      page: 1,
    }),
    page: 1,
  }
}

function hasStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function sameStringArray(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

export function isSavedSearchState(value: unknown): value is SavedSearchState {
  if (!value || typeof value !== 'object' || 'page' in value) return false
  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.query !== 'string' ||
    typeof candidate.colorMode !== 'string' ||
    typeof candidate.criticalColorMode !== 'string' ||
    typeof candidate.effectTagMode !== 'string' ||
    typeof candidate.sort !== 'string' ||
    !hasStringArray(candidate.colors) ||
    !hasStringArray(candidate.cardTypes) ||
    !hasStringArray(candidate.bloom) ||
    !hasStringArray(candidate.criticalColors) ||
    !hasStringArray(candidate.effectTags)
  ) {
    return false
  }

  const state = candidate as unknown as SavedSearchState
  const cardTypes = normalizeCardTypeFilterValues(candidate.cardTypes)
  if (
    !candidate.cardTypes.every(
      (value) => value === 'support' || isCardTypeFilterValue(value),
    )
  ) {
    return false
  }
  const canonicalState = { ...state, cardTypes }
  const normalized = parseSearchUrlState(
    serializeSearchUrlState({ ...canonicalState, page: 1 }),
  )
  return (
    normalized.query === canonicalState.query &&
    normalized.colorMode === canonicalState.colorMode &&
    normalized.criticalColorMode === canonicalState.criticalColorMode &&
    normalized.effectTagMode === canonicalState.effectTagMode &&
    normalized.sort === canonicalState.sort &&
    sameStringArray(normalized.colors, canonicalState.colors) &&
    sameStringArray(normalized.cardTypes, canonicalState.cardTypes) &&
    sameStringArray(normalized.bloom, canonicalState.bloom) &&
    sameStringArray(normalized.criticalColors, canonicalState.criticalColors) &&
    sameStringArray(normalized.effectTags, canonicalState.effectTags)
  )
}

export function isSavedSearchPreset(
  value: unknown,
): value is SavedSearchPreset {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<SavedSearchPreset>
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.name === 'string' &&
    candidate.name === candidate.name.trim() &&
    candidate.name.length > 0 &&
    candidate.name.length <= SEARCH_PRESET_NAME_MAX_LENGTH &&
    typeof candidate.createdAt === 'string' &&
    Number.isFinite(Date.parse(candidate.createdAt)) &&
    typeof candidate.updatedAt === 'string' &&
    Number.isFinite(Date.parse(candidate.updatedAt)) &&
    isSavedSearchState(candidate.searchState)
  )
}
