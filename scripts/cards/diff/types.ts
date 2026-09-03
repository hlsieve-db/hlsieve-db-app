import type { SearchIndexedCardCandidate } from '../searchIndex/types'

export type DiffStatus =
  'added' | 'changed' | 'unchanged' | 'disappeared_candidate' | 'failed'

export type DiffCategory =
  'game_content' | 'qa' | 'printing' | 'metadata' | 'derived'

export const DIFF_CATEGORY_ORDER = [
  'game_content',
  'qa',
  'printing',
  'metadata',
  'derived',
] as const satisfies readonly DiffCategory[]

export type CardDiffSnapshot = {
  cardNumber: string
  contentHash: string
  card: SearchIndexedCardCandidate
}

export type CurrentCardFailure = {
  cardNumber: string
  stage:
    'fetch' | 'parse' | 'normalize' | 'merge' | 'derive' | 'hash' | 'unknown'
  message: string
}

export type CardCollectionDiffInput = {
  previous: CardDiffSnapshot[]
  current: CardDiffSnapshot[]
  failures: CurrentCardFailure[]
  discoveryComplete: boolean
}

export type ChangedField = {
  category: DiffCategory
  path: string
  before: unknown
  after: unknown
}

export type CardDiffEntry = {
  cardNumber: string
  status: DiffStatus
  beforeHash?: string
  afterHash?: string
  changedCategories: DiffCategory[]
  changedFields: ChangedField[]
  failure?: CurrentCardFailure
  before?: CardDiffSnapshot
  after?: CardDiffSnapshot
}

export type CardCollectionDiffReport = {
  entries: CardDiffEntry[]
}

export type DiffIssue = {
  code:
    | 'DUPLICATE_PREVIOUS_CARD'
    | 'DUPLICATE_CURRENT_CARD'
    | 'CURRENT_AND_FAILURE_CONFLICT'
    | 'CONTRADICTORY_FAILURES'
    | 'SNAPSHOT_CARD_NUMBER_MISMATCH'
    | 'DIFF_CARD_NUMBER_MISMATCH'
    | 'EMPTY_CARD_DIFF_INPUT'
    | 'UNCLASSIFIED_HASH_CHANGE'
  message: string
  cardNumber?: string
}

export type DiffResult<T> =
  | { ok: true; value: T; warnings: DiffIssue[] }
  | { ok: false; errors: DiffIssue[] }

export type CardSnapshotDiffInput = {
  previous?: CardDiffSnapshot
  current?: CardDiffSnapshot
  failure?: CurrentCardFailure
  discoveryComplete: boolean
}
