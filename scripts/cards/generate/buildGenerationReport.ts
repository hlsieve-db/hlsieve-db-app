import { compareUnicodeCodePoints } from '../hash/stableStringify'
import type { SearchIndexedCardCandidate } from '../searchIndex/types'
import type { CardDiffEntry } from '../diff/types'
import type {
  CardsGenerationReport,
  CardsGenerationReportEntry,
  ConflictSummary,
  GenerationResult,
  PublicationAction,
} from './types'
import { isValidUtcIsoDateTime } from './validation'

function publicationAction(entry: CardDiffEntry): PublicationAction {
  if (
    entry.status === 'added' ||
    entry.status === 'changed' ||
    entry.status === 'unchanged'
  ) {
    return 'use_current'
  }
  if (entry.status === 'disappeared_candidate') return 'keep_previous'
  if (entry.before) return 'keep_previous'
  return 'omit_new_failure'
}

function publicationCandidate(
  entry: CardDiffEntry,
): SearchIndexedCardCandidate | undefined {
  return publicationAction(entry) === 'use_current'
    ? entry.after?.card
    : entry.before?.card
}

function conflictSummary(entry: CardDiffEntry): ConflictSummary {
  const conflicts = publicationCandidate(entry)?.conflicts ?? []
  const semantic = conflicts.filter(
    (conflict) => conflict.kind === 'semantic_conflict',
  )
  return {
    semanticConflictCount: semantic.length,
    semanticConflictFields: [
      ...new Set(semantic.map((conflict) => conflict.field)),
    ].sort(compareUnicodeCodePoints),
    qaConflictCount: conflicts.filter(
      (conflict) => conflict.kind === 'qa_conflict',
    ).length,
  }
}

function reportEntry(entry: CardDiffEntry): CardsGenerationReportEntry {
  const action = publicationAction(entry)
  const contentHash =
    action === 'use_current' ? entry.afterHash : entry.beforeHash
  return {
    cardNumber: entry.cardNumber,
    status: entry.status,
    changedCategories: [...entry.changedCategories],
    changedFields: entry.changedFields.map((field) => ({ ...field })),
    ...(contentHash !== undefined ? { contentHash } : {}),
    conflictSummary: conflictSummary(entry),
    publicationAction: action,
  }
}

export function buildGenerationReport(
  entries: readonly CardDiffEntry[],
  options: { generatedAt: string },
): GenerationResult<CardsGenerationReport> {
  if (!isValidUtcIsoDateTime(options.generatedAt)) {
    return {
      ok: false,
      errors: [
        {
          code: 'INVALID_GENERATED_AT',
          path: 'generatedAt',
          message: 'generatedAt must be a valid ISO 8601 UTC string.',
        },
      ],
    }
  }
  const sorted = [...entries].sort((left, right) =>
    compareUnicodeCodePoints(left.cardNumber, right.cardNumber),
  )
  return {
    ok: true,
    value: {
      generatedAt: options.generatedAt,
      counts: {
        total: sorted.length,
        added: sorted.filter((entry) => entry.status === 'added').length,
        changed: sorted.filter((entry) => entry.status === 'changed').length,
        unchanged: sorted.filter((entry) => entry.status === 'unchanged')
          .length,
        failed: sorted.filter((entry) => entry.status === 'failed').length,
        disappearedCandidate: sorted.filter(
          (entry) => entry.status === 'disappeared_candidate',
        ).length,
      },
      entries: sorted.map(reportEntry),
    },
    warnings: [],
  }
}
