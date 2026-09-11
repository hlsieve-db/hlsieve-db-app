import { readFile } from 'node:fs/promises'

import type {
  CardPrintingsDataFile,
  CardsDataFile,
} from '../../../src/domain/cards/types'
import { buildSitemap } from '../../seo/buildSitemap'
import { auditProductionUpdate } from './auditProductionUpdate'
import { UPDATE_PATHS } from './paths'
import { buildRobots } from './workflow'

try {
  const [cardsText, printingsText, sitemap, robots] = await Promise.all([
    readFile(UPDATE_PATHS.baselineCards, 'utf8'),
    readFile(UPDATE_PATHS.baselinePrintings, 'utf8'),
    readFile(UPDATE_PATHS.publicSitemap, 'utf8'),
    readFile(UPDATE_PATHS.publicRobots, 'utf8'),
  ])
  const cards = JSON.parse(cardsText) as CardsDataFile
  const printings = JSON.parse(printingsText) as CardPrintingsDataFile
  const printingCount = Object.values(printings.cards).reduce(
    (total, group) => total + group.printings.length,
    0,
  )
  const report = auditProductionUpdate({
    baselineCardsText: cardsText,
    baselinePrintingsText: printingsText,
    candidateCardsText: cardsText,
    candidatePrintingsText: printingsText,
    candidateSitemap: sitemap,
    health: {
      discoveryComplete: true,
      discoveryRetries: 0,
      expectedPageCoverageComplete: true,
      discoveredPrintings: printingCount,
      invalidOfficialIds: 0,
      duplicateOfficialIds: 0,
      detailExpected: printingCount,
      detailSucceeded: printingCount,
      detailFailed: 0,
      detailRetries: 0,
    },
    generatedAt: new Date().toISOString(),
  })
  if (
    sitemap !== buildSitemap(cards.cards.map((card) => card.cardNumber)) ||
    robots !== buildRobots()
  ) {
    throw new Error('SEO source assets do not match the current Card snapshot.')
  }
  console.log(JSON.stringify(report, null, 2))
  process.exitCode = report.exitCode
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
