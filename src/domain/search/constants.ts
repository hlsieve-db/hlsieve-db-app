import type {
  BloomFilterValue,
  CardTypeFilterValue,
  MatchMode,
  SearchState,
} from './types'

export const BLOOM_FILTER_LABELS = {
  debut_normal: 'Debut（通常）',
  debut_extra: 'Debut（エクストラ）',
  first: '1st',
  second: '2nd',
  spot: 'Spot',
  buzz: 'Buzz',
} satisfies Record<BloomFilterValue, string>

export const CARD_TYPE_FILTER_LABELS = {
  oshi: '推しホロメン',
  holomem: 'ホロメン',
  cheer: 'エール',
  support_limited: 'LIMITED',
  support_general: 'サポート（LIMITED以外）',
  support_tool: 'ツール',
  support_fan: 'ファン',
} satisfies Record<CardTypeFilterValue, string>

export const MATCH_MODE_LABELS = {
  and: 'AND',
  or: 'OR',
} satisfies Record<MatchMode, string>

export const DEFAULT_SEARCH_STATE: SearchState = {
  query: '',
  colors: [],
  colorsMode: 'or',
  bloomLevels: [],
  cardTypes: [],
  criticalColors: [],
  criticalMode: 'or',
  effectTags: [],
  effectTagsMode: 'and',
  rarities: [],
  products: [],
  sort: 'new',
  perPage: 24,
  page: 1,
}
