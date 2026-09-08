import type {
  CardPrintingPublic,
  CardPrintingsDataFile,
  CardsDataFile,
} from '../../../src/domain/cards/types'
import { compareUnicodeCodePoints } from '../hash/stableStringify'
import type { SearchIndexedCardCandidate } from '../searchIndex/types'
import { buildDataVersion } from './buildDataVersion'

export type CardPrintingsGenerationIssue = {
  code: string
  message: string
  cardNumber?: string
  path?: string
}

export type CardPrintingsGenerationResult =
  | {
      ok: true
      value: CardPrintingsDataFile
      warnings: CardPrintingsGenerationIssue[]
    }
  | { ok: false; errors: CardPrintingsGenerationIssue[] }

const OFFICIAL_ID_PATTERN = /^\d+$/

function compareOfficialIds(left: string, right: string): number {
  const leftValue = BigInt(left)
  const rightValue = BigInt(right)
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareUnicodeCodePoints)
}

function toPublicPrinting(
  printing: SearchIndexedCardCandidate['printings'][number],
): CardPrintingPublic {
  return {
    officialId: printing.officialId,
    officialUrl: printing.officialUrl,
    isParallel: printing.isParallel,
    ...(printing.imageUrl !== undefined ? { imageUrl: printing.imageUrl } : {}),
    ...(printing.rarity !== undefined ? { rarity: printing.rarity } : {}),
    products: uniqueSorted(printing.products.map((product) => product.name)),
    ...(printing.illustrator !== undefined
      ? { illustrator: printing.illustrator }
      : {}),
  }
}

function orderPrintings(
  printings: readonly CardPrintingPublic[],
  defaultOfficialId: string,
): CardPrintingPublic[] {
  const defaultPrinting = printings.find(
    (printing) => printing.officialId === defaultOfficialId,
  )!
  const remaining = printings.filter(
    (printing) => printing.officialId !== defaultOfficialId,
  )
  return [
    defaultPrinting,
    ...remaining
      .filter((printing) => !printing.isParallel)
      .sort((left, right) =>
        compareOfficialIds(left.officialId, right.officialId),
      ),
    ...remaining
      .filter((printing) => printing.isParallel)
      .sort((left, right) =>
        compareOfficialIds(left.officialId, right.officialId),
      ),
  ]
}

export function buildCardPrintingsDataFile(
  candidates: readonly SearchIndexedCardCandidate[],
  cardsDataFile: CardsDataFile,
): CardPrintingsGenerationResult {
  const errors: CardPrintingsGenerationIssue[] = []
  const candidatesByNumber = new Map<string, SearchIndexedCardCandidate>()
  for (const candidate of candidates) {
    if (candidatesByNumber.has(candidate.cardNumber)) {
      errors.push({
        code: 'DUPLICATE_LOGICAL_CARD',
        cardNumber: candidate.cardNumber,
        message: `Duplicate logical card ${candidate.cardNumber}.`,
      })
    }
    candidatesByNumber.set(candidate.cardNumber, candidate)
  }

  const logicalNumbers = new Set(
    cardsDataFile.cards.map((card) => card.cardNumber),
  )
  for (const cardNumber of logicalNumbers) {
    if (!candidatesByNumber.has(cardNumber)) {
      errors.push({
        code: 'PRINTING_GROUP_MISSING',
        cardNumber,
        message: `Printing group is missing for ${cardNumber}.`,
      })
    }
  }
  for (const cardNumber of candidatesByNumber.keys()) {
    if (!logicalNumbers.has(cardNumber)) {
      errors.push({
        code: 'PRINTING_GROUP_EXTRA',
        cardNumber,
        message: `Printing group has no logical card: ${cardNumber}.`,
      })
    }
  }

  const globalOfficialIds = new Set<string>()
  const cards: CardPrintingsDataFile['cards'] = {}
  const sortedNumbers = [...logicalNumbers].sort(compareUnicodeCodePoints)
  for (const cardNumber of sortedNumbers) {
    const candidate = candidatesByNumber.get(cardNumber)
    const logicalCard = cardsDataFile.cards.find(
      (card) => card.cardNumber === cardNumber,
    )
    if (!candidate || !logicalCard) continue
    if (!candidate.representativeImageOfficialId) {
      errors.push({
        code: 'DEFAULT_PRINTING_MISSING',
        cardNumber,
        message: `Representative printing is missing for ${cardNumber}.`,
      })
      continue
    }
    if (candidate.printings.length === 0) {
      errors.push({
        code: 'EMPTY_PRINTING_GROUP',
        cardNumber,
        message: `Printing group is empty for ${cardNumber}.`,
      })
      continue
    }

    const localIds = new Set<string>()
    for (const printing of candidate.printings) {
      if (!OFFICIAL_ID_PATTERN.test(printing.officialId)) {
        errors.push({
          code: 'INVALID_OFFICIAL_ID',
          cardNumber,
          message: `officialId ${printing.officialId} is not numeric.`,
        })
      }
      if (localIds.has(printing.officialId)) {
        errors.push({
          code: 'DUPLICATE_OFFICIAL_ID',
          cardNumber,
          message: `Duplicate officialId ${printing.officialId} in ${cardNumber}.`,
        })
      }
      if (globalOfficialIds.has(printing.officialId)) {
        errors.push({
          code: 'DUPLICATE_OFFICIAL_ID_GLOBAL',
          cardNumber,
          message: `officialId ${printing.officialId} appears in multiple groups.`,
        })
      }
      localIds.add(printing.officialId)
      globalOfficialIds.add(printing.officialId)
    }

    const defaults = candidate.printings.filter(
      (printing) =>
        printing.officialId === candidate.representativeImageOfficialId,
    )
    if (defaults.length !== 1) {
      errors.push({
        code: 'DEFAULT_PRINTING_NOT_UNIQUE',
        cardNumber,
        message: `Default printing must occur exactly once for ${cardNumber}.`,
      })
      continue
    }
    if (
      logicalCard.imageUrl !== undefined &&
      defaults[0]?.imageUrl !== logicalCard.imageUrl
    ) {
      errors.push({
        code: 'DEFAULT_PRINTING_IMAGE_MISMATCH',
        cardNumber,
        message: `Default printing image does not match logical card ${cardNumber}.`,
      })
    }

    const publicPrintings = candidate.printings.map(toPublicPrinting)
    cards[cardNumber] = {
      defaultPrintingOfficialId: candidate.representativeImageOfficialId,
      printings: orderPrintings(
        publicPrintings,
        candidate.representativeImageOfficialId,
      ),
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  const versionPayload = {
    format: 'hlsieve-card-printings' as const,
    formatVersion: 1 as const,
    cards,
  }
  return {
    ok: true,
    value: {
      format: versionPayload.format,
      formatVersion: versionPayload.formatVersion,
      cardsDataVersion: cardsDataFile.dataVersion,
      dataVersion: buildDataVersion(versionPayload),
      cards,
    },
    warnings: [],
  }
}
