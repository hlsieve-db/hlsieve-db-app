import type { RawCardDetail } from '../parser/types'
import type { DiscoveredCard, DiscoveryResult } from '../discovery/types'

export type DetailFetchIssueCode =
  | 'DISCOVERY_INCOMPLETE'
  | 'DUPLICATE_OFFICIAL_ID_CONFLICT'
  | 'DETAIL_URL_INVALID'
  | 'DETAIL_URL_EXTERNAL'
  | 'DETAIL_URL_CREDENTIALS'
  | 'DETAIL_URL_ID_MISMATCH'
  | 'DETAIL_REDIRECT_EXTERNAL'
  | 'FETCH_TIMEOUT'
  | 'FETCH_NETWORK_ERROR'
  | 'FETCH_HTTP_ERROR'
  | 'FETCH_CONTENT_TYPE_INVALID'
  | 'FETCH_EMPTY_RESPONSE'
  | 'DETAIL_PARSE_FAILED'
  | 'DETAIL_OFFICIAL_ID_MISMATCH'
  | 'DETAIL_CARD_NUMBER_MISMATCH'
  | 'CACHE_WRITE_FAILED'
  | 'CIRCUIT_BREAKER_403'
  | 'CIRCUIT_BREAKER_429'
  | 'CIRCUIT_BREAKER_5XX'

export type DetailFetchIssue = {
  code: DetailFetchIssueCode
  message: string
  officialId?: string
  url?: string
  status?: number
}

export type FetchedCardDetail = {
  card: DiscoveredCard
  html: string
  parsed: RawCardDetail
  source: 'network' | 'cache'
}

export type DetailFetchReport = {
  total: number
  succeeded: number
  fetched: number
  cacheHits: number
  failed: number
  aborted: boolean
  issues: DetailFetchIssue[]
  requestCount: number
  retryCount: number
  results: FetchedCardDetail[]
}

export type DetailFetchProgress = Pick<
  DetailFetchReport,
  'total' | 'succeeded' | 'fetched' | 'cacheHits' | 'failed'
>

export type FetchCardDetailsOptions = {
  cacheDirectory: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  maxAttempts?: number
  minIntervalMs?: number
  sleep?: (milliseconds: number) => Promise<void>
  now?: () => number
  onProgress?: (progress: DetailFetchProgress) => void
}

export type DetailFetchInput = DiscoveryResult
