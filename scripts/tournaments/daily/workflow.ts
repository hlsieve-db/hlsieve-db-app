import type { TournamentQueueFile, TournamentQueueRecord } from '../queue/queue'
import type { TournamentReadyArtifact } from '../queue/readyArtifact'
import type { ReadyPublicationSummary } from '../queue/publishReady'
import type { DailyGitStart } from './git'

type PublishedSummary = ReadyPublicationSummary & {
  publishedEventIds: Record<string, string>
  datasetVersion: string
}

export type DailySummary = {
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
}

export type DailyDependencies = {
  assertGitStart: () => Promise<DailyGitStart>
  processDue: () => Promise<string[]>
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
  const processed = resume === 'synced' ? await deps.processDue() : []
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
  if (ready.length === 0) {
    return {
      targetDate: options.targetDate,
      processed,
      ready,
      waiting,
      review,
      published: [],
      results: 0,
      production: 'skipped',
      exitCode: review.length ? 2 : 0,
    }
  }
  const recoveringWritten = resume === 'publication-pending-commit'
  const dry = recoveringWritten
    ? await deps.recoverWritten(ready)
    : await deps.publish(ready, false)
  if (options.dryRun) {
    return {
      targetDate: options.targetDate,
      processed,
      ready,
      waiting,
      review,
      published: [],
      results: dry.resultAdded,
      datasetVersion: dry.datasetVersion,
      production: 'skipped',
      exitCode: review.length ? 2 : 0,
    }
  }
  const written = recoveringWritten ? dry : await deps.publish(ready, true)
  await deps.fetchAndAssertSync()
  const paths = await deps.publicationDiff()
  const commit = await deps.commit(paths)
  if (commit || resume === 'commit-pending-push') await deps.push()
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
    exitCode: review.length ? 2 : 0,
  }
}
