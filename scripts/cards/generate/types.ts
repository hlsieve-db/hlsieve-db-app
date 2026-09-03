import type { Card } from '../../../src/domain/cards/types'
import type { CardRestriction } from '../../../src/domain/decks/types'
import type { ChangedField, DiffCategory, DiffStatus } from '../diff/types'

export type GenerationIssue = {
  code:
    | 'INVALID_PUBLIC_CARD'
    | 'INVALID_GENERATED_AT'
    | 'INVALID_RESTRICTION'
    | 'DUPLICATE_PUBLICATION_CARD'
    | 'MISSING_PUBLICATION_SNAPSHOT'
    | 'INVALID_JSON_VALUE'
  message: string
  cardNumber?: string
  path?: string
}

export type GenerationResult<T> =
  | { ok: true; value: T; warnings: GenerationIssue[] }
  | { ok: false; errors: GenerationIssue[] }

export type PublicCardOptions = {
  nameReading?: string
}

export type CardsDataFileOptions = {
  generatedAt: string
}

export type RestrictionsDataFileOptions = {
  generatedAt: string
}

export type PublicationAction =
  'use_current' | 'keep_previous' | 'omit_new_failure'

export type ConflictSummary = {
  semanticConflictCount: number
  semanticConflictFields: string[]
  qaConflictCount: number
}

export type CardsGenerationReportEntry = {
  cardNumber: string
  status: DiffStatus
  changedCategories: DiffCategory[]
  changedFields: ChangedField[]
  contentHash?: string
  conflictSummary: ConflictSummary
  publicationAction: PublicationAction
}

export type CardsGenerationReport = {
  generatedAt: string
  counts: {
    total: number
    added: number
    changed: number
    unchanged: number
    failed: number
    disappearedCandidate: number
  }
  entries: CardsGenerationReportEntry[]
}

export type CardsVersionPayload = {
  format: 'holocard-cards'
  formatVersion: 1
  cards: Card[]
}

export type RestrictionsVersionPayload = {
  format: 'holocard-restrictions'
  formatVersion: 1
  restrictions: CardRestriction[]
}
