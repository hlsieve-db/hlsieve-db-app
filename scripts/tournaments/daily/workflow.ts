import type { TournamentQueueFile, TournamentQueueRecord } from '../queue/queue'
import type { TournamentReadyArtifact } from '../queue/readyArtifact'
import type { ReadyPublicationSummary } from '../queue/publishReady'
import type { DailyGitStart } from './git'

type PublishedSummary = ReadyPublicationSummary & {
  publishedEventIds: Record<string, string>
  datasetVersion: string
}

export type DailyRunStatus =
  'success' | 'degraded' | 'action-required' | 'fatal'

export type DailySummary = {
  runStatus: Exclude<DailyRunStatus, 'fatal'>
  exitReason: string
  targetDate: string
  processed: string[]
  ready: string[]
  waiting: string[]
  review: string[]
  published: string[]
  results: number
  datasetVersion?: string
  commit?: string
  production: 'skipped' | 'ok'
  exitCode: 0 | 1 | 2
  discovery: DailyDiscoverySummary
  processing: {
    selected: string[]
    processed: string[]
    ready: string[]
    waitingResult: string[]
    newNeedsReviewThisRun: string[]
  }
  queue: {
    existingNeedsReview: string[]
    newNeedsReviewThisRun: string[]
  }
  publication: {
    attempted: boolean
    published: string[]
    skipped: boolean
    failure: string | null
  }
}

export type DailyDiscoverySummary = {
  status: 'ok' | 'degraded'
  attempted: number
  observed: number
  zero: number
  saturated: number
  failed: number
  challenge: number
  added: number
  existing: number
}

export type DailyProcessResult = {
  selected: string[]
  processed: string[]
  discovery: DailyDiscoverySummary
}

export type DailyDependencies = {
  assertGitStart: () => Promise<DailyGitStart>
  processDue: () => Promise<DailyProcessResult>
  loadQueue: () => Promise<TournamentQueueFile>
  loadArtifact: (sourceEventId: string) => Promise<TournamentReadyArtifact>
  publish: (ids: string[], write: boolean) => Promise<PublishedSummary>
  recoverWritten: (ids: string[]) => Promise<PublishedSummary>
  fetchAndAssertSync: () => Promise<void>
  publicationDiff: () => Promise<string[]>
  commit: (paths: string[]) => Promise<string | undefined>
  push: () => Promise<void>
  production: (
    version: string,
    eventIds: string[],
    representatives: Array<{ eventId: string; resultId: string }>,
  ) => Promise<void>
  transitionPublished: (
    sourceEventId: string,
    publishedEventId: string,
  ) => Promise<void>
}

function byStatus(
  queue: TournamentQueueFile,
  status: TournamentQueueRecord['status'],
): string[] {
  return queue.records
    .filter((record) => record.status === status)
    .map((record) => record.sourceEventId)
}

export async function runDailyWorkflow(
  options: { targetDate: string; dryRun: boolean },
  deps: DailyDependencies,
): Promise<DailySummary> {
  const resume = await deps.assertGitStart()
  const queueBefore = await deps.loadQueue()
  const existingNeedsReview = byStatus(queueBefore, 'needs-review')
  const processResult =
    resume === 'synced'
      ? await deps.processDue()
      : {
          selected: [],
          processed: [],
          discovery: {
            status: 'ok' as const,
            attempted: 0,
            observed: 0,
            zero: 0,
            saturated: 0,
            failed: 0,
            challenge: 0,
            added: 0,
            existing: 0,
          },
        }
  const { processed } = processResult
  const queue = await deps.loadQueue()
  const readyArtifacts = await Promise.all(
    byStatus(queue, 'ready').map((id) => deps.loadArtifact(id)),
  )
  const targets = readyArtifacts.filter(
    ({ event }) => event.date === options.targetDate,
  )
  const ready = targets.map(({ sourceEventId }) => sourceEventId)
  const waiting = byStatus(queue, 'waiting-result')
  const review = byStatus(queue, 'needs-review')
  const previousReview = new Set(existingNeedsReview)
  const newNeedsReviewThisRun = review.filter((id) => !previousReview.has(id))
  const runStatus = newNeedsReviewThisRun.length
    ? 'action-required'
    : processResult.discovery.status === 'degraded'
      ? 'degraded'
      : 'success'
  const exitCode = runStatus === 'action-required' ? 2 : 0
  const base = {
    runStatus,
    exitReason:
      runStatus === 'action-required'
        ? 'new-needs-review'
        : runStatus === 'degraded'
          ? 'discovery-incomplete'
          : 'completed',
    discovery: processResult.discovery,
    processing: {
      selected: processResult.selected,
      processed,
      ready,
      waitingResult: waiting,
      newNeedsReviewThisRun,
    },
    queue: { existingNeedsReview, newNeedsReviewThisRun },
  }
  if (ready.length === 0) {
    return {
      ...base,
      targetDate: options.targetDate,
      processed,
      ready,
      waiting,
      review,
      published: [],
      results: 0,
      production: 'skipped',
      exitCode,
      publication: {
        attempted: false,
        published: [],
        skipped: true,
        failure: null,
      },
    }
  }
  const productionPending = resume === 'production-pending'
  const recoveringWritten =
    resume === 'publication-pending-commit' || productionPending
  const dry = recoveringWritten
    ? await deps.recoverWritten(ready)
    : await deps.publish(ready, false)
  if (options.dryRun) {
    return {
      ...base,
      targetDate: options.targetDate,
      processed,
      ready,
      waiting,
      review,
      published: [],
      results: dry.resultAdded,
      datasetVersion: dry.datasetVersion,
      production: 'skipped',
      exitCode,
      publication: {
        attempted: true,
        published: [],
        skipped: true,
        failure: null,
      },
    }
  }
  const written = recoveringWritten ? dry : await deps.publish(ready, true)
  let commit: string | undefined
  if (!productionPending) {
    await deps.fetchAndAssertSync()
    const paths = await deps.publicationDiff()
    commit = await deps.commit(paths)
    if (commit || resume === 'commit-pending-push') await deps.push()
  }
  const eventIds = Object.values(written.publishedEventIds)
  const representatives = [
    ...new Set(targets.map(({ event }) => event.resultCoverage.maxRank)),
  ].map(
    (maxRank) =>
      targets.find(({ event }) => event.resultCoverage.maxRank === maxRank)!
        .event,
  )
  if (representatives.some((event) => !event.results[0]))
    throw new Error('Daily publication has no representative Result.')
  await deps.production(
    written.datasetVersion,
    eventIds,
    representatives.map((event) => ({
      eventId: event.id,
      resultId: event.results[0]!.id,
    })),
  )
  for (const sourceEventId of ready)
    await deps.transitionPublished(
      sourceEventId,
      written.publishedEventIds[sourceEventId]!,
    )
  return {
    ...base,
    targetDate: options.targetDate,
    processed,
    ready,
    waiting,
    review,
    published: ready,
    results: written.resultAdded,
    datasetVersion: written.datasetVersion,
    commit,
    production: 'ok',
    exitCode,
    publication: {
      attempted: true,
      published: ready,
      skipped: false,
      failure: null,
    },
  }
}
