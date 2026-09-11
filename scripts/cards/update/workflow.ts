import { readFile } from 'node:fs/promises'

import { SITE_ORIGIN } from '../../../src/domain/site/constants'
import { buildSitemap } from '../../seo/buildSitemap'
import type { DiscoveryResult } from '../discovery/types'
import { auditProductionUpdate } from './auditProductionUpdate'
import { UPDATE_PATHS } from './paths'
import type {
  PreparedUpdateMetadata,
  UpdateAuditInput,
  UpdateAuditReport,
  UpdatePreparationHealth,
} from './types'

export function buildRobots(): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`
}

export function hasCompletePageCoverage(discovery: DiscoveryResult): boolean {
  return (['all', 'parallel_only', 'non_parallel'] as const).every((mode) => {
    const page = discovery.pages[mode]
    if (!page?.isComplete || !page.pagination) return false
    const expected = Array.from(
      { length: page.pagination.maxPage },
      (_, index) => index + 1,
    )
    return (
      page.pagination.currentPage === 1 &&
      page.pagination.fetchedPages.length === expected.length &&
      page.pagination.fetchedPages.every(
        (value, index) => value === expected[index],
      )
    )
  })
}

export function preparationHealth(
  discovery: DiscoveryResult,
  details: {
    total: number
    succeeded: number
    failed: number
    retryCount: number
  },
): UpdatePreparationHealth {
  const ids = discovery.cards.map((card) => card.officialId)
  return {
    discoveryComplete: discovery.isComplete,
    discoveryRetries: discovery.retryCount,
    expectedPageCoverageComplete: hasCompletePageCoverage(discovery),
    discoveredPrintings: discovery.cards.length,
    invalidOfficialIds: ids.filter((id) => !/^\d+$/.test(id)).length,
    duplicateOfficialIds: ids.length - new Set(ids).size,
    detailExpected: details.total,
    detailSucceeded: details.succeeded,
    detailFailed: details.failed,
    detailRetries: details.retryCount,
  }
}

export function isPreparationComplete(
  health: UpdatePreparationHealth,
): boolean {
  return (
    health.discoveryComplete &&
    health.discoveryRetries === 0 &&
    health.expectedPageCoverageComplete &&
    health.invalidOfficialIds === 0 &&
    health.duplicateOfficialIds === 0 &&
    health.detailFailed === 0 &&
    health.detailRetries === 0 &&
    health.detailExpected === health.discoveredPrintings &&
    health.detailSucceeded === health.detailExpected
  )
}

export async function readPreparedAuditInput(): Promise<UpdateAuditInput> {
  const [
    baselineCardsText,
    baselinePrintingsText,
    candidateCardsText,
    candidatePrintingsText,
    candidateSitemap,
    metadataText,
  ] = await Promise.all([
    readFile(UPDATE_PATHS.baselineCards, 'utf8'),
    readFile(UPDATE_PATHS.baselinePrintings, 'utf8'),
    readFile(UPDATE_PATHS.candidateCards, 'utf8'),
    readFile(UPDATE_PATHS.candidatePrintings, 'utf8'),
    readFile(UPDATE_PATHS.candidateSitemap, 'utf8'),
    readFile(UPDATE_PATHS.candidateMetadata, 'utf8'),
  ])
  const metadata = JSON.parse(metadataText) as PreparedUpdateMetadata
  if (metadata.version !== 1)
    throw new Error('Unsupported prepare metadata version.')
  return {
    baselineCardsText,
    baselinePrintingsText,
    candidateCardsText,
    candidatePrintingsText,
    candidateSitemap,
    health: metadata.health,
    generatedAt: metadata.generatedAt,
  }
}

export async function auditPreparedUpdate(): Promise<UpdateAuditReport> {
  return auditProductionUpdate(await readPreparedAuditInput())
}

export function sitemapForCardNumbers(cardNumbers: readonly string[]): string {
  return buildSitemap(cardNumbers)
}
