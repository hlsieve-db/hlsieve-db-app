import type {
  CardRestriction,
  RestrictionsDataFile,
} from '../../../src/domain/decks/types'
import { compareUnicodeCodePoints } from '../hash/stableStringify'
import { buildDataVersion } from './buildDataVersion'
import type {
  GenerationIssue,
  GenerationResult,
  RestrictionsDataFileOptions,
  RestrictionsVersionPayload,
} from './types'
import { isValidUtcIsoDateTime, validateRestriction } from './validation'

function compareRestrictions(
  left: CardRestriction,
  right: CardRestriction,
): number {
  const leftTuple = [
    left.cardNumber,
    left.effectiveFrom ?? '',
    left.effectiveTo ?? '',
  ]
  const rightTuple = [
    right.cardNumber,
    right.effectiveFrom ?? '',
    right.effectiveTo ?? '',
  ]
  for (let index = 0; index < leftTuple.length; index += 1) {
    const compared = compareUnicodeCodePoints(
      leftTuple[index] ?? '',
      rightTuple[index] ?? '',
    )
    if (compared !== 0) return compared
  }
  if (left.maxCopies !== right.maxCopies)
    return left.maxCopies - right.maxCopies
  return compareUnicodeCodePoints(left.note ?? '', right.note ?? '')
}

export function buildRestrictionsDataFile(
  restrictions: readonly CardRestriction[],
  options: RestrictionsDataFileOptions,
): GenerationResult<RestrictionsDataFile> {
  const errors: GenerationIssue[] = []
  if (!isValidUtcIsoDateTime(options.generatedAt)) {
    errors.push({
      code: 'INVALID_GENERATED_AT',
      path: 'generatedAt',
      message: 'generatedAt must be a valid ISO 8601 UTC string.',
    })
  }
  restrictions.forEach((restriction, index) =>
    errors.push(...validateRestriction(restriction, index)),
  )
  if (errors.length > 0) return { ok: false, errors }

  const sortedRestrictions = [...restrictions].sort(compareRestrictions)
  const versionPayload: RestrictionsVersionPayload = {
    format: 'holocard-restrictions',
    formatVersion: 1,
    restrictions: sortedRestrictions,
  }
  let dataVersion: string
  try {
    dataVersion = buildDataVersion(versionPayload)
  } catch (error) {
    return {
      ok: false,
      errors: [
        {
          code: 'INVALID_JSON_VALUE',
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    }
  }
  return {
    ok: true,
    value: {
      format: versionPayload.format,
      formatVersion: versionPayload.formatVersion,
      dataVersion,
      generatedAt: options.generatedAt,
      restrictions: versionPayload.restrictions,
    },
    warnings: [],
  }
}
