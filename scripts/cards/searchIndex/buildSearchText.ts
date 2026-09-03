import { normalizeSearchText } from '../../../src/domain/search/normalizeSearchText'
import type { DerivedCardCandidate } from '../derive/types'
import type {
  SearchIndexedCardCandidate,
  SearchTextAdditionalTerms,
} from './types'

function collectSearchTextSegments(
  card: DerivedCardCandidate,
  additionalTerms: SearchTextAdditionalTerms,
): (string | undefined)[] {
  const segments: (string | undefined)[] = [
    card.name,
    card.cardNumber,
    additionalTerms.nameReading,
    ...(additionalTerms.aliases ?? []),
    ...card.abilities.map((ability) => ability.text),
  ]

  for (const art of card.arts) {
    segments.push(art.name, art.effectText)
  }
  segments.push(card.extraText)
  for (const qa of card.qas) {
    segments.push(qa.question, qa.answer)
  }

  return segments
}

export function buildSearchText(
  card: DerivedCardCandidate,
  additionalTerms: SearchTextAdditionalTerms = {},
): string {
  const normalizedSegments: string[] = []

  for (const segment of collectSearchTextSegments(card, additionalTerms)) {
    if (segment === undefined) {
      continue
    }
    const normalized = normalizeSearchText(segment)
    if (normalized && !normalizedSegments.includes(normalized)) {
      normalizedSegments.push(normalized)
    }
  }

  return normalizedSegments.join(' ')
}

export function toSearchIndexedCardCandidate(
  card: DerivedCardCandidate,
  additionalTerms: SearchTextAdditionalTerms = {},
): SearchIndexedCardCandidate {
  return {
    ...card,
    searchText: buildSearchText(card, additionalTerms),
  }
}
