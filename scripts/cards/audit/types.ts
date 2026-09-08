import type {
  CardPrintingsDataFile,
  CardsDataFile,
} from '../../../src/domain/cards/types'
import type {
  CardRestriction,
  RestrictionsDataFile,
} from '../../../src/domain/decks/types'
import type { CardDiffSnapshot } from '../diff/types'
import type { DiscoveryResult } from '../discovery/types'
import type { FetchedCardDetail } from '../detailFetch/types'
import type { CardsGenerationReport } from '../generate/types'
import type { SearchIndexedCardCandidate } from '../searchIndex/types'
import type { SemanticOverrideApplication } from '../overrides/types'

export type CardPipelineAuditSeverity = 'warning' | 'fatal'

export type CardPipelineAuditIssue = {
  severity: CardPipelineAuditSeverity
  stage:
    | 'input'
    | 'parse'
    | 'normalize'
    | 'enrichment'
    | 'merge'
    | 'override'
    | 'derive'
    | 'hash'
    | 'diff'
    | 'generation'
    | 'serialization'
    | 'audit'
  code: string
  message: string
  officialId?: string
  cardNumber?: string
  path?: string
}

export type CardPipelineAuditReport = {
  input: {
    discoveredCards: number
    specialEntries: number
    detailResults: number
  }
  processing: {
    parsed: number
    normalized: number
    enriched: number
    logicalCards: number
    printings: number
    snapshots: number
  }
  variants: {
    parallelPrintings: number
    nonParallelPrintings: number
    cardsWithMultiplePrintings: number
    cardsWithNormalAndParallel: number
    normalOnlyCards: number
    parallelOnlyCards: number
  }
  conflicts: {
    logicalCards: number
    total: number
    semantic: number
    qa: number
    byKind: Record<string, number>
    byField: Record<string, number>
    samples: CardPipelineAuditIssue[]
  }
  representativeImages: {
    fromParallelPrinting: number
    fromNonParallelPrinting: number
    missing: number
    ambiguousSource: number
    normalAndParallelFromNonParallel: number
    normalAndParallelFromParallel: number
    parallelOnlyFromParallel: number
    normalOnlyFromNonParallel: number
    normalImageAvailableButParallel: number
  }
  canonicalPrintings: {
    parallel: number
    nonParallel: number
    missing: number
  }
  qas: {
    cardsWithQa: number
    cardsWithoutQa: number
    beforeMerge: number
    afterMerge: number
    conflicts: number
  }
  semanticOverrides: {
    configured: number
    applied: number
    missingTargets: number
    applications: SemanticOverrideApplication[]
    dataVersionBefore?: string
    dataVersionAfter?: string
  }
  diff?: {
    added: number
    changed: number
    unchanged: number
    failed: number
    disappearedCandidate: number
  }
  issues: CardPipelineAuditIssue[]
  output?: {
    publicCards: number
    cardsDataVersion: string
    restrictions: number
    restrictionsDataVersion: string
    cardsSerializedBytes: number
    restrictionsSerializedBytes: number
  }
  isPublishable: boolean
}

export type CardPipelineDryRunInput = {
  discovery: DiscoveryResult
  details: readonly FetchedCardDetail[]
  previousSnapshots?: readonly CardDiffSnapshot[]
  restrictions: readonly CardRestriction[]
  generatedAt: string
}

export type CardPipelineDryRunArtifacts = {
  candidates: SearchIndexedCardCandidate[]
  snapshots: CardDiffSnapshot[]
  cardsDataFile: CardsDataFile
  cardPrintingsDataFile: CardPrintingsDataFile
  restrictionsDataFile: RestrictionsDataFile
  generationReport: CardsGenerationReport
  serializedCards: string
  serializedCardPrintings: string
  serializedRestrictions: string
}

export type CardPipelineDryRunResult = {
  report: CardPipelineAuditReport
  artifacts?: CardPipelineDryRunArtifacts
}
