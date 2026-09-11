import type { EffectTag } from '../../../src/domain/cards/types'

export type UpdatePreparationHealth = {
  discoveryComplete: boolean
  discoveryRetries: number
  expectedPageCoverageComplete: boolean
  discoveredPrintings: number
  invalidOfficialIds: number
  duplicateOfficialIds: number
  detailExpected: number
  detailSucceeded: number
  detailFailed: number
  detailRetries: number
}

export type UpdateAuditInput = {
  baselineCardsText: string
  baselinePrintingsText: string
  candidateCardsText: string
  candidatePrintingsText: string
  candidateSitemap: string
  health: UpdatePreparationHealth
  generatedAt: string
}

export type UpdateChangedField = {
  field: string
  before: unknown
  after: unknown
}

export type UpdateChangedCard = {
  cardNumber: string
  fields: UpdateChangedField[]
}

export type UpdateAuditMessage = {
  code: string
  message: string
}

export type UpdateAuditReport = {
  version: 1
  generatedAt: string
  status: 'safe' | 'review_required' | 'blocked'
  exitCode: 0 | 2 | 3
  summary: {
    logicalCards: { old: number; next: number; delta: number }
    printingGroups: { old: number; next: number; delta: number }
    printings: { old: number; next: number; delta: number }
    parallelPrintings: { old: number; next: number; delta: number }
    nonParallelPrintings: { old: number; next: number; delta: number }
  }
  versions: {
    oldCardsDataVersion: string
    newCardsDataVersion: string
    oldPrintingsDataVersion: string
    newPrintingsDataVersion: string
    cardsDataVersionLinkage: boolean
    files: {
      baselineCardsSha256: string
      baselinePrintingsSha256: string
      candidateCardsSha256: string
      candidatePrintingsSha256: string
    }
  }
  discovery: UpdatePreparationHealth
  cards: {
    added: string[]
    removed: string[]
    changed: UpdateChangedCard[]
    unchanged: number
    semanticDeltaByField: Record<string, number>
  }
  printings: {
    addedOfficialIds: string[]
    removedOfficialIds: string[]
    changedOfficialIds: string[]
    productAssociations: { old: number; next: number; delta: number }
  }
  effectTags: Record<EffectTag, { old: number; next: number; delta: number }>
  buzz: {
    confirmedOverrides: Record<
      'hBP07-019' | 'hBP07-048' | 'hBP07-076',
      boolean | undefined
    >
  }
  chronology: {
    products: number
    newProducts: string[]
    missingProductReleaseDates: string[]
    multipleNonParallelCards: number
    ambiguousCards: string[]
    fallbackCount: number
  }
  images: {
    present: number
    missing: string[]
    unique: number
    duplicateUrls: string[]
    hostDistribution: Record<string, number>
    unexpectedHosts: string[]
  }
  seo: {
    expectedSitemapUrls: number
    actualSitemapUrls: number
    sitemapMatches: boolean
  }
  restrictions: {
    effectiveFrom: string
    cardNumbers: string[]
    sourceReviewReminder: string
  }
  warnings: UpdateAuditMessage[]
  blocks: UpdateAuditMessage[]
}

export type PreparedUpdateMetadata = {
  version: 1
  generatedAt: string
  health: UpdatePreparationHealth
  cardsDataVersion: string
  printingsDataVersion: string
}
