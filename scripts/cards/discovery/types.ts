import type { NormalizedListEntry } from '../normalize/types'

export type DiscoveryMode = 'all' | 'parallel_only' | 'non_parallel'

export type ParallelFilterDefinition = {
  parameterName: string
  allValue: string
  parallelOnlyValue: string
  nonParallelValue: string
}

export type ProductFilterOption = {
  value: string
  label: string
}

export type ProductFilterDefinition = {
  parameterName: string
  options: ProductFilterOption[]
}

export type SearchFormDefinition = {
  sourceUrl: string
  action: string
  method: 'get'
  parallelFilter: ParallelFilterDefinition
  productFilter?: ProductFilterDefinition
  textView?: {
    parameterName: string
    value: string
  }
}

export type DiscoveredCard = {
  kind: 'card'
  officialId: string
  detailUrl: string
  cardNumber: string
  name: string
  imageUrl?: string
  isParallel: boolean
  sourceSearchUrl: string
}

export type DiscoveredSpecialEntry = {
  kind: 'special'
  officialId?: string
  detailUrl?: string
  name: string
  imageUrl?: string
  sourceSearchUrl: string
}

export type DiscoveryIssue = {
  code:
    | 'FORM_NOT_FOUND'
    | 'FORM_METHOD_NOT_GET'
    | 'FORM_ACTION_MISSING'
    | 'PARALLEL_FILTER_MISSING'
    | 'PARALLEL_OPTION_MISSING'
    | 'PARALLEL_OPTION_UNKNOWN'
    | 'PARALLEL_OPTION_DUPLICATE_VALUE'
    | 'PRODUCT_FILTER_INVALID'
    | 'TEXT_VIEW_DEFINITION_MISSING'
    | 'FETCH_TIMEOUT'
    | 'FETCH_NETWORK_ERROR'
    | 'FETCH_HTTP_ERROR'
    | 'FETCH_CONTENT_TYPE_INVALID'
    | 'FETCH_EMPTY_RESPONSE'
    | 'FETCH_EXPECTED_DOM_MISSING'
    | 'PAGINATION_CONFIG_MISSING'
    | 'PAGINATION_CONFIG_INVALID'
    | 'PAGINATION_PAGE_MISSING'
    | 'PAGINATION_FRAGMENT_INVALID'
    | 'DECLARED_COUNT_MISSING'
    | 'LIST_PARSE_FAILED'
    | 'LIST_NORMALIZE_FAILED'
    | 'DECLARED_COUNT_MISMATCH'
    | 'CLASSIFIED_COUNT_MISMATCH'
    | 'DUPLICATE_OFFICIAL_ID_CONFLICT'
    | 'FILTER_ID_OUTSIDE_ALL'
    | 'FILTER_METADATA_CONFLICT'
    | 'PARALLEL_MEMBERSHIP_CONFLICT'
    | 'PARALLEL_MEMBERSHIP_MISSING'
  message: string
  mode?: DiscoveryMode
  officialId?: string
  url?: string
}

export type PaginationParameter = {
  name: string
  value: string
}

export type PaginationDefinition = {
  sourceUrl: string
  endpointUrl: string
  method: 'get'
  currentPage: number
  maxPage: number
  filterParameters: PaginationParameter[]
  pageParameterName: string
  cacheBusterParameterName: string
}

export type PaginationSummary = {
  currentPage: number
  maxPage: number
  fetchedPages: number[]
  pageEntryCounts: number[]
}

export type DiscoveryPageResult = {
  mode: DiscoveryMode
  searchUrl: string
  declaredResultCount?: number
  rawEntryCount: number
  parsedEntryCount: number
  cards: Extract<NormalizedListEntry, { kind: 'card' }>[]
  specialEntries: Extract<NormalizedListEntry, { kind: 'special' }>[]
  duplicateOfficialIdCount: number
  partitionCount: number
  pagination?: PaginationSummary
  isComplete: boolean
  issues: DiscoveryIssue[]
}

export type DiscoveryResult = {
  formDefinition?: SearchFormDefinition
  pages: Partial<Record<DiscoveryMode, DiscoveryPageResult>>
  cards: DiscoveredCard[]
  specialEntries: DiscoveredSpecialEntry[]
  counts: {
    totalCards: number
    uniqueCardNumbers: number
    parallelCards: number
    nonParallelCards: number
    specialEntries: number
    multipleOfficialIdCardNumbers: number
    normalAndParallelCardNumbers: number
    duplicateOfficialIds: number
    classificationConflicts: number
    unclassifiedOfficialIds: number
  }
  isComplete: boolean
  issues: DiscoveryIssue[]
  requestCount: number
  retryCount: number
}

export type FetchHtmlSuccess = {
  ok: true
  value: string
  attempts: number
}

export type FetchHtmlFailure = {
  ok: false
  error: DiscoveryIssue
  attempts: number
}

export type FetchHtmlResult = FetchHtmlSuccess | FetchHtmlFailure

export type DiscoveryFetch = (
  url: string,
  expectedSelector: string,
) => Promise<FetchHtmlResult>

export type HtmlFetcher = DiscoveryFetch & {
  stats: { requestCount: number; retryCount: number }
}

export type DiscoverCardEntriesOptions = {
  formUrl: string
  fetchHtml: DiscoveryFetch
  stats?: { requestCount: number; retryCount: number }
}
