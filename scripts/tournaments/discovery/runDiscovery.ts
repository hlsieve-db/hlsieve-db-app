import { chromium } from 'playwright'

import { TOURNAMENT_DATA_START_DATE } from '../../../src/domain/tournaments/constants'
import { LocalTournamentQueueRepository } from '../queue/repository'
import { createBushiNaviDiscoverySource } from './bushiNaviSource'
import { parseTournamentDiscoveryCli } from './cli'
import {
  createInclusiveDateRange,
  createOverlapDates,
  runTournamentDiscovery,
} from './core'
import { TournamentDiscoveryObservationRepository } from './observationRepository'
import {
  createTournamentReconciliationPreview,
  runTournamentReconciliation,
} from './reconciliation'

async function main(): Promise<void> {
  const options = parseTournamentDiscoveryCli(process.argv.slice(2))
  const browser = await chromium.launch({ headless: false })
  try {
    const context = await browser.newContext()
    const page = await context.newPage()
    const source = createBushiNaviDiscoverySource(page, options.delayMs)
    const observations = new TournamentDiscoveryObservationRepository()
    if (options.mode === 'reconciliation') {
      if (options.from < TOURNAMENT_DATA_START_DATE) {
        throw new Error(
          `Reconciliation starts before ${TOURNAMENT_DATA_START_DATE}.`,
        )
      }
      const discovery = await runTournamentReconciliation({
        source,
        seriesIds: options.seriesIds,
        dates: createInclusiveDateRange(options.from, options.to),
        chunkDays: options.chunkDays,
        saveRun: options.saveObservations
          ? (run) => observations.saveRun(run)
          : undefined,
      })
      const queue = await new LocalTournamentQueueRepository().load()
      console.log(
        JSON.stringify(
          createTournamentReconciliationPreview(discovery, queue),
          null,
          2,
        ),
      )
      return
    }
    const result = await runTournamentDiscovery({
      source,
      seriesIds: options.seriesIds,
      dates: createOverlapDates(options.targetDate, options.overlapDays),
    })
    if (options.saveObservations) await observations.saveRun(result)
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await browser.close()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
