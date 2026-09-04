import type { MergedCardCandidate } from '../merge/types'
import { BUZZ_SEMANTIC_OVERRIDE_DATA } from './buzzOverrides'
import type {
  BuzzSemanticOverride,
  SemanticOverrideApplication,
  SemanticOverrideIssue,
  SemanticOverrideResult,
} from './types'

const ALLOWED_KEYS = new Set([
  'id',
  'cardNumber',
  'isBuzz',
  'reason',
  'sources',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseOverrides(
  data: unknown,
):
  | { ok: true; value: BuzzSemanticOverride[] }
  | { ok: false; errors: SemanticOverrideIssue[] } {
  if (!Array.isArray(data)) {
    return {
      ok: false,
      errors: [
        {
          code: 'INVALID_BUZZ_OVERRIDE',
          message: 'Buzz semantic override data must be an array.',
        },
      ],
    }
  }

  const parsed: BuzzSemanticOverride[] = []
  const errors: SemanticOverrideIssue[] = []
  for (const [index, value] of data.entries()) {
    if (!isRecord(value)) {
      errors.push({
        code: 'INVALID_BUZZ_OVERRIDE',
        message: `Buzz semantic override at index ${index} must be an object.`,
      })
      continue
    }
    const unknownKeys = Object.keys(value).filter(
      (key) => !ALLOWED_KEYS.has(key),
    )
    const id = value.id
    const cardNumber = value.cardNumber
    const reason = value.reason
    const sources = value.sources
    if (
      unknownKeys.length > 0 ||
      typeof id !== 'string' ||
      id.trim() === '' ||
      typeof cardNumber !== 'string' ||
      cardNumber.trim() === '' ||
      typeof value.isBuzz !== 'boolean' ||
      typeof reason !== 'string' ||
      reason.trim() === '' ||
      (sources !== undefined &&
        (!Array.isArray(sources) ||
          sources.some(
            (source) => typeof source !== 'string' || source.trim() === '',
          )))
    ) {
      errors.push({
        code: 'INVALID_BUZZ_OVERRIDE',
        message: `Buzz semantic override at index ${index} has an invalid shape${unknownKeys.length > 0 ? ` or unknown fields: ${unknownKeys.join(', ')}` : ''}.`,
        ...(typeof cardNumber === 'string' ? { cardNumber } : {}),
        ...(typeof id === 'string' ? { overrideId: id } : {}),
      })
      continue
    }
    parsed.push({
      id,
      cardNumber,
      isBuzz: value.isBuzz,
      reason,
      ...(sources !== undefined ? { sources: [...sources] as string[] } : {}),
    })
  }

  const seen = new Set<string>()
  for (const override of parsed) {
    if (seen.has(override.cardNumber)) {
      errors.push({
        code: 'DUPLICATE_BUZZ_OVERRIDE',
        message: `Multiple Buzz semantic overrides target ${override.cardNumber}.`,
        cardNumber: override.cardNumber,
        overrideId: override.id,
      })
    }
    seen.add(override.cardNumber)
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: parsed }
}

export function applySemanticOverrides(
  cards: readonly MergedCardCandidate[],
  data: unknown = BUZZ_SEMANTIC_OVERRIDE_DATA,
): SemanticOverrideResult {
  const validated = parseOverrides(data)
  if (!validated.ok) return validated

  const cardsByNumber = new Map(cards.map((card) => [card.cardNumber, card]))
  const overridesByNumber = new Map(
    validated.value.map((override) => [override.cardNumber, override]),
  )
  const warnings = validated.value.flatMap((override) =>
    cardsByNumber.has(override.cardNumber)
      ? []
      : [
          {
            code: 'BUZZ_OVERRIDE_TARGET_MISSING' as const,
            message: `Buzz semantic override target ${override.cardNumber} is absent from the logical dataset.`,
            cardNumber: override.cardNumber,
            overrideId: override.id,
          },
        ],
  )
  const applications: SemanticOverrideApplication[] = []
  const value = cards.map((card) => {
    const override = overridesByNumber.get(card.cardNumber)
    if (!override) return card
    applications.push({
      overrideId: override.id,
      cardNumber: card.cardNumber,
      field: 'isBuzz' as const,
      before: card.isBuzz,
      after: override.isBuzz,
      reason: override.reason,
    })
    return { ...card, isBuzz: override.isBuzz }
  })
  return {
    ok: true,
    value,
    applications,
    warnings,
    configured: validated.value.length,
  }
}
