import type { Card, CardsDataFile } from '../domain/cards/types'

const CARDS_DATA_URL = '/cards.json'
const TOP_LEVEL_KEYS = new Set([
  'format',
  'formatVersion',
  'dataVersion',
  'generatedAt',
  'cards',
])
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

function hasOnlyKeys(value: Record<string, unknown>, keys: Set<string>) {
  return Object.keys(value).every((key) => keys.has(key))
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isEnumArray(value: unknown, values: Set<string>): boolean {
  return isStringArray(value) && value.every((item) => values.has(item))
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string'
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return (
    value === undefined || (typeof value === 'number' && Number.isFinite(value))
  )
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
    !isOptionalFiniteNumber(value.damage) ||
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
    isOptionalFiniteNumber(value.critical.bonusDamage)
  )
}

function isQa(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(
      value,
      new Set([
        'id',
        'question',
        'answer',
        'officialUrl',
        'publishedAt',
        'relatedCardNumbers',
      ]),
    ) &&
    typeof value.id === 'string' &&
    /^Q[1-9]\d*$/.test(value.id) &&
    typeof value.question === 'string' &&
    value.question.length > 0 &&
    typeof value.answer === 'string' &&
    value.answer.length > 0 &&
    typeof value.officialUrl === 'string' &&
    isOfficialQaUrl(value.officialUrl) &&
    isOptionalString(value.publishedAt) &&
    isStringArray(value.relatedCardNumbers) &&
    value.relatedCardNumbers.length > 0
  )
}

function isOfficialQaUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.host === 'hololive-official-cardgame.com' &&
      url.hash === '#faq'
    )
  } catch {
    return false
  }
}

function isPublicCard(value: unknown): value is Card {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, CARD_KEYS) &&
    typeof value.cardNumber === 'string' &&
    value.cardNumber.length > 0 &&
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
    isOptionalFiniteNumber(value.hp) &&
    isOptionalFiniteNumber(value.life) &&
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

export function isCardsDataFile(value: unknown): value is CardsDataFile {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, TOP_LEVEL_KEYS) ||
    value.format !== 'holocard-cards' ||
    value.formatVersion !== 1 ||
    typeof value.dataVersion !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/.test(value.dataVersion) ||
    typeof value.generatedAt !== 'string' ||
    Number.isNaN(Date.parse(value.generatedAt)) ||
    !Array.isArray(value.cards) ||
    !value.cards.every(isPublicCard)
  ) {
    return false
  }
  return (
    new Set(value.cards.map((card) => card.cardNumber)).size ===
    value.cards.length
  )
}

export function createCardsDataLoader(fetchData: typeof fetch = fetch) {
  let cached: Promise<CardsDataFile> | undefined

  return function loadCardsData(): Promise<CardsDataFile> {
    if (cached) return cached
    const request = (async () => {
      let response: Response
      try {
        response = await fetchData(CARDS_DATA_URL)
      } catch (error) {
        throw new Error('Failed to fetch card data.', { cause: error })
      }
      if (!response.ok) {
        throw new Error(`Failed to load card data: HTTP ${response.status}.`)
      }

      let value: unknown
      try {
        value = await response.json()
      } catch (error) {
        throw new Error('Card data is not valid JSON.', { cause: error })
      }
      if (!isCardsDataFile(value)) {
        throw new Error('Card data has an invalid shape.')
      }
      return value
    })()
    cached = request
    void request.catch(() => {
      if (cached === request) cached = undefined
    })
    return request
  }
}

export const loadCardsData = createCardsDataLoader()
