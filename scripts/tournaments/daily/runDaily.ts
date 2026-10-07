import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { chromium, type Browser, type Page } from 'playwright'

import type { CardsDataFile } from '../../../src/domain/cards/types'
import type {
  TournamentIndexFile,
  TournamentOshiMasterFile,
} from '../../../src/domain/tournaments/types'
import { acquireDailyLock } from './lock'
import { parseTournamentDailyCli } from './cli'
import {
  readDailyCheckpoint,
  writeDailyCheckpoint,
  type DailyCheckpoint,
} from './checkpoint'
import {
  assertDailyRecoveryCommit,
  assertDailyGitStart,
  commitDailyPublication,
  fetchAndAssertNotBehind,
  publicationDiff,
  pushDailyCommit,
} from './git'
import { waitForProductionPublication, smokeProductionUi } from './production'
import { runDailyWorkflow } from './workflow'
import { runNpmScript } from './childProcess'
import { recoverWrittenPublication } from './recovery'
import {
  processSelectedTournamentEvents,
  selectDueTournamentEventsForDate,
} from './dateSelection'
import { probeKnownTournamentEventMetadata } from '../collector/bushiNavi'
import { TOURNAMENT_SERIES_CONFIGS } from '../collector/seriesConfig'
import { createBushiNaviDiscoverySource } from '../discovery/bushiNaviSource'
import { createOverlapDates, runTournamentDiscovery } from '../discovery/core'
import { TournamentDiscoveryObservationRepository } from '../discovery/observationRepository'
import { LocalTournamentQueueRepository } from '../queue/repository'
import { TournamentReadyArtifactRepository } from '../queue/readyArtifact'
import { publishReadyTournamentEvents } from '../queue/publishReady'
import { runTournamentDailyDiscoveryPhase } from './discoveryPhase'

const options = parseTournamentDailyCli(process.argv.slice(2))
const previous = await readDailyCheckpoint(options.targetDate)
const hasWrittenPublication =
  previous?.expectedDatasetVersion !== undefined &&
  previous.publicationEventIds.length > 0 &&
  (previous.phase === 'written' || previous.phase === 'failed')
const checkedGitStart = await assertDailyGitStart(
  options.targetDate,
  hasWrittenPublication,
)
const recoveryCommit =
  checkedGitStart === 'synced' &&
  previous?.phase === 'failed' &&
  previous.productionStatus === 'failed' &&
  previous.gitCommitSha !== undefined
    ? previous.gitCommitSha
    : undefined
if (recoveryCommit) await assertDailyRecoveryCommit(recoveryCommit)
const gitStart = recoveryCommit ? 'production-pending' : checkedGitStart
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

async function runQueueEvent(sourceEventId: string): Promise<void> {
  await runNpmScript({
    script: 'tournaments:queue',
    args: ['process', '--event-id', sourceEventId],
    cwd: process.cwd(),
  })
}

