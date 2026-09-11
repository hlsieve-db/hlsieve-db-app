import { mkdir, rm, writeFile } from 'node:fs/promises'

import { CURRENT_DECK_RESTRICTIONS } from '../../../src/domain/decks/restrictions'
import { buildSitemap } from '../../seo/buildSitemap'
import { runCardPipelineDryRun } from '../audit/runCardPipelineDryRun'
import { fetchCardDetails } from '../detailFetch/fetchCardDetails'
import { discoverCardEntries } from '../discovery/discoverCardEntries'
import { createHtmlFetcher } from '../discovery/fetchHtml'
import { UPDATE_PATHS } from './paths'
import type { PreparedUpdateMetadata } from './types'
import {
  buildRobots,
  isPreparationComplete,
  preparationHealth,
} from './workflow'

const OFFICIAL_FORM_URL = 'https://hololive-official-cardgame.com/cardlist/'

await rm(UPDATE_PATHS.candidateDirectory, { recursive: true, force: true })
const generatedAt = new Date().toISOString()
const fetchHtml = createHtmlFetcher({ minIntervalMs: 750 })
const discovery = await discoverCardEntries({
  formUrl: OFFICIAL_FORM_URL,
  fetchHtml,
  stats: fetchHtml.stats,
})
const details = await fetchCardDetails(discovery, {
  cacheDirectory: UPDATE_PATHS.detailsCache,
  minIntervalMs: 750,
  onProgress: (progress) => {
    const completed = progress.succeeded + progress.failed
    if (completed === progress.total || completed % 25 === 0) {
      console.error(`details ${completed}/${progress.total}`)
    }
  },
})
const health = preparationHealth(discovery, details)
const pipeline = runCardPipelineDryRun({
  discovery,
  details: details.results,
  restrictions: CURRENT_DECK_RESTRICTIONS,
  generatedAt,
})

if (
  !isPreparationComplete(health) ||
  !pipeline.report.isPublishable ||
  !pipeline.artifacts
) {
  console.error(
    JSON.stringify(
      { status: 'PUBLISH_BLOCKED', health, audit: pipeline.report },
      null,
      2,
    ),
  )
  process.exitCode = 3
} else {
  const metadata: PreparedUpdateMetadata = {
    version: 1,
    generatedAt,
    health,
    cardsDataVersion: pipeline.artifacts.cardsDataFile.dataVersion,
    printingsDataVersion: pipeline.artifacts.cardPrintingsDataFile.dataVersion,
  }
  await mkdir(UPDATE_PATHS.candidateDirectory, { recursive: true })
  await Promise.all([
    writeFile(
      UPDATE_PATHS.candidateCards,
      pipeline.artifacts.serializedCards,
      'utf8',
    ),
    writeFile(
      UPDATE_PATHS.candidatePrintings,
      pipeline.artifacts.serializedCardPrintings,
      'utf8',
    ),
    writeFile(
      UPDATE_PATHS.candidateSitemap,
      buildSitemap(
        pipeline.artifacts.cardsDataFile.cards.map((card) => card.cardNumber),
      ),
      'utf8',
    ),
    writeFile(UPDATE_PATHS.candidateRobots, buildRobots(), 'utf8'),
    writeFile(
      UPDATE_PATHS.candidateMetadata,
      `${JSON.stringify(metadata, null, 2)}\n`,
      'utf8',
    ),
  ])
  console.log(JSON.stringify({ status: 'PREPARED', metadata }, null, 2))
}
