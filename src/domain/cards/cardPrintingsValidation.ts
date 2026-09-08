import type {
  CardPrintingGroupPublic,
  CardPrintingPublic,
  CardPrintingsDataFile,
} from './types'

const DATA_VERSION_PATTERN = /^sha256:[0-9a-f]{64}$/
const OFFICIAL_ID_PATTERN = /^\d+$/
const TOP_LEVEL_KEYS = new Set([
  'format',
  'formatVersion',
  'cardsDataVersion',
  'dataVersion',
  'cards',
])
const GROUP_KEYS = new Set(['defaultPrintingOfficialId', 'printings'])
const PRINTING_KEYS = new Set([
  'officialId',
  'officialUrl',
  'isParallel',
  'imageUrl',
  'rarity',
  'products',
  'illustrator',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: Set<string>) {
  return Object.keys(value).every((key) => keys.has(key))
}

function isValidUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function compareOfficialIds(left: string, right: string): number {
  const leftValue = BigInt(left)
  const rightValue = BigInt(right)
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0
}

function isPrinting(value: unknown): value is CardPrintingPublic {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, PRINTING_KEYS) &&
    typeof value.officialId === 'string' &&
    OFFICIAL_ID_PATTERN.test(value.officialId) &&
    isValidUrl(value.officialUrl) &&
    typeof value.isParallel === 'boolean' &&
    (value.imageUrl === undefined || isValidUrl(value.imageUrl)) &&
    (value.rarity === undefined || typeof value.rarity === 'string') &&
    Array.isArray(value.products) &&
    value.products.every((product) => typeof product === 'string') &&
    (value.illustrator === undefined || typeof value.illustrator === 'string')
  )
}

function hasValidOrder(group: CardPrintingGroupPublic): boolean {
  if (group.printings[0]?.officialId !== group.defaultPrintingOfficialId) {
    return false
  }
  const remaining = group.printings.slice(1)
  const firstParallel = remaining.findIndex((printing) => printing.isParallel)
  if (
    firstParallel >= 0 &&
    remaining.slice(firstParallel).some((printing) => !printing.isParallel)
  ) {
    return false
  }
  const partitions = [
    remaining.filter((printing) => !printing.isParallel),
    remaining.filter((printing) => printing.isParallel),
  ]
  return partitions.every((printings) =>
    printings.every(
      (printing, index) =>
        index === 0 ||
        compareOfficialIds(
          printings[index - 1]!.officialId,
          printing.officialId,
        ) < 0,
    ),
  )
}

function isGroup(value: unknown): value is CardPrintingGroupPublic {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, GROUP_KEYS) ||
    typeof value.defaultPrintingOfficialId !== 'string' ||
    !OFFICIAL_ID_PATTERN.test(value.defaultPrintingOfficialId) ||
    !Array.isArray(value.printings) ||
    value.printings.length === 0 ||
    !value.printings.every(isPrinting)
  ) {
    return false
  }
  const group = value as CardPrintingGroupPublic
  return (
    group.printings.filter(
      (printing) => printing.officialId === group.defaultPrintingOfficialId,
    ).length === 1 && hasValidOrder(group)
  )
}

export function isCardPrintingsDataFile(
  value: unknown,
): value is CardPrintingsDataFile {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, TOP_LEVEL_KEYS) ||
    value.format !== 'hlsieve-card-printings' ||
    value.formatVersion !== 1 ||
    typeof value.cardsDataVersion !== 'string' ||
    !DATA_VERSION_PATTERN.test(value.cardsDataVersion) ||
    typeof value.dataVersion !== 'string' ||
    !DATA_VERSION_PATTERN.test(value.dataVersion) ||
    !isRecord(value.cards)
  ) {
    return false
  }

  const officialIds = new Set<string>()
  for (const group of Object.values(value.cards)) {
    if (!isGroup(group)) return false
    for (const printing of group.printings) {
      if (officialIds.has(printing.officialId)) return false
      officialIds.add(printing.officialId)
    }
  }
  return true
}

export function assertCardPrintingsCompatibility(
  cardsDataVersion: string,
  printingsData: CardPrintingsDataFile,
): void {
  if (printingsData.cardsDataVersion !== cardsDataVersion) {
    throw new Error('Card printing data is incompatible with card data.')
  }
}
