import { compareOfficialIds } from '../hash/buildContentHashPayload'
import {
  compareUnicodeCodePoints,
  stableStringify,
} from '../hash/stableStringify'
import type { NormalizedListEntry } from '../normalize/types'
import type {
  DiscoveryIssue,
  DiscoveryPageResult,
  PaginationDefinition,
} from './types'

type ListCard = Extract<NormalizedListEntry, { kind: 'card' }>
type ListSpecial = Extract<NormalizedListEntry, { kind: 'special' }>

export type NumberedDiscoveryPage = {
  pageNumber: number
  result: DiscoveryPageResult
}

export function mergePaginatedPages(
  initial: DiscoveryPageResult,
  definition: PaginationDefinition,
  additionalPages: readonly NumberedDiscoveryPage[],
): DiscoveryPageResult {
  const issues: DiscoveryIssue[] = initial.issues.filter(
    (issue) => issue.code !== 'DECLARED_COUNT_MISMATCH',
  )
  const pages = [
    { pageNumber: definition.currentPage, result: initial },
    ...additionalPages,
  ].sort((left, right) => left.pageNumber - right.pageNumber)
  const expectedPages = Array.from(
    { length: definition.maxPage - definition.currentPage + 1 },
    (_, index) => definition.currentPage + index,
  )
  const fetchedPages = pages.map((page) => page.pageNumber)
  if (
    fetchedPages.length !== expectedPages.length ||
    fetchedPages.some((page, index) => page !== expectedPages[index])
  ) {
    issues.push({
      code: 'PAGINATION_PAGE_MISSING',
      mode: initial.mode,
      url: initial.searchUrl,
      message: `Expected pages ${expectedPages.join(',')} but received ${fetchedPages.join(',')}.`,
    })
  }

  const cards = new Map<string, ListCard>()
  const specials = new Map<string, ListSpecial>()
  let duplicateOfficialIdCount = 0
  for (const page of pages) {
    issues.push(
      ...page.result.issues.filter(
        (issue) => issue.code !== 'DECLARED_COUNT_MISMATCH',
      ),
    )
    duplicateOfficialIdCount += page.result.duplicateOfficialIdCount
    for (const card of page.result.cards) {
      const existing = cards.get(card.officialId)
      if (!existing) {
        cards.set(card.officialId, card)
      } else {
        duplicateOfficialIdCount += 1
        if (stableStringify(existing) !== stableStringify(card)) {
          issues.push({
            code: 'DUPLICATE_OFFICIAL_ID_CONFLICT',
            mode: initial.mode,
            officialId: card.officialId,
            url: page.result.searchUrl,
            message: `officialId ${card.officialId} contradicts another pagination page.`,
          })
        }
      }
    }
    for (const special of page.result.specialEntries) {
      specials.set(stableStringify(special), special)
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
    initial.declaredResultCount === undefined ||
    parsedEntryCount !== initial.declaredResultCount
  ) {
    issues.push({
      code: 'DECLARED_COUNT_MISMATCH',
      mode: initial.mode,
      url: initial.searchUrl,
      message: `Pagination union has ${parsedEntryCount} entries; initial page declares ${initial.declaredResultCount ?? '(missing)'}.`,
    })
  }

  return {
    ...initial,
    rawEntryCount: pages.reduce(
      (total, page) => total + page.result.rawEntryCount,
      0,
    ),
    parsedEntryCount,
    cards: sortedCards,
    specialEntries: sortedSpecials,
    duplicateOfficialIdCount,
    partitionCount: 0,
    pagination: {
      currentPage: definition.currentPage,
      maxPage: definition.maxPage,
      fetchedPages,
      pageEntryCounts: pages.map((page) => page.result.rawEntryCount),
    },
    isComplete: issues.length === 0,
    issues,
  }
}
