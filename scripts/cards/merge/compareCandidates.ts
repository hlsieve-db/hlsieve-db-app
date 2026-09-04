import type { NormalizedCardCandidate } from '../normalize/types'
import { semanticEqual } from './semanticComparison'
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

export function compareSemanticFields(
  canonical: NormalizedCardCandidate,
  candidate: NormalizedCardCandidate,
): SemanticConflict[] {
  return SEMANTIC_FIELDS.flatMap((field) =>
    semanticEqual(canonical[field], candidate[field])
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
