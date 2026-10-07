import { randomUUID } from 'node:crypto'

import type {
  TournamentDiscoveryCandidate,
  TournamentDiscoveryQueryResult,
  TournamentDiscoveryRunResult,
} from './types'

export const TOURNAMENT_DISCOVERY_SATURATION_COUNT = 10
const BUSHI_NAVI_RESULT_ORIGIN = 'https://www.bushi-navi.com/event/result'

export type TournamentDiscoverySource = {
  query(seriesId: string, date: string): Promise<readonly string[]>
}

export type RunTournamentDiscoveryOptions = {
  source: TournamentDiscoverySource
  seriesIds: readonly string[]
  dates: readonly string[]
  mode?: TournamentDiscoveryRunResult['mode']
  now?: () => string
  createRunId?: () => string
}

function classifyError(error: unknown): {
  outcome: 'failed' | 'challenge'
  errorCode: string
} {
  const message = error instanceof Error ? error.message : String(error)
  if (
    /captcha|challenge|cloudfront|cloudflare|\b403\b|\b429\b/i.test(message)
  ) {
    return { outcome: 'challenge', errorCode: 'source-challenge' }
  }
  return { outcome: 'failed', errorCode: 'source-error' }
}

function uniqueEventIds(values: readonly string[]): string[] {
  const ids = new Set<string>()
  for (const value of values) {
    if (!/^\d+$/.test(value)) throw new Error('Invalid discovered Event ID.')
    ids.add(value)
  }
  return [...ids]
}

export function createOverlapDates(targetDate: string, days = 4): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error('Discovery target date must use YYYY-MM-DD.')
  }
  if (!Number.isSafeInteger(days) || days < 1) {
    throw new Error('Discovery overlap days must be a positive integer.')
  }
  const target = new Date(`${targetDate}T00:00:00Z`)
  if (
    Number.isNaN(target.valueOf()) ||
    target.toISOString().slice(0, 10) !== targetDate
  ) {
    throw new Error('Discovery target date is invalid.')
  }
  return Array.from({ length: days }, (_, offset) => {
    const date = new Date(target)
    date.setUTCDate(date.getUTCDate() - offset)
    return date.toISOString().slice(0, 10)
  }).reverse()
}

export function createInclusiveDateRange(from: string, to: string): string[] {
  const fromDate = createOverlapDates(from, 1)[0]!
  const toDate = createOverlapDates(to, 1)[0]!
  if (fromDate > toDate) {
    throw new Error('Discovery range start must not be after its end.')
  }
  const dates: string[] = []
  const cursor = new Date(`${fromDate}T00:00:00Z`)
  while (cursor.toISOString().slice(0, 10) <= toDate) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

export async function runTournamentDiscovery(
  options: RunTournamentDiscoveryOptions,
): Promise<TournamentDiscoveryRunResult> {
  if (options.seriesIds.length === 0) {
    throw new Error('Discovery requires at least one series.')
  }
  if (options.dates.length === 0) {
    throw new Error('Discovery requires at least one date.')
  }
  const now = options.now ?? (() => new Date().toISOString())
  const startedAt = now()
  const queries: TournamentDiscoveryQueryResult[] = []
  const candidatesById = new Map<
    string,
    { candidate: TournamentDiscoveryCandidate; saturated: boolean }
  >()

  for (const seriesId of options.seriesIds) {
    for (const date of options.dates) {
      const attemptedAt = now()
      try {
        const observedIds = await options.source.query(seriesId, date)
        const candidateIds = uniqueEventIds(observedIds)
        const saturated =
          observedIds.length >= TOURNAMENT_DISCOVERY_SATURATION_COUNT
        queries.push({
          seriesId,
          date,
          attemptedAt,
          outcome: saturated ? 'saturated' : 'observed',
          observedCount: observedIds.length,
          candidateIds,
          saturated,
          zeroResultObserved: observedIds.length === 0,
        })
        for (const sourceEventId of candidateIds) {
          const existing = candidatesById.get(sourceEventId)
          if (existing && (!existing.saturated || saturated)) continue
          candidatesById.set(sourceEventId, {
            candidate: {
              sourceEventId,
              sourceUrl: `${BUSHI_NAVI_RESULT_ORIGIN}/${sourceEventId}`,
              seriesId,
              observedForDate: date,
              discoveredAt: attemptedAt,
            },
            saturated,
          })
        }
      } catch (error) {
        const failure = classifyError(error)
        queries.push({
          seriesId,
          date,
          attemptedAt,
          outcome: failure.outcome,
          candidateIds: [],
          saturated: false,
          zeroResultObserved: false,
          errorCode: failure.errorCode,
        })
      }
    }
  }

  const candidates = [...candidatesById.values()].map(
    ({ candidate }) => candidate,
  )
  return {
    runId: options.createRunId?.() ?? randomUUID(),
    startedAt,
    completedAt: now(),
    mode: options.mode ?? 'manual',
    requestedRange: {
      from: options.dates[0]!,
      to: options.dates.at(-1)!,
    },
    queries,
    candidates,
    summary: {
      attemptedQueries: queries.length,
      successfulQueries: queries.filter(
        (query) =>
          query.outcome === 'observed' || query.outcome === 'saturated',
      ).length,
      zeroResultQueries: queries.filter((query) => query.zeroResultObserved)
        .length,
      saturatedQueries: queries.filter((query) => query.saturated).length,
      failedQueries: queries.filter((query) => query.outcome === 'failed')
        .length,
      challengeQueries: queries.filter((query) => query.outcome === 'challenge')
        .length,
      observedCandidates: queries.reduce(
        (total, query) => total + query.candidateIds.length,
        0,
      ),
      uniqueCandidates: candidates.length,
    },
  }
}
