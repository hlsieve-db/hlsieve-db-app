import {
  CARD_COLOR_LABELS,
  CRITICAL_COLOR_LABELS,
  EFFECT_TAG_LABELS,
} from '../cards/constants'
import type { Card, CardColor, CriticalColor, EffectTag } from '../cards/types'
import {
  BLOOM_FILTER_LABELS,
  DEFAULT_CARD_PAGE_SIZE,
  DEFAULT_SEARCH_STATE,
} from './constants'
import { normalizeSearchQuery } from './normalizeSearchQuery'
import type { BloomFilterValue, CardSort, MatchMode } from './types'

export type SearchUrlState = {
  query: string
  colors: readonly CardColor[]
  colorMode: MatchMode
  cardTypes: readonly Card['cardType'][]
  bloom: readonly BloomFilterValue[]
  criticalColors: readonly CriticalColor[]
  criticalColorMode: MatchMode
  effectTags: readonly EffectTag[]
  effectTagMode: MatchMode
  sort: CardSort
  page: number
}

export const DEFAULT_SEARCH_URL_STATE: SearchUrlState = {
  query: DEFAULT_SEARCH_STATE.query,
  colors: [],
  colorMode: DEFAULT_SEARCH_STATE.colorsMode,
  cardTypes: [],
  bloom: [],
  criticalColors: [],
  criticalColorMode: DEFAULT_SEARCH_STATE.criticalMode,
  effectTags: [],
  effectTagMode: DEFAULT_SEARCH_STATE.effectTagsMode,
  sort: DEFAULT_SEARCH_STATE.sort,
  page: DEFAULT_SEARCH_STATE.page,
}

export const SEARCH_URL_PAGE_SIZE = DEFAULT_CARD_PAGE_SIZE

const COLOR_ORDER = Object.keys(CARD_COLOR_LABELS) as CardColor[]
const CARD_TYPE_ORDER = [
  'oshi',
  'holomem',
  'support',
  'cheer',
] satisfies Card['cardType'][]
const BLOOM_ORDER = Object.keys(BLOOM_FILTER_LABELS) as BloomFilterValue[]
const CRITICAL_COLOR_ORDER = Object.keys(
  CRITICAL_COLOR_LABELS,
) as CriticalColor[]
const EFFECT_TAG_ORDER = Object.keys(EFFECT_TAG_LABELS) as EffectTag[]
const MATCH_MODES = ['or', 'and'] satisfies MatchMode[]
const CARD_SORTS = [
  'default',
  'card_number_asc',
  'release_date_desc',
  'release_date_asc',
] satisfies CardSort[]

function parseRepeated<T extends string>(
  params: URLSearchParams,
  name: string,
  order: readonly T[],
): T[] {
  const received = new Set(params.getAll(name))
  return order.filter((value) => received.has(value))
}

function firstValid<T extends string>(
  params: URLSearchParams,
  name: string,
  allowed: readonly T[],
  fallback: T,
): T {
  return (
    params
      .getAll(name)
      .find((value): value is T => allowed.includes(value as T)) ?? fallback
  )
}

function parsePage(params: URLSearchParams): number {
  const value = params
    .getAll('page')
    .find((candidate) => /^[1-9]\d*$/.test(candidate))
  if (value === undefined) return DEFAULT_SEARCH_URL_STATE.page
  const page = Number(value)
  return Number.isSafeInteger(page) ? page : DEFAULT_SEARCH_URL_STATE.page
}

export function parseSearchUrlState(
  search: string | URLSearchParams,
): SearchUrlState {
  const params =
    typeof search === 'string' ? new URLSearchParams(search) : search
  return {
    query: params.get('q') ?? DEFAULT_SEARCH_URL_STATE.query,
    colors: parseRepeated(params, 'color', COLOR_ORDER),
    colorMode: firstValid(
      params,
      'colorMode',
      MATCH_MODES,
      DEFAULT_SEARCH_URL_STATE.colorMode,
    ),
    cardTypes: parseRepeated(params, 'type', CARD_TYPE_ORDER),
    bloom: parseRepeated(params, 'bloom', BLOOM_ORDER),
    criticalColors: parseRepeated(params, 'critical', CRITICAL_COLOR_ORDER),
    criticalColorMode: firstValid(
      params,
      'criticalMode',
      MATCH_MODES,
      DEFAULT_SEARCH_URL_STATE.criticalColorMode,
    ),
    effectTags: parseRepeated(params, 'tag', EFFECT_TAG_ORDER),
    effectTagMode: firstValid(
      params,
      'tagMode',
      MATCH_MODES,
      DEFAULT_SEARCH_URL_STATE.effectTagMode,
    ),
    sort: firstValid(params, 'sort', CARD_SORTS, DEFAULT_SEARCH_URL_STATE.sort),
    page: parsePage(params),
  }
}

function appendSelected<T extends string>(
  params: URLSearchParams,
  name: string,
  selected: readonly T[],
  order: readonly T[],
): void {
  const received = new Set(selected)
  order.forEach((value) => {
    if (received.has(value)) params.append(name, value)
  })
}

export function serializeSearchUrlState(
  state: SearchUrlState,
): URLSearchParams {
  const params = new URLSearchParams()
  if (normalizeSearchQuery(state.query) !== '') params.set('q', state.query)

  appendSelected(params, 'color', state.colors, COLOR_ORDER)
  if (state.colors.length > 0 && state.colorMode !== 'or') {
    params.set('colorMode', state.colorMode)
  }

  appendSelected(params, 'type', state.cardTypes, CARD_TYPE_ORDER)
  appendSelected(params, 'bloom', state.bloom, BLOOM_ORDER)
  appendSelected(params, 'critical', state.criticalColors, CRITICAL_COLOR_ORDER)
  if (state.criticalColors.length > 0 && state.criticalColorMode !== 'or') {
    params.set('criticalMode', state.criticalColorMode)
  }

  appendSelected(params, 'tag', state.effectTags, EFFECT_TAG_ORDER)
  if (state.effectTags.length > 0 && state.effectTagMode !== 'and') {
    params.set('tagMode', state.effectTagMode)
  }

  if (state.sort !== 'default') params.set('sort', state.sort)
  if (state.page !== 1) params.set('page', String(state.page))
  return params
}
