import { compareOfficialIds } from '../hash/buildContentHashPayload'
import {
  compareUnicodeCodePoints,
  stableStringify,
} from '../hash/stableStringify'
import type { NormalizedListEntry } from '../normalize/types'
import type {
  DiscoveredCard,
  DiscoveredSpecialEntry,
  DiscoveryIssue,
  DiscoveryPageResult,
  DiscoveryResult,
  SearchFormDefinition,
} from './types'

type ListCard = Extract<NormalizedListEntry, { kind: 'card' }>

function sameCardIdentity(left: ListCard, right: ListCard): boolean {
  return stableStringify(left) === stableStringify(right)
}

export function reconcileDiscovery(
  formDefinition: SearchFormDefinition,
  pages: {
    all: DiscoveryPageResult
    parallel_only: DiscoveryPageResult
    non_parallel: DiscoveryPageResult
  },
  stats: { requestCount: number; retryCount: number },
): DiscoveryResult {
  const issues: DiscoveryIssue[] = [
    ...pages.all.issues,
    ...pages.parallel_only.issues,
    ...pages.non_parallel.issues,
  ]
  const allById = new Map(
    pages.all.cards.map((card) => [card.officialId, card]),
  )
  const parallelById = new Map(
    pages.parallel_only.cards.map((card) => [card.officialId, card]),
  )
  const nonParallelById = new Map(
    pages.non_parallel.cards.map((card) => [card.officialId, card]),
  )

  for (const [officialId, filtered] of [
    ...parallelById.entries(),
    ...nonParallelById.entries(),
  ]) {
    const all = allById.get(officialId)
    if (!all) {
      issues.push({
        code: 'FILTER_ID_OUTSIDE_ALL',
        officialId,
        message: `Filtered officialId ${officialId} does not exist in ALL.`,
      })
    } else if (!sameCardIdentity(all, filtered)) {
      issues.push({
        code: 'FILTER_METADATA_CONFLICT',
        officialId,
        message: `Filtered metadata for officialId ${officialId} differs from ALL.`,
      })
    }
  }

  const cards: DiscoveredCard[] = []
  let classificationConflicts = 0
  let unclassifiedOfficialIds = 0
  for (const all of allById.values()) {
    const inParallel = parallelById.has(all.officialId)
    const inNonParallel = nonParallelById.has(all.officialId)
    if (inParallel === inNonParallel) {
      if (inParallel) {
        classificationConflicts += 1
        issues.push({
          code: 'PARALLEL_MEMBERSHIP_CONFLICT',
          officialId: all.officialId,
          message: `officialId ${all.officialId} exists in both parallel partitions.`,
        })
      } else {
        unclassifiedOfficialIds += 1
        issues.push({
          code: 'PARALLEL_MEMBERSHIP_MISSING',
          officialId: all.officialId,
          message: `officialId ${all.officialId} exists in neither parallel partition.`,
        })
      }
      continue
    }
    cards.push({
      kind: 'card',
      officialId: all.officialId,
      detailUrl: all.detailUrl,
      cardNumber: all.cardNumber,
      name: all.name,
      ...(all.imageUrl !== undefined ? { imageUrl: all.imageUrl } : {}),
      isParallel: inParallel,
      sourceSearchUrl: pages.all.searchUrl,
    })
  }
  cards.sort((left, right) =>
    compareOfficialIds(left.officialId, right.officialId),
  )

  const specialEntries: DiscoveredSpecialEntry[] = pages.all.specialEntries
    .map((entry) => ({
      kind: 'special',
      ...(entry.officialId !== undefined
        ? { officialId: entry.officialId }
        : {}),
      ...(entry.detailUrl !== undefined ? { detailUrl: entry.detailUrl } : {}),
      name: entry.name,
      ...(entry.imageUrl !== undefined ? { imageUrl: entry.imageUrl } : {}),
      sourceSearchUrl: pages.all.searchUrl,
    }))
    .sort((left, right) =>
      compareUnicodeCodePoints(
        left.officialId ?? left.detailUrl ?? left.name,
        right.officialId ?? right.detailUrl ?? right.name,
      ),
    )

  const byCardNumber = new Map<string, DiscoveredCard[]>()
  for (const card of cards) {
    const group = byCardNumber.get(card.cardNumber) ?? []
    group.push(card)
    byCardNumber.set(card.cardNumber, group)
  }
  const duplicateOfficialIds =
    pages.all.duplicateOfficialIdCount +
    pages.parallel_only.duplicateOfficialIdCount +
    pages.non_parallel.duplicateOfficialIdCount

  return {
    formDefinition,
    pages,
    cards,
    specialEntries,
    counts: {
      totalCards: cards.length,
      uniqueCardNumbers: byCardNumber.size,
      parallelCards: cards.filter((card) => card.isParallel).length,
      nonParallelCards: cards.filter((card) => !card.isParallel).length,
      specialEntries: specialEntries.length,
      multipleOfficialIdCardNumbers: [...byCardNumber.values()].filter(
        (group) => group.length > 1,
      ).length,
      normalAndParallelCardNumbers: [...byCardNumber.values()].filter(
        (group) =>
          group.some((card) => card.isParallel) &&
          group.some((card) => !card.isParallel),
      ).length,
      duplicateOfficialIds,
      classificationConflicts,
      unclassifiedOfficialIds,
    },
    isComplete:
      pages.all.isComplete &&
      pages.parallel_only.isComplete &&
      pages.non_parallel.isComplete &&
      issues.length === 0 &&
      cards.length === allById.size,
    issues,
    requestCount: stats.requestCount,
    retryCount: stats.retryCount,
  }
}
