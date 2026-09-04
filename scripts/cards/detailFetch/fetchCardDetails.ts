import { stableStringify } from '../hash/stableStringify'
import { DISCOVERY_USER_AGENT } from '../discovery/fetchHtml'
import type { DiscoveredCard } from '../discovery/types'
import { parseCardDetailHtml } from '../parser/parseCardDetail'
import { readDetailCache, writeDetailCache } from './detailCache'
import type {
  DetailFetchIssue,
  DetailFetchReport,
  FetchCardDetailsOptions,
  FetchedCardDetail,
  DetailFetchInput,
} from './types'
import {
  validateDetailUrl,
  validateFinalResponseUrl,
} from './validateDetailUrl'

type NetworkSuccess = {
  ok: true
  html: string
  contentType: string
  parsed: FetchedCardDetail['parsed']
}

type NetworkFailure = {
  ok: false
  issue: DetailFetchIssue
  final5xx: boolean
  abortRun: boolean
}

type NetworkResult = NetworkSuccess | NetworkFailure

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function retryAfterMilliseconds(value: string | null, now: () => number) {
  if (!value) return 0
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000
  const date = Date.parse(value)
  return Number.isNaN(date) ? 0 : Math.max(0, date - now())
}

function emptyReport(total: number): DetailFetchReport {
  return {
    total,
    succeeded: 0,
    fetched: 0,
    cacheHits: 0,
    failed: 0,
    aborted: false,
    issues: [],
    requestCount: 0,
    retryCount: 0,
    results: [],
  }
}

function dedupeCards(
  cards: DiscoveredCard[],
):
  | { ok: true; cards: DiscoveredCard[] }
  | { ok: false; issue: DetailFetchIssue } {
  const byId = new Map<string, DiscoveredCard>()
  for (const card of cards) {
    const previous = byId.get(card.officialId)
    if (!previous) {
      byId.set(card.officialId, card)
      continue
    }
    if (stableStringify(previous) !== stableStringify(card)) {
      return {
        ok: false,
        issue: {
          code: 'DUPLICATE_OFFICIAL_ID_CONFLICT',
          message: `Conflicting Discovery metadata for officialId ${card.officialId}.`,
          officialId: card.officialId,
        },
      }
    }
  }
  return { ok: true, cards: [...byId.values()] }
}

