import type { DerivedCardCandidate } from '../derive/types'

export type SearchTextAdditionalTerms = {
  nameReading?: string
  aliases?: readonly string[]
}

export type SearchIndexedCardCandidate = DerivedCardCandidate & {
  searchText: string
}
