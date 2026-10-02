import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { chromium } from 'playwright'

import type { CardsDataFile } from '../../../src/domain/cards/types'
import type { TournamentImportEvent } from '../../../src/domain/tournaments/types'
import { runTournamentImportPipeline } from '../importPipeline'
import { collectBushiNaviEvents } from './bushiNavi'
import {
  getOrCollectDeck,
  saveEventCache,
  type CollectorCacheOptions,
} from './cache'
import { parseCollectorCli } from './cli'
import { executeCollector } from './collector'
import { parseDeckLogHtml } from './deckLog'
import { delayBetweenPages } from './policy'
import { getTournamentSeriesConfig } from './seriesConfig'

async function main(): Promise<void> {
  const options = parseCollectorCli(process.argv.slice(2))
  const cardsData = JSON.parse(
    await readFile(resolve('public/cards.json'), 'utf8'),
  ) as CardsDataFile
  const cacheOptions: CollectorCacheOptions = { refresh: options.refresh }
  const browser = await chromium.launch({ headless: options.headless })
  try {
    const context = await browser.newContext()
    const page = await context.newPage()
    const collectedAt = new Date().toISOString()
    const result = await executeCollector({
      dryRun: options.dryRun,
      cardsData,
      now: () => collectedAt,
      collect: async () => {
        const events: TournamentImportEvent[] = []
        for (const seriesId of options.seriesIds) {
          const series = getTournamentSeriesConfig(seriesId)
          const collected = await collectBushiNaviEvents({
            page,
            series,
            range: { from: options.from, to: options.to },
            sourceEventId: options.sourceEventId,
            resultLimit: options.smoke ? 1 : undefined,
            allowSaturatedTarget: options.smoke,
            delayMs: options.delayMs,
            resolveDeck: async (deckCode, openPublicPage) =>
              getOrCollectDeck(
                deckCode,
                async () => {
                  const deckPage = await openPublicPage()
                  await delayBetweenPages(options.delayMs)
                  await deckPage
                    .locator('h3')
                    .filter({ hasText: '推しホロメン' })
                    .waitFor({ state: 'attached' })
                  return parseDeckLogHtml(await deckPage.content())
                },
                cardsData.cards,
                cacheOptions,
              ),
          })
          events.push(...collected)
        }
        for (const event of events) {
          await saveEventCache(
            {
              sourceEventId: event.identity.sourceEventId!,
              sourceUrl: event.source.sourceUrl!,
              collectedAt,
              deckLogCodes: event.results.flatMap((entry) =>
                entry.deckLogCode ? [entry.deckLogCode] : [],
              ),
            },
            cacheOptions,
          )
        }
        return events
      },
      publish: async (payload) => {
        const pipeline = await runTournamentImportPipeline(payload, cardsData)
        console.log(
          `Published ${pipeline.publishedEvents} Tournament Event(s); ${pipeline.pendingRecords} pending record(s).`,
        )
      },
    })
    console.log(
      `${options.dryRun ? 'Dry run' : 'Collector run'} complete: ${result.payload.events.length} collected, ${result.validEvents} valid, ${result.pendingRecords} pending.`,
    )
  } finally {
    await browser.close()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
