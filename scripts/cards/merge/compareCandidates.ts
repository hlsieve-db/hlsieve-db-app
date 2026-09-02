import type { NormalizedCardCandidate } from '../normalize/types'
import type { SemanticConflict } from './types'

const SEMANTIC_FIELDS = [
  'name',
  'cardType',
  'isBuzz',
  'colors',
  'bloomLevel',
  'debutType',
  'hp',
  'life',
  'supportType',
  'isLimited',
  'supportSearchCategory',
  'batonPass',
  'abilities',
  'arts',
  'extraText',
  'deckLimit',
] as const satisfies readonly (keyof NormalizedCardCandidate)[]

export function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => deepEqual(value, right[index]))
    )
  }
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object'
  ) {
    return false
  }

  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
    .filter((key) => leftRecord[key] !== undefined)
    .sort()
  const rightKeys = Object.keys(rightRecord)
    .filter((key) => rightRecord[key] !== undefined)
    .sort()

  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        deepEqual(leftRecord[key], rightRecord[key]),
    )
  )
}

export function compareSemanticFields(
  canonical: NormalizedCardCandidate,
  candidate: NormalizedCardCandidate,
): SemanticConflict[] {
  return SEMANTIC_FIELDS.flatMap((field) =>
    deepEqual(canonical[field], candidate[field])
      ? []
      : [
          {
            kind: 'semantic_conflict' as const,
            cardNumber: canonical.cardNumber,
            field,
            canonicalOfficialId: canonical.officialId,
            conflictingOfficialId: candidate.officialId,
            canonicalValue: canonical[field],
            conflictingValue: candidate[field],
          },
        ],
  )
}
