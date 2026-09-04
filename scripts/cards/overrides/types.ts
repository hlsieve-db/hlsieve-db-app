import type { MergedCardCandidate } from '../merge/types'

export type BuzzSemanticOverride = {
  id: string
  cardNumber: string
  isBuzz: boolean
  reason: string
  sources?: string[]
}

export type SemanticOverrideApplication = {
  overrideId: string
  cardNumber: string
  field: 'isBuzz'
  before: boolean
  after: boolean
  reason: string
}

export type SemanticOverrideIssue = {
  code:
    | 'INVALID_BUZZ_OVERRIDE'
    | 'DUPLICATE_BUZZ_OVERRIDE'
    | 'BUZZ_OVERRIDE_TARGET_MISSING'
  message: string
  cardNumber?: string
  overrideId?: string
}

export type SemanticOverrideResult =
  | {
      ok: true
      value: MergedCardCandidate[]
      applications: SemanticOverrideApplication[]
      warnings: SemanticOverrideIssue[]
      configured: number
    }
  | { ok: false; errors: SemanticOverrideIssue[] }
