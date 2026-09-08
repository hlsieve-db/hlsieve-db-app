import type {
  CardPrintingsDataFile,
  CardsDataFile,
} from '../../../src/domain/cards/types'
import {
  assertCardPrintingsCompatibility,
  isCardPrintingsDataFile,
} from '../../../src/domain/cards/cardPrintingsValidation'
import { buildDataVersion } from '../generate/buildDataVersion'
import { serializeDataFile } from '../generate/serializeDataFile'

export type CardPrintingsSnapshotValidation =
  | { ok: true; value: CardPrintingsDataFile; serialized: string }
  | { ok: false; errors: string[] }

export function validateCardPrintingsSnapshotText(
  serialized: string,
  cardsDataFile?: CardsDataFile,
): CardPrintingsSnapshotValidation {
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : String(error)],
    }
  }
  if (!isCardPrintingsDataFile(parsed)) {
    return { ok: false, errors: ['Invalid card printings data file.'] }
  }
  const calculatedVersion = buildDataVersion({
    format: parsed.format,
    formatVersion: parsed.formatVersion,
    cards: parsed.cards,
  })
  if (calculatedVersion !== parsed.dataVersion) {
    return {
      ok: false,
      errors: ['dataVersion does not match card printing content.'],
    }
  }
  if (cardsDataFile) {
    try {
      assertCardPrintingsCompatibility(cardsDataFile.dataVersion, parsed)
    } catch (error) {
      return {
        ok: false,
        errors: [error instanceof Error ? error.message : String(error)],
      }
    }
    const expected = new Set(cardsDataFile.cards.map((card) => card.cardNumber))
    const actual = new Set(Object.keys(parsed.cards))
    if (
      expected.size !== actual.size ||
      [...expected].some((cardNumber) => !actual.has(cardNumber))
    ) {
      return {
        ok: false,
        errors: ['Logical card and printing group sets do not match.'],
      }
    }
  }
  const canonical = serializeDataFile(parsed)
  if (!canonical.ok) {
    return { ok: false, errors: canonical.errors.map((error) => error.message) }
  }
  if (canonical.value !== serialized) {
    return {
      ok: false,
      errors: ['Card printings snapshot is not canonical JSON.'],
    }
  }
  return { ok: true, value: parsed, serialized: canonical.value }
}
