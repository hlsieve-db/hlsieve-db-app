import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { chromium } from 'playwright'

import type { CardsDataFile } from '../../../src/domain/cards/types'
import { collectKnownTournamentEvent } from '../collector/bushiNavi'
import {
  getOrCollectDeck,
  saveEventCache,
  type CollectorCacheOptions,
} from '../collector/cache'
import { parseDeckLogHtml, waitForDeckLogReady } from '../collector/deckLog'
import { delayBetweenPages } from '../collector/policy'
import { describeTournamentQueueAdd, parseTournamentQueueCli } from './cli'
import { processOneTournamentQueueItem } from './processor'
import {
  diagnoseTournamentQueueLock,
  forceUnlockTournamentQueue,
  LocalTournamentQueueRepository,
} from './repository'
import { parseTournamentSourceEventId } from './submission'

async function processQueue(
  repository: LocalTournamentQueueRepository,
  maxItems: number,
): Promise<void> {
  const cardsData = JSON.parse(
    await readFile(resolve('public/cards.json'), 'utf8'),
  ) as CardsDataFile
  const cacheOptions: CollectorCacheOptions = {}
  const browser = await chromium.launch({ headless: false })
  try {
    const context = await browser.newContext()
    const page = await context.newPage()
    for (let index = 0; index < maxItems; index += 1) {
      const now = new Date().toISOString()
      const result = await processOneTournamentQueueItem({
        repository,
        cardsData,
        now,
        leaseDurationMs: 15 * 60 * 1_000,
        collect: async (sourceEventId) => {
          const event = await collectKnownTournamentEvent({
            page,
            sourceEventId,
            resolveDeck: async (deckCode, openPublicPage) =>
              getOrCollectDeck(
                deckCode,
                async () => {
                  const deckPage = await openPublicPage()
                  await delayBetweenPages()
                  await waitForDeckLogReady(deckPage)
                  return parseDeckLogHtml(await deckPage.content())
                },
                cardsData.cards,
                cacheOptions,
              ),
          })
          await saveEventCache(
            {
              sourceEventId,
              sourceUrl: event.source.sourceUrl!,
              collectedAt: now,
              deckLogCodes: event.results.flatMap((entry) =>
                entry.deckLogCode ? [entry.deckLogCode] : [],
              ),
            },
            cacheOptions,
          )
          return event
        },
      })
      console.log(JSON.stringify(result))
      if (result.status === 'idle') break
    }
  } finally {
    await browser.close()
  }
}

async function main(): Promise<void> {
  const options = parseTournamentQueueCli(process.argv.slice(2))
  const repository = new LocalTournamentQueueRepository()
  if (options.command === 'add') {
    const before = await repository.load()
    const sourceEventId = parseTournamentSourceEventId(options.input)
    const previous = before.records.find(
      (candidate) => candidate.sourceEventId === sourceEventId,
    )
    const record = await repository.enqueue(
      options.input,
      new Date().toISOString(),
    )
    console.log(
      `${record.sourceEventId}\t${record.status}\t${describeTournamentQueueAdd(
        previous?.status,
        record.status,
      )}`,
    )
    return
  }
  if (options.command === 'list') {
    for (const record of (await repository.load()).records) {
      console.log(
        [
          record.sourceEventId,
          record.status,
          record.attemptCount,
          record.nextAttemptAt ?? '-',
          record.lastErrorCode ?? '-',
        ].join('\t'),
      )
    }
    return
  }
  if (options.command === 'unlock') {
    const diagnosis = await diagnoseTournamentQueueLock(repository.path)
    console.log(JSON.stringify(diagnosis, null, 2))
    if (options.force) {
      await forceUnlockTournamentQueue(repository.path, { force: true })
      console.log(
        'Tournament queue lock removed after explicit --force review.',
      )
    } else if (diagnosis.state !== 'absent') {
      throw new Error('Review the lock diagnosis, then rerun with --force.')
    }
    return
  }
  await processQueue(repository, options.maxItems)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
