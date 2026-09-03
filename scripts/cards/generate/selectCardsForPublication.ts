import { compareUnicodeCodePoints } from '../hash/stableStringify'
import type { SearchIndexedCardCandidate } from '../searchIndex/types'
import type { CardDiffEntry } from '../diff/types'
import type { GenerationIssue, GenerationResult } from './types'

export function selectCardsForPublication(
  entries: readonly CardDiffEntry[],
): GenerationResult<SearchIndexedCardCandidate[]> {
  const selected: SearchIndexedCardCandidate[] = []
  const errors: GenerationIssue[] = []

  for (const entry of entries) {
    const snapshot =
      entry.status === 'added' ||
      entry.status === 'changed' ||
      entry.status === 'unchanged'
        ? entry.after
        : entry.before
    if (snapshot) {
      selected.push(snapshot.card)
    } else if (entry.status !== 'failed') {
      errors.push({
        code: 'MISSING_PUBLICATION_SNAPSHOT',
        cardNumber: entry.cardNumber,
        message: `${entry.status} entry has no required publication snapshot.`,
      })
    }
  }

  const seen = new Set<string>()
  for (const candidate of selected) {
    if (seen.has(candidate.cardNumber)) {
      errors.push({
        code: 'DUPLICATE_PUBLICATION_CARD',
        cardNumber: candidate.cardNumber,
        message: `Publication selection contains duplicate cardNumber ${candidate.cardNumber}.`,
      })
    }
    seen.add(candidate.cardNumber)
  }
  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: selected.sort((left, right) =>
      compareUnicodeCodePoints(left.cardNumber, right.cardNumber),
    ),
    warnings: [],
  }
}
