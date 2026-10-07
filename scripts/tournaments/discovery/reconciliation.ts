import type { TournamentQueueFile } from '../queue/queue'
import { planAutomatedTournamentIntake } from './automatedIntake'
import { runTournamentDiscovery, type TournamentDiscoverySource } from './core'
import type {
  TournamentDiscoveryCandidate,
  TournamentDiscoveryQueryResult,
  TournamentDiscoveryRunResult,
} from './types'

export type TournamentReconciliationPreviewReport = {
  bestEffort: true
  completenessGuaranteed: false
  requestedRange: { from: string; to: string }
  seriesIds: string[]
  summary: TournamentDiscoveryRunResult['summary'] & {
    existingEvents: number
    newEvents: number
    rejectedCandidates: number
  }
  newEvents: TournamentDiscoveryCandidate[]
  existingEventIds: string[]
  rejected: Array<{ sourceEventId?: string; reason: string }>
  saturatedQueries: Array<{
    seriesId: string
    date: string
    observedCount: number
    completeness: 'unknown'
  }>
  problemQueries: Array<{
    seriesId: string
    date: string
    outcome: 'failed' | 'challenge'
    errorCode: string
  }>
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size))
  }
  return result
}

function candidateWasSaturated(
  run: TournamentDiscoveryRunResult,
  candidate: TournamentDiscoveryCandidate,
): boolean {
  return Boolean(
    run.queries.find(
      (query) =>
        query.seriesId === candidate.seriesId &&
        query.date === candidate.observedForDate &&
        query.candidateIds.includes(candidate.sourceEventId),
    )?.saturated,
  )
}

export function combineTournamentDiscoveryRuns(
  runs: readonly TournamentDiscoveryRunResult[],
): TournamentDiscoveryRunResult {
  const queries = runs.flatMap((run) => run.queries)
  const candidates = new Map<
    string,
    { candidate: TournamentDiscoveryCandidate; saturated: boolean }
  >()
  for (const run of runs) {
    for (const candidate of run.candidates) {
      const saturated = candidateWasSaturated(run, candidate)
      const existing = candidates.get(candidate.sourceEventId)
      if (existing && (!existing.saturated || saturated)) continue
      candidates.set(candidate.sourceEventId, { candidate, saturated })
    }
  }
  const first = runs[0]!
  const last = runs.at(-1)!
  return {
    runId: `reconciliation:${first.runId}:${last.runId}`,
    startedAt: first.startedAt,
    completedAt: last.completedAt,
    mode: 'reconciliation',
    requestedRange: {
      from: first.requestedRange.from,
      to: last.requestedRange.to,
    },
    queries,
    candidates: [...candidates.values()].map(({ candidate }) => candidate),
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
      uniqueCandidates: candidates.size,
    },
  }
}

export async function runTournamentReconciliation(options: {
  source: TournamentDiscoverySource
  seriesIds: readonly string[]
  dates: readonly string[]
  chunkDays?: number
  now?: () => string
  saveRun?: (run: TournamentDiscoveryRunResult) => Promise<void>
}): Promise<TournamentDiscoveryRunResult> {
  const dateChunks = chunks(options.dates, options.chunkDays ?? 7)
  if (dateChunks.length === 0) {
    throw new Error('Reconciliation requires at least one date.')
  }
  const runs: TournamentDiscoveryRunResult[] = []
  for (const dates of dateChunks) {
    const run = await runTournamentDiscovery({
      source: options.source,
      seriesIds: options.seriesIds,
      dates,
      mode: 'reconciliation',
      now: options.now,
    })
    await options.saveRun?.(run)
    runs.push(run)
  }
  return combineTournamentDiscoveryRuns(runs)
}

export function createTournamentReconciliationPreview(
  discovery: TournamentDiscoveryRunResult,
  queue: TournamentQueueFile,
): TournamentReconciliationPreviewReport {
  const comparison = planAutomatedTournamentIntake(
    queue,
    discovery.candidates,
    discovery.completedAt,
  )
  const newIds = new Set(comparison.result.added)
  return {
    bestEffort: true,
    completenessGuaranteed: false,
    requestedRange: discovery.requestedRange,
    seriesIds: [...new Set(discovery.queries.map((query) => query.seriesId))],
    summary: {
      ...discovery.summary,
      existingEvents: comparison.result.existing.length,
      newEvents: comparison.result.added.length,
      rejectedCandidates: comparison.result.rejected.length,
    },
    newEvents: discovery.candidates.filter((candidate) =>
      newIds.has(candidate.sourceEventId),
    ),
    existingEventIds: comparison.result.existing,
    rejected: comparison.result.rejected,
    saturatedQueries: discovery.queries
      .filter(
        (
          query,
        ): query is TournamentDiscoveryQueryResult & {
          observedCount: number
        } => query.saturated && query.observedCount !== undefined,
      )
      .map((query) => ({
        seriesId: query.seriesId,
        date: query.date,
        observedCount: query.observedCount,
        completeness: 'unknown' as const,
      })),
    problemQueries: discovery.queries
      .filter(
        (
          query,
        ): query is TournamentDiscoveryQueryResult & {
          outcome: 'failed' | 'challenge'
          errorCode: string
        } =>
          (query.outcome === 'failed' || query.outcome === 'challenge') &&
          query.errorCode !== undefined,
      )
      .map((query) => ({
        seriesId: query.seriesId,
        date: query.date,
        outcome: query.outcome,
        errorCode: query.errorCode,
      })),
  }
}
