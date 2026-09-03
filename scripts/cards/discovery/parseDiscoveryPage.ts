import { load } from 'cheerio'

import { normalizeCardListEntry } from '../normalize/normalizeCardListEntry'
import type { NormalizedListEntry } from '../normalize/types'
import { parseCardListHtml } from '../parser/parseCardList'
import { stableStringify } from '../hash/stableStringify'
import type {
  DiscoveryIssue,
  DiscoveryMode,
  DiscoveryPageResult,
} from './types'

function declaredCount(html: string): number | undefined {
  const text = load(html)('.cardlist-Result_Target_Num .num').first().text()
  const normalized = text.replace(/[\s,，]/g, '')
  return /^\d+$/.test(normalized) ? Number(normalized) : undefined
}

function cardIdentity(entry: NormalizedListEntry): string {
  return stableStringify(entry)
}

function canonicalizeDetailUrl(
  entry: NormalizedListEntry,
): NormalizedListEntry {
  if (!entry.detailUrl || !entry.officialId) return entry
  const url = new URL(entry.detailUrl)
  url.search = ''
  url.hash = ''
  url.searchParams.set('id', entry.officialId)
  return { ...entry, detailUrl: url.toString() }
}

export function parseDiscoveryPage(
  html: string,
  searchUrl: string,
  mode: DiscoveryMode,
): DiscoveryPageResult {
  const issues: DiscoveryIssue[] = []
  const declaredResultCount = declaredCount(html)
  if (declaredResultCount === undefined) {
    issues.push({
      code: 'DECLARED_COUNT_MISSING',
      mode,
      url: searchUrl,
      message: `Declared result count was not found for ${mode}.`,
    })
  }

  const $ = load(html)
  const listItems = $('.cardlist-Result_List').first().children('li')
  if (declaredResultCount === 0 && listItems.length === 0) {
    return {
      mode,
      searchUrl,
      declaredResultCount,
      rawEntryCount: 0,
      parsedEntryCount: 0,
      cards: [],
      specialEntries: [],
      duplicateOfficialIdCount: 0,
      partitionCount: 0,
      isComplete: issues.length === 0,
      issues,
    }
  }

  const parsed = parseCardListHtml(html, searchUrl)
  if (!parsed.ok) {
    issues.push(
      ...parsed.errors.map((error) => ({
        code: 'LIST_PARSE_FAILED' as const,
        mode,
        url: searchUrl,
        message: `${error.code}: ${error.message}`,
      })),
    )
    return {
      mode,
      searchUrl,
      ...(declaredResultCount !== undefined ? { declaredResultCount } : {}),
      rawEntryCount: 0,
      parsedEntryCount: 0,
      cards: [],
      specialEntries: [],
      duplicateOfficialIdCount: 0,
      partitionCount: 0,
      isComplete: false,
      issues,
    }
  }

  const normalizedEntries: NormalizedListEntry[] = []
  for (const entry of parsed.value.entries) {
    const normalized = normalizeCardListEntry(entry)
    if (!normalized.ok) {
      issues.push(
        ...normalized.errors.map((error) => ({
          code: 'LIST_NORMALIZE_FAILED' as const,
          mode,
          url: searchUrl,
          message: `${error.code}: ${error.message}`,
        })),
      )
    } else {
      normalizedEntries.push(canonicalizeDetailUrl(normalized.value))
    }
  }

  const cardsById = new Map<
    string,
    Extract<NormalizedListEntry, { kind: 'card' }>
  >()
  const specialEntries: Extract<NormalizedListEntry, { kind: 'special' }>[] = []
  let duplicateOfficialIdCount = 0
  for (const entry of normalizedEntries) {
    if (entry.kind === 'special') {
      specialEntries.push(entry)
      continue
    }
    const existing = cardsById.get(entry.officialId)
    if (!existing) {
      cardsById.set(entry.officialId, entry)
    } else {
      duplicateOfficialIdCount += 1
      if (cardIdentity(existing) !== cardIdentity(entry)) {
        issues.push({
          code: 'DUPLICATE_OFFICIAL_ID_CONFLICT',
          mode,
          officialId: entry.officialId,
          url: searchUrl,
          message: `officialId ${entry.officialId} has contradictory entries in ${mode}.`,
        })
      }
    }
  }
  const rawEntryCount = parsed.value.entries.length
  if (
    declaredResultCount !== undefined &&
    declaredResultCount !== rawEntryCount
  ) {
    issues.push({
      code: 'DECLARED_COUNT_MISMATCH',
      mode,
      url: searchUrl,
      message: `Declared ${declaredResultCount} entries but parsed ${rawEntryCount} for ${mode}.`,
    })
  }
  if (rawEntryCount !== normalizedEntries.length) {
    issues.push({
      code: 'CLASSIFIED_COUNT_MISMATCH',
      mode,
      url: searchUrl,
      message: `Parsed ${rawEntryCount} entries but classified ${normalizedEntries.length} for ${mode}.`,
    })
  }

  return {
    mode,
    searchUrl,
    ...(declaredResultCount !== undefined ? { declaredResultCount } : {}),
    rawEntryCount,
    parsedEntryCount: cardsById.size + specialEntries.length,
    cards: [...cardsById.values()],
    specialEntries,
    duplicateOfficialIdCount,
    partitionCount: 0,
    isComplete: issues.length === 0,
    issues,
  }
}