try {
  const summary = await runDailyWorkflow(options, {
    assertGitStart: async () => gitStart,
    processDue: async () => {
      const discoveredAt = new Date().toISOString()
      const discoveryPhase = await runTournamentDailyDiscoveryPhase({
        discover: async () => {
          const browser = await chromium.launch({ headless: false })
          try {
            const page = await (await browser.newContext()).newPage()
            const discovery = await runTournamentDiscovery({
              source: createBushiNaviDiscoverySource(page),
              seriesIds: TOURNAMENT_SERIES_CONFIGS.map(
                (series) => series.seriesId,
              ),
              dates: createOverlapDates(options.targetDate),
              mode: 'daily',
              resultCountChangedRetries: 2,
            })
            await new TournamentDiscoveryObservationRepository().saveRun(
              discovery,
            )
            return discovery
          } finally {
            await browser.close()
          }
        },
        intake: (candidates) =>
          repository.automatedIntake(candidates, discoveredAt),
      })
      console.log(JSON.stringify({ discovery: discoveryPhase }))
      const before = await repository.load()
      const beforeAttempts = new Map(
        before.records.map((record) => [
          record.sourceEventId,
          record.attemptCount,
        ]),
      )
      let browser: Browser | undefined
      let page: Page | undefined
      let selectedEventIds: string[]
      try {
        const selection = await selectDueTournamentEventsForDate({
          records: before.records,
          targetDate: options.targetDate,
          now: new Date().toISOString(),
          probe: async (sourceEventId) => {
            browser ??= await chromium.launch({ headless: false })
            page ??= await (await browser.newContext()).newPage()
            const metadata = await probeKnownTournamentEventMetadata({
              page,
              sourceEventId,
            })
            return { sourceEventId, eventDate: metadata.date }
          },
          persist: async (sourceEventId, eventDate) => {
            await repository.setOfficialEventDate(sourceEventId, eventDate)
          },
        })
        selectedEventIds = selection.selected
        console.log(JSON.stringify({ dateSelection: selection }))
        await processSelectedTournamentEvents(selectedEventIds, runQueueEvent)
      } finally {
        await browser?.close()
      }
      const after = await repository.load()
      const processed = after.records
        .filter(
          (record) =>
            record.attemptCount >
            (beforeAttempts.get(record.sourceEventId) ?? -1),
        )
        .map((record) => record.sourceEventId)
      for (const record of after.records.filter(
        (candidate) =>
          processed.includes(candidate.sourceEventId) &&
          candidate.status === 'ready',
      )) {
        const artifact = await artifacts.load(record.sourceEventId, cardsData)
        if (artifact.event.date !== options.targetDate) {
          await repository.transition(record.sourceEventId, 'needs-review', {
            errorCode: 'event-date-mismatch',
          })
          throw new Error(
            `Tournament Event date changed after selection: ${record.sourceEventId}.`,
          )
        }
      }
      checkpoint = {
        ...checkpoint,
        phase: 'collected',
        processedIds: processed,
      }
      await writeDailyCheckpoint(checkpoint)
      const summary =
        'discovery' in discoveryPhase
          ? discoveryPhase.discovery.summary
          : undefined
      const intake =
        'intake' in discoveryPhase ? discoveryPhase.intake : undefined
      return {
        selected: selectedEventIds,
        processed,
        discovery: {
          status: discoveryPhase.status,
          attempted: summary?.attemptedQueries ?? 0,
          observed:
            (summary?.successfulQueries ?? 0) -
            (summary?.saturatedQueries ?? 0),
          zero: summary?.zeroResultQueries ?? 0,
          saturated: summary?.saturatedQueries ?? 0,
          failed:
            summary?.failedQueries ??
            (discoveryPhase.status === 'degraded' ? 1 : 0),
          challenge: summary?.challengeQueries ?? 0,
          added: intake?.added.length ?? 0,
          existing: intake?.existing.length ?? 0,
        },
      }
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
    recoverWritten: async (ids) => {
      if (!previous?.expectedDatasetVersion) {
        throw new Error('Daily recovery checkpoint has no dataset version.')
      }
      const [index, oshiMaster, readyArtifacts] = await Promise.all([
        readFile(resolve('public/tournaments/index.json'), 'utf8').then(
          (text) => JSON.parse(text) as TournamentIndexFile,
        ),
        readFile(resolve('public/tournaments/oshi-master.json'), 'utf8').then(
          (text) => JSON.parse(text) as TournamentOshiMasterFile,
        ),
        Promise.all(ids.map((id) => artifacts.load(id, cardsData))),
      ])
      return recoverWrittenPublication({
        artifacts: readyArtifacts,
        index,
        oshiMaster,
        expectedDatasetVersion: previous.expectedDatasetVersion,
      })
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
    production: async (version, eventIds, representatives) => {
      await waitForProductionPublication({
        expectedVersion: version,
        cardsDataVersion: cardsData.dataVersion,
        eventIds,
      })
      await smokeProductionUi(representatives)
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
  console.log(JSON.stringify({ dailySummary: summary }))
  process.exitCode = summary.exitCode
} catch (error) {
  checkpoint = { ...checkpoint, phase: 'failed', productionStatus: 'failed' }
  await writeDailyCheckpoint(checkpoint)
  console.error(error instanceof Error ? error.message : String(error))
  console.error(
    JSON.stringify({
      dailySummary: {
        runStatus: 'fatal',
        exitReason: error instanceof Error ? error.message : String(error),
      },
    }),
  )
  process.exitCode = 1
} finally {
  await release()
}
