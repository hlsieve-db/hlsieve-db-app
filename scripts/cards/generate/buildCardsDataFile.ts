import type { Card, CardsDataFile } from '../../../src/domain/cards/types'
import { compareUnicodeCodePoints } from '../hash/stableStringify'
import { buildDataVersion } from './buildDataVersion'
import type {
  CardsDataFileOptions,
  CardsVersionPayload,
  GenerationIssue,
  GenerationResult,
} from './types'
import { isValidUtcIsoDateTime, validatePublicCard } from './validation'

export function buildCardsDataFile(
  cards: readonly Card[],
  options: CardsDataFileOptions,
): GenerationResult<CardsDataFile> {
  const errors: GenerationIssue[] = []
  if (!isValidUtcIsoDateTime(options.generatedAt)) {
    errors.push({
      code: 'INVALID_GENERATED_AT',
      path: 'generatedAt',
      message: 'generatedAt must be a valid ISO 8601 UTC string.',
    })
  }
  const sortedCards = [...cards].sort((left, right) =>
    compareUnicodeCodePoints(left.cardNumber, right.cardNumber),
  )
  const seen = new Set<string>()
  for (const card of sortedCards) {
    errors.push(...validatePublicCard(card))
    if (seen.has(card.cardNumber)) {
      errors.push({
        code: 'DUPLICATE_PUBLICATION_CARD',
        cardNumber: card.cardNumber,
        message: `Cards data contains duplicate cardNumber ${card.cardNumber}.`,
      })
    }
    seen.add(card.cardNumber)
  }
  if (errors.length > 0) return { ok: false, errors }

  const versionPayload: CardsVersionPayload = {
    format: 'holocard-cards',
    formatVersion: 1,
    cards: sortedCards,
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
      cards: versionPayload.cards,
    },
    warnings: [],
  }
}
