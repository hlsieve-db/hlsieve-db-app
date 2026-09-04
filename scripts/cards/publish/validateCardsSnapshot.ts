import type { Card, CardsDataFile } from '../../../src/domain/cards/types'
import { buildCardsDataFile } from '../generate/buildCardsDataFile'
import { serializeDataFile } from '../generate/serializeDataFile'

export type CardsSnapshotValidation =
  | { ok: true; value: CardsDataFile; serialized: string }
  | { ok: false; errors: string[] }

const CARD_KEYS = new Set([
  'cardNumber',
  'name',
  'imageUrl',
  'nameReading',
  'cardType',
  'colors',
  'bloomLevel',
  'isBuzz',
  'debutType',
  'hp',
  'life',
  'tags',
  'supportType',
  'isLimited',
  'supportSearchCategory',
  'abilities',
  'arts',
  'batonPass',
  'extraText',
  'effectTags',
  'criticalColors',
  'rarities',
  'products',
  'illustrators',
  'qas',
  'deckLimit',
  'releaseDate',
  'searchText',
  'officialUrl',
])

const CARD_TYPES = new Set(['oshi', 'holomem', 'support', 'cheer'])
const COLORS = new Set([
  'white',
  'green',
  'red',
  'blue',
  'purple',
  'yellow',
  'colorless',
])
const CRITICAL_COLORS = new Set([
  'white',
  'green',
  'red',
  'blue',
  'purple',
  'yellow',
])
const EFFECT_TAGS = new Set([
  'second_turn_one',
  'bloom_effect',
  'collab_effect',
  'gift',
  'draw',
  'deck_search',
  'cheer_acceleration',
  'cheer_recovery',
  'archive_recovery',
  'arts_boost',
  'damage_reduction',
  'special_damage',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(value).every((key) => allowed.has(key))
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isEnumArray(value: unknown, allowed: Set<string>): boolean {
  return isStringArray(value) && value.every((item) => allowed.has(item))
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string'
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || typeof value === 'number'
}

function isRequiredCheer(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, new Set(['color', 'count'])) &&
    typeof value.color === 'string' &&
    (COLORS.has(value.color) || value.color === 'any') &&
    Number.isSafeInteger(value.count) &&
    Number(value.count) >= 0
  )
}

function isAbility(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, new Set(['type', 'text'])) &&
    (value.type === undefined ||
      ['normal', 'bloom', 'collab', 'gift'].includes(String(value.type))) &&
    typeof value.text === 'string'
  )
}

function isArt(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      new Set(['name', 'requiredCheers', 'damage', 'effectText', 'critical']),
    ) ||
    typeof value.name !== 'string' ||
    !Array.isArray(value.requiredCheers) ||
    !value.requiredCheers.every(isRequiredCheer) ||
    !isOptionalNumber(value.damage) ||
    !isOptionalString(value.effectText)
  ) {
    return false
  }
  if (value.critical === undefined) return true
  return (
    isRecord(value.critical) &&
    hasOnlyKeys(value.critical, new Set(['color', 'bonusDamage'])) &&
    typeof value.critical.color === 'string' &&
    CRITICAL_COLORS.has(value.critical.color) &&
    isOptionalNumber(value.critical.bonusDamage)
  )
}

function isQa(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, new Set(['question', 'answer'])) &&
    typeof value.question === 'string' &&
    typeof value.answer === 'string'
  )
}

function isPublicCard(value: unknown): value is Card {
  if (!isRecord(value) || !hasOnlyKeys(value, CARD_KEYS)) return false
  return (
    typeof value.cardNumber === 'string' &&
    typeof value.name === 'string' &&
    isOptionalString(value.imageUrl) &&
    isOptionalString(value.nameReading) &&
    typeof value.cardType === 'string' &&
    CARD_TYPES.has(value.cardType) &&
    isEnumArray(value.colors, COLORS) &&
    (value.bloomLevel === undefined ||
      ['debut', 'first', 'second', 'spot'].includes(
        String(value.bloomLevel),
      )) &&
    typeof value.isBuzz === 'boolean' &&
    (value.debutType === undefined ||
      ['normal', 'extra'].includes(String(value.debutType))) &&
    isOptionalNumber(value.hp) &&
    isOptionalNumber(value.life) &&
    isStringArray(value.tags) &&
    (value.supportType === undefined ||
      ['staff', 'item', 'event', 'tool', 'mascot', 'fan'].includes(
        String(value.supportType),
      )) &&
    (value.isLimited === undefined || typeof value.isLimited === 'boolean') &&
    (value.supportSearchCategory === undefined ||
      ['limited', 'general', 'tool', 'fan'].includes(
        String(value.supportSearchCategory),
      )) &&
    Array.isArray(value.abilities) &&
    value.abilities.every(isAbility) &&
    Array.isArray(value.arts) &&
    value.arts.every(isArt) &&
    Array.isArray(value.batonPass) &&
    value.batonPass.every(isRequiredCheer) &&
    isOptionalString(value.extraText) &&
    isEnumArray(value.effectTags, EFFECT_TAGS) &&
    isEnumArray(value.criticalColors, CRITICAL_COLORS) &&
    isStringArray(value.rarities) &&
    isStringArray(value.products) &&
    isStringArray(value.illustrators) &&
    Array.isArray(value.qas) &&
    value.qas.every(isQa) &&
    (value.deckLimit === undefined ||
      value.deckLimit === null ||
      Number.isSafeInteger(value.deckLimit)) &&
    isOptionalString(value.releaseDate) &&
    typeof value.searchText === 'string' &&
    isOptionalString(value.officialUrl)
  )
}

export function validateCardsSnapshotText(
  serialized: string,
): CardsSnapshotValidation {
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : String(error)],
    }
  }
  if (
    !isRecord(parsed) ||
    !hasOnlyKeys(
      parsed,
      new Set([
        'format',
        'formatVersion',
        'dataVersion',
        'generatedAt',
        'cards',
      ]),
    ) ||
    parsed.format !== 'holocard-cards' ||
    parsed.formatVersion !== 1 ||
    typeof parsed.dataVersion !== 'string' ||
    typeof parsed.generatedAt !== 'string' ||
    !Array.isArray(parsed.cards)
  ) {
    return { ok: false, errors: ['Invalid cards data file envelope.'] }
  }
  const invalidIndex = parsed.cards.findIndex((card) => !isPublicCard(card))
  if (invalidIndex >= 0) {
    return {
      ok: false,
      errors: [`cards[${invalidIndex}] violates the public Card schema.`],
    }
  }

  const cardsDataFile = parsed as CardsDataFile
  const rebuilt = buildCardsDataFile(cardsDataFile.cards, {
    generatedAt: cardsDataFile.generatedAt,
  })
  if (!rebuilt.ok) {
    return {
      ok: false,
      errors: rebuilt.errors.map((error) => error.message),
    }
  }
  if (rebuilt.value.dataVersion !== cardsDataFile.dataVersion) {
    return { ok: false, errors: ['dataVersion does not match card content.'] }
  }
  const canonical = serializeDataFile(rebuilt.value)
  if (!canonical.ok) {
    return {
      ok: false,
      errors: canonical.errors.map((error) => error.message),
    }
  }
  if (canonical.value !== serialized) {
    return { ok: false, errors: ['Cards snapshot is not canonical JSON.'] }
  }
  return { ok: true, value: rebuilt.value, serialized: canonical.value }
}
