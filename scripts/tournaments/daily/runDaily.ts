import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { CardsDataFile } from '../../../src/domain/cards/types'
import { acquireDailyLock } from './lock'
import { parseTournamentDailyCli } from './cli'
import {
  readDailyCheckpoint,
  writeDailyCheckpoint,
  type DailyCheckpoint,
} from './checkpoint'
import {
  assertDailyGitStart,
  commitDailyPublication,
  fetchAndAssertNotBehind,
  publicationDiff,
  pushDailyCommit,
} from './git'
import { waitForProductionPublication, smokeProductionUi } from './production'
import { runDailyWorkflow } from './workflow'
import { LocalTournamentQueueRepository } from '../queue/repository'
import { TournamentReadyArtifactRepository } from '../queue/readyArtifact'
import { publishReadyTournamentEvents } from '../queue/publishReady'

const options = parseTournamentDailyCli(process.argv.slice(2))
const previous = await readDailyCheckpoint(options.targetDate)
const gitStart = await assertDailyGitStart(
  options.targetDate,
  previous?.phase === 'written',
)
const release = await acquireDailyLock(options.targetDate)
const repository = new LocalTournamentQueueRepository()
const artifacts = new TournamentReadyArtifactRepository()
const cardsData = JSON.parse(
  await readFile(resolve('public/cards.json'), 'utf8'),
) as CardsDataFile
const startedAt = previous?.startedAt ?? new Date().toISOString()
let checkpoint: DailyCheckpoint = previous ?? {
  targetDate: options.targetDate,
  startedAt,
  phase: 'started',
  processedIds: [],
  readyIds: [],
  waitingIds: [],
  reviewIds: [],
  publicationEventIds: [],
}

async function runQueueBatch(max: number): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['run', 'tournaments:queue', '--', 'process', '--max', String(max)],
      { stdio: 'inherit', shell: false },
    )
    child.once('error', reject)
    child.once('exit', (code) =>
      code === 0
        ? resolvePromise()
        : reject(new Error(`Queue processor exited ${code}.`)),
    )
  })
}

function dueCount(
  now: string,
  records: Awaited<
    ReturnType<LocalTournamentQueueRepository['load']>
  >['records'],
): number {
  return records.filter(
    (record) =>
      record.status === 'queued' ||
      (record.status === 'waiting-result' &&
        record.nextAttemptAt !== undefined &&
        record.nextAttemptAt <= now) ||
      (record.status === 'collecting' &&
        record.leaseUntil !== undefined &&
        record.leaseUntil <= now),
  ).length
}

try {
  const summary = await runDailyWorkflow(options, {
    assertGitStart: async () => gitStart,
    processDue: async () => {
      const before = await repository.load()
      const beforeAttempts = new Map(
        before.records.map((record) => [
          record.sourceEventId,
          record.attemptCount,
        ]),
      )
      while (true) {
        const now = new Date().toISOString()
        const count = dueCount(now, (await repository.load()).records)
        if (count === 0) break
        await runQueueBatch(Math.min(10, count))
      }
      const after = await repository.load()
      const processed = after.records
        .filter(
          (record) =>
            record.attemptCount >
            (beforeAttempts.get(record.sourceEventId) ?? -1),
        )
        .map((record) => record.sourceEventId)
      checkpoint = {
        ...checkpoint,
        phase: 'collected',
        processedIds: processed,
      }
      await writeDailyCheckpoint(checkpoint)
      return processed
    },
    loadQueue: () => repository.load(),
    loadArtifact: (id) => artifacts.load(id, cardsData),
    publish: async (ids, write) => {
      const result = await publishReadyTournamentEvents({
        sourceEventIds: ids,
        write,
        queue: repository,
        artifacts,
        cardsData,
      })
      checkpoint = {
        ...checkpoint,
        phase: write ? 'written' : 'staged',
        readyIds: ids,
        publicationEventIds: Object.values(result.publishedEventIds),
        expectedDatasetVersion: result.datasetVersion,
      }
      await writeDailyCheckpoint(checkpoint)
      return result
    },
    fetchAndAssertSync: () =>
      fetchAndAssertNotBehind(gitStart === 'commit-pending-push'),
    publicationDiff,
    commit: async (paths) => {
      const sha = await commitDailyPublication(options.targetDate, paths)
      checkpoint = { ...checkpoint, phase: 'committed', gitCommitSha: sha }
      await writeDailyCheckpoint(checkpoint)
      return sha
    },
    push: async () => {
      await pushDailyCommit()
      checkpoint = { ...checkpoint, phase: 'pushed' }
      await writeDailyCheckpoint(checkpoint)
    },
    production: async (version, eventIds, representative) => {
      await waitForProductionPublication({
        expectedVersion: version,
        cardsDataVersion: cardsData.dataVersion,
        eventIds,
      })
      await smokeProductionUi(representative.eventId, representative.resultId)
      checkpoint = {
        ...checkpoint,
        phase: 'production-verified',
        productionStatus: 'ok',
      }
      await writeDailyCheckpoint(checkpoint)
    },
    transitionPublished: async (sourceEventId, publishedEventId) => {
      await repository.transition(sourceEventId, 'published', {
        publishedEventId,
      })
    },
  })
  checkpoint = {
    ...checkpoint,
    phase: 'complete',
    readyIds: summary.ready,
    waitingIds: summary.waiting,
    reviewIds: summary.review,
    publicationEventIds: summary.published,
    expectedDatasetVersion: summary.datasetVersion,
    gitCommitSha: summary.commit,
    productionStatus: summary.production === 'ok' ? 'ok' : undefined,
  }
  await writeDailyCheckpoint(checkpoint)
  console.log(
    `Tournament Daily ${summary.targetDate}\nProcessed: ${summary.processed.length}\nPublished: ${summary.published.length} Events / ${summary.results} Results\nWaiting: ${summary.waiting.length}\nNeeds review: ${summary.review.length}\nProduction: ${summary.production}\nDataset: ${summary.datasetVersion ?? '-'}\nCommit: ${summary.commit ?? '-'}`,
  )
  process.exitCode = summary.exitCode
} catch (error) {
  checkpoint = { ...checkpoint, phase: 'failed', productionStatus: 'failed' }
  await writeDailyCheckpoint(checkpoint)
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  await release()
}
