import { buildSearchUrl } from './buildSearchUrl'
import { mergeDiscoveryPages } from './mergeDiscoveryPages'
import {
  mergePaginatedPages,
  type NumberedDiscoveryPage,
} from './mergePaginatedPages'
import { buildPaginationUrl, parsePaginationDefinition } from './pagination'
import { parseDiscoveryPage } from './parseDiscoveryPage'
import { parsePaginationFragment } from './parsePaginationFragment'
import { parseSearchForm } from './parseSearchForm'
import { parseTextViewDefinition } from './parseTextViewDefinition'
import { reconcileDiscovery } from './reconcileDiscovery'
import type {
  DiscoverCardEntriesOptions,
  DiscoveryIssue,
  DiscoveryMode,
  DiscoveryPageResult,
  DiscoveryResult,
} from './types'

const MODES = ['all', 'parallel_only', 'non_parallel'] as const

function emptyResult(
  issues: DiscoveryIssue[],
  stats: { requestCount: number; retryCount: number },
): DiscoveryResult {
  return {
    pages: {},
    cards: [],
    specialEntries: [],
    counts: {
      totalCards: 0,
      uniqueCardNumbers: 0,
      parallelCards: 0,
      nonParallelCards: 0,
      specialEntries: 0,
      multipleOfficialIdCardNumbers: 0,
      normalAndParallelCardNumbers: 0,
      duplicateOfficialIds: 0,
      classificationConflicts: 0,
      unclassifiedOfficialIds: 0,
    },
    isComplete: false,
    issues,
    requestCount: stats.requestCount,
    retryCount: stats.retryCount,
  }
}

function failedPage(
  mode: DiscoveryMode,
  searchUrl: string,
  issue: DiscoveryIssue,
): DiscoveryPageResult {
  return {
    mode,
    searchUrl,
    rawEntryCount: 0,
    parsedEntryCount: 0,
    cards: [],
    specialEntries: [],
    duplicateOfficialIdCount: 0,
    partitionCount: 0,
    isComplete: false,
    issues: [{ ...issue, mode }],
  }
}

export async function discoverCardEntries(
  options: DiscoverCardEntriesOptions,
): Promise<DiscoveryResult> {
  const stats = options.stats ?? { requestCount: 0, retryCount: 0 }
  const formResponse = await options.fetchHtml(options.formUrl, '#searchForm')
  if (!formResponse.ok) return emptyResult([formResponse.error], stats)
  const parsedForm = parseSearchForm(formResponse.value, options.formUrl)
  if (!parsedForm.ok) return emptyResult(parsedForm.errors, stats)
  let form = parsedForm.value

  const viewSourceUrl = buildSearchUrl(form, 'all')
  const viewResponse = await options.fetchHtml(viewSourceUrl, '#content')
  if (!viewResponse.ok) return emptyResult([viewResponse.error], stats)
  const parsedTextView = parseTextViewDefinition(
    viewResponse.value,
    viewSourceUrl,
  )
  if (!parsedTextView.ok) return emptyResult(parsedTextView.errors, stats)
  form = { ...form, textView: parsedTextView.value }

  const pages = {} as Record<DiscoveryMode, DiscoveryPageResult>
  for (const mode of MODES) {
    const searchUrl = buildSearchUrl(form, mode)
    const response = await options.fetchHtml(searchUrl, '#content')
    let page = response.ok
      ? parseDiscoveryPage(response.value, searchUrl, mode)
      : failedPage(mode, searchUrl, response.error)

    const pagination = response.ok
      ? parsePaginationDefinition(response.value, searchUrl)
      : undefined
    if (
      response.ok &&
      pagination?.ok &&
      pagination.value.maxPage > pagination.value.currentPage
    ) {
      const additionalPages: NumberedDiscoveryPage[] = []
      for (
        let pageNumber = pagination.value.currentPage + 1;
        pageNumber <= pagination.value.maxPage;
        pageNumber += 1
      ) {
        const pageUrl = buildPaginationUrl(pagination.value, pageNumber)
        const pageResponse = await options.fetchHtml(pageUrl, 'li.ex-item')
        additionalPages.push({
          pageNumber,
          result: pageResponse.ok
            ? parsePaginationFragment(pageResponse.value, pageUrl, mode)
            : failedPage(mode, pageUrl, pageResponse.error),
        })
      }
      page = mergePaginatedPages(page, pagination.value, additionalPages)
    } else if (!page.isComplete && form.productFilter) {
      const partitions: DiscoveryPageResult[] = []
      for (const product of form.productFilter.options) {
        const partitionUrl = buildSearchUrl(form, mode, product.value)
        const partitionResponse = await options.fetchHtml(
          partitionUrl,
          '#content',
        )
        partitions.push(
          partitionResponse.ok
            ? parseDiscoveryPage(partitionResponse.value, partitionUrl, mode)
            : failedPage(mode, partitionUrl, partitionResponse.error),
        )
      }
      page = mergeDiscoveryPages(page, partitions)
    }
    pages[mode] = page
  }

  return reconcileDiscovery(form, pages, stats)
}