export async function fetchCardDetails(
  discovery: DetailFetchInput,
  options: FetchCardDetailsOptions,
): Promise<DetailFetchReport> {
  if (!discovery.isComplete) {
    const report = emptyReport(discovery.cards.length)
    report.failed = discovery.cards.length
    report.aborted = true
    report.issues.push({
      code: 'DISCOVERY_INCOMPLETE',
      message: 'Complete DiscoveryResult is required before detail fetching.',
    })
    return report
  }

  const deduped = dedupeCards(discovery.cards)
  if (!deduped.ok) {
    const report = emptyReport(discovery.cards.length)
    report.failed = discovery.cards.length
    report.aborted = true
    report.issues.push(deduped.issue)
    return report
  }

  const targets = deduped.cards.map((card) => ({
    card,
    validated: validateDetailUrl(card),
  }))
  const invalid = targets.find((target) => !target.validated.ok)
  if (invalid && !invalid.validated.ok) {
    const report = emptyReport(targets.length)
    report.failed = targets.length
    report.aborted = true
    report.issues.push(invalid.validated.issue)
    return report
  }

  const report = emptyReport(targets.length)
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 15_000
  const maxAttempts = options.maxAttempts ?? 3
  const minIntervalMs = options.minIntervalMs ?? 750
  const sleep = options.sleep ?? wait
  const now = options.now ?? Date.now
  let previousRequestStartedAt: number | undefined
  let consecutiveFinal5xx = 0

  const request = async (
    card: DiscoveredCard,
    detailUrl: string,
  ): Promise<NetworkResult> => {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (previousRequestStartedAt !== undefined) {
        const remaining = minIntervalMs - (now() - previousRequestStartedAt)
        if (remaining > 0) await sleep(remaining)
      }
      previousRequestStartedAt = now()
      report.requestCount += 1
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetchImpl(detailUrl, {
          headers: { 'User-Agent': DISCOVERY_USER_AGENT },
          signal: controller.signal,
        })
        const finalUrl = validateFinalResponseUrl(response.url, detailUrl, card)
        if (!finalUrl.ok) {
          return {
            ok: false,
            issue: finalUrl.issue,
            final5xx: false,
            abortRun: true,
          }
        }
        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500
          if (retryable && attempt < maxAttempts) {
            report.retryCount += 1
            const retryAfter = retryAfterMilliseconds(
              response.headers.get('retry-after'),
              now,
            )
            if (retryAfter > 0) await sleep(retryAfter)
            continue
          }
          const issue: DetailFetchIssue = {
            code: 'FETCH_HTTP_ERROR',
            message: `HTTP ${response.status} for ${detailUrl}.`,
            officialId: card.officialId,
            url: detailUrl,
            status: response.status,
          }
          return {
            ok: false,
            issue,
            final5xx: response.status >= 500,
            abortRun: response.status === 403 || response.status === 429,
          }
        }
        const contentType = response.headers.get('content-type') ?? ''
        if (!contentType.toLowerCase().includes('text/html')) {
          return {
            ok: false,
            issue: {
              code: 'FETCH_CONTENT_TYPE_INVALID',
              message: `Expected text/html from ${detailUrl}, received ${contentType || '(missing)'}.`,
              officialId: card.officialId,
              url: detailUrl,
            },
            final5xx: false,
            abortRun: false,
          }
        }
        const html = await response.text()
        if (!html.trim()) {
          return {
            ok: false,
            issue: {
              code: 'FETCH_EMPTY_RESPONSE',
              message: `Empty HTML from ${detailUrl}.`,
              officialId: card.officialId,
              url: detailUrl,
            },
            final5xx: false,
            abortRun: false,
          }
        }
        const parsed = parseCardDetailHtml(html, finalUrl.url)
        if (!parsed.ok) {
          return {
            ok: false,
            issue: {
              code: 'DETAIL_PARSE_FAILED',
              message: `Detail parser rejected officialId ${card.officialId}: ${parsed.errors.map((error) => error.code).join(', ')}.`,
              officialId: card.officialId,
              url: detailUrl,
            },
            final5xx: false,
            abortRun: false,
          }
        }
        if (parsed.value.officialId !== card.officialId) {
          return {
            ok: false,
            issue: {
              code: 'DETAIL_OFFICIAL_ID_MISMATCH',
              message: `Parsed officialId ${parsed.value.officialId} does not match ${card.officialId}.`,
              officialId: card.officialId,
              url: detailUrl,
            },
            final5xx: false,
            abortRun: false,
          }
        }
        if (parsed.value.cardNumberRaw !== card.cardNumber) {
          return {
            ok: false,
            issue: {
              code: 'DETAIL_CARD_NUMBER_MISMATCH',
              message: `Parsed cardNumber ${parsed.value.cardNumberRaw ?? '(missing)'} does not match ${card.cardNumber}.`,
              officialId: card.officialId,
              url: detailUrl,
            },
            final5xx: false,
            abortRun: false,
          }
        }
        return { ok: true, html, contentType, parsed: parsed.value }
      } catch (error) {
        const timedOut = controller.signal.aborted
        if (attempt < maxAttempts) {
          report.retryCount += 1
          continue
        }
        return {
          ok: false,
          issue: {
            code: timedOut ? 'FETCH_TIMEOUT' : 'FETCH_NETWORK_ERROR',
            message: timedOut
              ? `Request timed out after ${timeoutMs}ms: ${detailUrl}.`
              : `Network error for ${detailUrl}: ${error instanceof Error ? error.message : String(error)}.`,
            officialId: card.officialId,
            url: detailUrl,
          },
          final5xx: false,
          abortRun: false,
        }
      } finally {
        clearTimeout(timeout)
      }
    }
    throw new Error('Unreachable detail fetch state.')
  }

  for (const target of targets) {
    if (!target.validated.ok) throw new Error('URL preflight invariant failed.')
    const cached = await readDetailCache(
      options.cacheDirectory,
      target.card,
      target.validated.url,
    )
    if (cached) {
      report.results.push(cached)
      report.cacheHits += 1
      report.succeeded += 1
      consecutiveFinal5xx = 0
      options.onProgress?.(report)
      continue
    }

    const network = await request(target.card, target.validated.url)
    if (!network.ok) {
      report.failed += 1
      report.issues.push(network.issue)
      consecutiveFinal5xx = network.final5xx ? consecutiveFinal5xx + 1 : 0
      if (network.abortRun || consecutiveFinal5xx >= 3) {
        report.aborted = true
        const circuitCode =
          network.issue.status === 403
            ? 'CIRCUIT_BREAKER_403'
            : network.issue.status === 429
              ? 'CIRCUIT_BREAKER_429'
              : consecutiveFinal5xx >= 3
                ? 'CIRCUIT_BREAKER_5XX'
                : undefined
        if (circuitCode) {
          report.issues.push({
            code: circuitCode,
            message: `Detail fetch run aborted after ${network.issue.code}.`,
            officialId: target.card.officialId,
            url: target.validated.url,
            ...(network.issue.status !== undefined
              ? { status: network.issue.status }
              : {}),
          })
        }
        options.onProgress?.(report)
        break
      }
      options.onProgress?.(report)
      continue
    }

    consecutiveFinal5xx = 0
    try {
      await writeDetailCache(
        options.cacheDirectory,
        target.card,
        target.validated.url,
        network.contentType,
        network.html,
        new Date(now()).toISOString(),
      )
    } catch (error) {
      report.failed += 1
      report.issues.push({
        code: 'CACHE_WRITE_FAILED',
        message: `Failed to cache officialId ${target.card.officialId}: ${error instanceof Error ? error.message : String(error)}.`,
        officialId: target.card.officialId,
        url: target.validated.url,
      })
      options.onProgress?.(report)
      continue
    }
    report.results.push({
      card: target.card,
      html: network.html,
      parsed: network.parsed,
      source: 'network',
    })
    report.fetched += 1
    report.succeeded += 1
    options.onProgress?.(report)
  }

  return report
}
