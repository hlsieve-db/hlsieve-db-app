import { compareOfficialIds } from '../hash/buildContentHashPayload'
import {
  compareUnicodeCodePoints,
  stableStringify,
} from '../hash/stableStringify'
import type { NormalizedListEntry } from '../normalize/types'
import type { DiscoveryIssue, DiscoveryPageResult } from './types'

type ListCard = Extract<NormalizedListEntry, { kind: 'card' }>
type ListSpecial = Extract<NormalizedListEntry, { kind: 'special' }>

export function mergeDiscoveryPages(
  base: DiscoveryPageResult,
  partitions: readonly DiscoveryPageResult[],
): DiscoveryPageResult {
  const issues: DiscoveryIssue[] = []
  const cards = new Map<string, ListCard>()
  const specials = new Map<string, ListSpecial>()
  let duplicateOfficialIdCount = 0

  for (const page of partitions) {
    issues.push(...page.issues)
    for (const card of page.cards) {
      const existing = cards.get(card.officialId)
      if (!existing) {
        cards.set(card.officialId, card)
      } else {
        duplicateOfficialIdCount += 1
        if (stableStringify(existing) !== stableStringify(card)) {
          issues.push({
            code: 'DUPLICATE_OFFICIAL_ID_CONFLICT',
            mode: base.mode,
            officialId: card.officialId,
            message: `officialId ${card.officialId} contradicts another product partition.`,
          })
        }
      }
    }
    for (const special of page.specialEntries) {
      const key = stableStringify(special)
      specials.set(key, special)
    }
  }

  const sortedCards = [...cards.values()].sort((left, right) =>
    compareOfficialIds(left.officialId, right.officialId),
  )
  const sortedSpecials = [...specials.values()].sort((left, right) =>
    compareUnicodeCodePoints(stableStringify(left), stableStringify(right)),
  )
  const parsedEntryCount = sortedCards.length + sortedSpecials.length
  if (
    base.declaredResultCount !== undefined &&
    parsedEntryCount !== base.declaredResultCount
  ) {
    issues.push({
      code: 'DECLARED_COUNT_MISMATCH',
      mode: base.mode,
      message: `Product partition union has ${parsedEntryCount} entries; ALL page declares ${base.declaredResultCount}.`,
    })
  }

  return {
    ...base,
    parsedEntryCount,
    cards: sortedCards,
    specialEntries: sortedSpecials,
    duplicateOfficialIdCount:
      base.duplicateOfficialIdCount + duplicateOfficialIdCount,
    partitionCount: partitions.length,
    isComplete:
      partitions.every((partition) => partition.isComplete) &&
      issues.length === 0,
    issues,
  }
}
