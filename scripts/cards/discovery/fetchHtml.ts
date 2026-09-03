import { load } from 'cheerio'

import type { DiscoveryIssue, FetchHtmlResult, HtmlFetcher } from './types'

export const DISCOVERY_USER_AGENT = 'hocg-card-tool/0.1 card-data-updater'

export type HtmlFetcherOptions = {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  maxAttempts?: number
  minIntervalMs?: number
  sleep?: (milliseconds: number) => Promise<void>
  now?: () => number
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500
}

function retryAfterMilliseconds(
  value: string | null,
  now: () => number,
): number {
  if (!value) return 0
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000
  const date = Date.parse(value)
  return Number.isNaN(date) ? 0 : Math.max(0, date - now())
}

export function createHtmlFetcher(
  options: HtmlFetcherOptions = {},
): HtmlFetcher {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 15_000
  const maxAttempts = options.maxAttempts ?? 3
  const minIntervalMs = options.minIntervalMs ?? 750
  const sleep = options.sleep ?? wait
  const now = options.now ?? Date.now
  let previousRequestStartedAt: number | undefined
  const stats = { requestCount: 0, retryCount: 0 }

  const fetchHtml = async (
    url: string,
    expectedSelector: string,
  ): Promise<FetchHtmlResult> => {
    let lastError: DiscoveryIssue | undefined
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (previousRequestStartedAt !== undefined) {
        const remaining = minIntervalMs - (now() - previousRequestStartedAt)
        if (remaining > 0) await sleep(remaining)
      }
      previousRequestStartedAt = now()
      stats.requestCount += 1
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetchImpl(url, {
          headers: { 'User-Agent': DISCOVERY_USER_AGENT },
          signal: controller.signal,
        })
        if (!response.ok) {
          lastError = {
            code: 'FETCH_HTTP_ERROR',
            message: `HTTP ${response.status} for ${url}.`,
            url,
          }
          if (shouldRetryStatus(response.status) && attempt < maxAttempts) {
            stats.retryCount += 1
            const retryDelay = retryAfterMilliseconds(
              response.headers.get('retry-after'),
              now,
            )
            if (retryDelay > 0) await sleep(retryDelay)
            continue
          }
          return { ok: false, error: lastError, attempts: attempt }
        }
        const contentType = response.headers.get('content-type') ?? ''
        if (!contentType.toLowerCase().includes('text/html')) {
          return {
            ok: false,
            error: {
              code: 'FETCH_CONTENT_TYPE_INVALID',
              message: `Expected text/html from ${url}, received ${contentType || '(missing)'}.`,
              url,
            },
            attempts: attempt,
          }
        }
        const html = await response.text()
        if (!html.trim()) {
          return {
            ok: false,
            error: {
              code: 'FETCH_EMPTY_RESPONSE',
              message: `Empty HTML from ${url}.`,
              url,
            },
            attempts: attempt,
          }
        }
        if (load(html)(expectedSelector).length === 0) {
          return {
            ok: false,
            error: {
              code: 'FETCH_EXPECTED_DOM_MISSING',
              message: `Expected DOM ${expectedSelector} was not found in ${url}.`,
              url,
            },
            attempts: attempt,
          }
        }
        return { ok: true, value: html, attempts: attempt }
      } catch (error) {
        const timeoutFailure = controller.signal.aborted
        lastError = {
          code: timeoutFailure ? 'FETCH_TIMEOUT' : 'FETCH_NETWORK_ERROR',
          message: timeoutFailure
            ? `Request timed out after ${timeoutMs}ms: ${url}.`
            : `Network error for ${url}: ${error instanceof Error ? error.message : String(error)}.`,
          url,
        }
        if (attempt < maxAttempts) {
          stats.retryCount += 1
          continue
        }
      } finally {
        clearTimeout(timeout)
      }
    }
    return {
      ok: false,
      error: lastError ?? {
        code: 'FETCH_NETWORK_ERROR',
        message: `Request failed for ${url}.`,
        url,
      },
      attempts: maxAttempts,
    }
  }
  fetchHtml.stats = stats
  return fetchHtml
}
