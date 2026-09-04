import type { CardColor, CriticalColor, EffectTag } from '../cards/types'

export type MatchMode = 'and' | 'or'

export type CardSort =
  'default' | 'card_number_asc' | 'release_date_desc' | 'release_date_asc'

export type BloomFilterValue =
  'debut_normal' | 'debut_extra' | 'first' | 'second' | 'spot' | 'buzz'

export type CardTypeFilterValue =
  | 'oshi'
  | 'holomem'
  | 'cheer'
  | 'support_limited'
  | 'support_general'
  | 'support_tool'
  | 'support_fan'

export type SearchState = {
  query: string
  colors: CardColor[]
  colorsMode: MatchMode
  bloomLevels: BloomFilterValue[]
  cardTypes: CardTypeFilterValue[]
  criticalColors: CriticalColor[]
  criticalMode: MatchMode
  effectTags: EffectTag[]
  effectTagsMode: MatchMode
  rarities: string[]
  products: string[]
  sort: CardSort
  perPage: 24 | 48 | 96
  page: number
}

export type SearchMatchSource = 'name' | 'cardNumber' | 'ability' | 'art' | 'qa'

export type QaMatch = {
  index: number
  matchedTerms: string[]
}

export type SearchMatchInfo = {
  sources: SearchMatchSource[]
  qaMatches: QaMatch[]
}
