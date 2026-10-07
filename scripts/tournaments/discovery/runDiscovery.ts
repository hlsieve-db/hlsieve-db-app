import { chromium } from 'playwright'

import { createBushiNaviDiscoverySource } from './bushiNaviSource'
import { parseTournamentDiscoveryCli } from './cli'
import { createOverlapDates, runTournamentDiscovery } from './core'
import { TournamentDiscoveryObservationRepository } from './observationRepository'

async function main(): Promise<void> {
  const options = parseTournamentDiscoveryCli(process.argv.slice(2))
  const browser = await chromium.launch({ headless: false })
  try {
    const context = await browser.newContext()
    const page = await context.newPage()
    const result = await runTournamentDiscovery({
      source: createBushiNaviDiscoverySource(page, options.delayMs),
      seriesIds: options.seriesIds,
      dates: createOverlapDates(options.targetDate, options.overlapDays),
    })
    if (options.saveObservations) {
      await new TournamentDiscoveryObservationRepository().saveRun(result)
    }
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await browser.close()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
