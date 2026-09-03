import type {
  CardColor,
  CriticalColor,
  EffectTag,
  RequiredCheer,
} from '../../../src/domain/cards/types'
import { EFFECT_TAG_ORDER } from '../derive/deriveEffectTags'
import type { MergeConflict, MergedPrinting } from '../merge/types'
import type { NormalizedProduct } from '../normalize/types'
import type { SearchIndexedCardCandidate } from '../searchIndex/types'
import {
  compareUnicodeCodePoints,
  stableStringify,
  toJsonValue,
} from './stableStringify'
import type {
  CardContentHashPayload,
  ContentHashConflict,
  ContentHashPrinting,
  ContentHashProduct,
} from './types'

const CARD_COLOR_ORDER = [
  'white',
  'green',
  'red',
  'blue',
  'purple',
  'yellow',
  'colorless',
] as const satisfies readonly CardColor[]

const CRITICAL_COLOR_ORDER = [
  'white',
  'green',
  'red',
  'blue',
  'purple',
  'yellow',
] as const satisfies readonly CriticalColor[]
const CHEER_COLOR_ORDER = [...CARD_COLOR_ORDER, 'any'] as const

function uniqueSortedStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareUnicodeCodePoints)
}

function sortByFixedOrder<T extends string>(
  values: readonly T[],
  order: readonly T[],
): T[] {
  const positions = new Map(order.map((value, index) => [value, index]))
  return [...new Set(values)].sort(
    (left, right) =>
      (positions.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (positions.get(right) ?? Number.MAX_SAFE_INTEGER) ||
      compareUnicodeCodePoints(left, right),
  )
}

function canonicalizeRequiredCheers(
  requiredCheers: readonly RequiredCheer[],
): RequiredCheer[] {
  const counts = new Map<RequiredCheer['color'], number>()
  for (const cheer of requiredCheers) {
    if (!Number.isInteger(cheer.count) || cheer.count <= 0) {
      throw new TypeError(
        `Required cheer count must be a positive integer: ${cheer.count}`,
      )
    }
    counts.set(cheer.color, (counts.get(cheer.color) ?? 0) + cheer.count)
  }
  return CHEER_COLOR_ORDER.flatMap((color) => {
    const count = counts.get(color)
    return count === undefined ? [] : [{ color, count }]
  })
}

function canonicalizeProduct(product: NormalizedProduct): ContentHashProduct {
  return {
    name: product.name,
    ...(product.category !== undefined ? { category: product.category } : {}),
    ...(product.releaseDate !== undefined
      ? { releaseDate: product.releaseDate }
      : {}),
    ...(product.detailUrl !== undefined
      ? { detailUrl: product.detailUrl }
      : {}),
  }
}

function productTuple(product: ContentHashProduct): string[] {
  return [
    product.name,
    product.category ?? '',
    product.releaseDate ?? '',
    product.detailUrl ?? '',
  ]
}

function compareTuples(
  left: readonly string[],
  right: readonly string[],
): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const compared = compareUnicodeCodePoints(
      left[index] ?? '',
      right[index] ?? '',
    )
    if (compared !== 0) return compared
  }
  return 0
}

function canonicalizeProducts(
  products: readonly NormalizedProduct[],
): ContentHashProduct[] {
  const byValue = new Map<string, ContentHashProduct>()
  for (const product of products) {
    const canonical = canonicalizeProduct(product)
    byValue.set(stableStringify(canonical), canonical)
  }
  return [...byValue.values()].sort(
    (left, right) =>
      compareTuples(productTuple(left), productTuple(right)) ||
      compareUnicodeCodePoints(stableStringify(left), stableStringify(right)),
  )
}

function isNumericOfficialId(value: string): boolean {
  return /^\d+$/.test(value)
}

export function compareOfficialIds(left: string, right: string): number {
  const leftNumeric = isNumericOfficialId(left)
  const rightNumeric = isNumericOfficialId(right)
  if (leftNumeric && rightNumeric) {
    const leftValue = BigInt(left)
    const rightValue = BigInt(right)
    if (leftValue !== rightValue) return leftValue < rightValue ? -1 : 1
    return compareUnicodeCodePoints(left, right)
  }
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1
  return compareUnicodeCodePoints(left, right)
}

function canonicalizePrinting(printing: MergedPrinting): ContentHashPrinting {
  return {
    officialId: printing.officialId,
    officialUrl: printing.officialUrl,
    ...(printing.imageUrl !== undefined ? { imageUrl: printing.imageUrl } : {}),
    ...(printing.rarity !== undefined ? { rarity: printing.rarity } : {}),
    products: canonicalizeProducts(printing.products),
    ...(printing.illustrator !== undefined
      ? { illustrator: printing.illustrator }
      : {}),
  }
}

function canonicalizeConflict(conflict: MergeConflict): ContentHashConflict {
  if (conflict.kind === 'qa_conflict') {
    return {
      kind: conflict.kind,
      cardNumber: conflict.cardNumber,
      question: conflict.question,
      variants: conflict.variants
        .map((variant) => ({
          answer: variant.answer,
          officialIds: [...new Set(variant.officialIds)].sort(
            compareOfficialIds,
          ),
        }))
        .sort(
          (left, right) =>
            compareUnicodeCodePoints(left.answer, right.answer) ||
            compareTuples(left.officialIds, right.officialIds),
        ),
    }
  }

  const canonicalValue = toJsonValue(
    conflict.canonicalValue,
    '$.conflict.canonicalValue',
  )
  const conflictingValue = toJsonValue(
    conflict.conflictingValue,
    '$.conflict.conflictingValue',
  )
  return {
    kind: conflict.kind,
    cardNumber: conflict.cardNumber,
    field: conflict.field,
    canonicalOfficialId: conflict.canonicalOfficialId,
    conflictingOfficialId: conflict.conflictingOfficialId,
    ...(canonicalValue !== undefined ? { canonicalValue } : {}),
    ...(conflictingValue !== undefined ? { conflictingValue } : {}),
  }
}

function conflictSortKey(conflict: ContentHashConflict): readonly string[] {
  if (conflict.kind === 'qa_conflict') {
    return [conflict.kind, conflict.question, stableStringify(conflict)]
  }
  return [
    conflict.kind,
    conflict.field,
    conflict.canonicalOfficialId,
    conflict.conflictingOfficialId,
    stableStringify(conflict),
  ]
}

export function buildContentHashPayload(
  card: SearchIndexedCardCandidate,
): CardContentHashPayload {
  return {
    cardNumber: card.cardNumber,
    name: card.name,
    cardType: card.cardType,
    isBuzz: card.isBuzz,
    colors: sortByFixedOrder(card.colors, CARD_COLOR_ORDER),
    ...(card.bloomLevel !== undefined ? { bloomLevel: card.bloomLevel } : {}),
    ...(card.debutType !== undefined ? { debutType: card.debutType } : {}),
    ...(card.hp !== undefined ? { hp: card.hp } : {}),
    ...(card.life !== undefined ? { life: card.life } : {}),
    tags: uniqueSortedStrings(card.tags),
    ...(card.supportType !== undefined
      ? { supportType: card.supportType }
      : {}),
    isLimited: card.isLimited,
    ...(card.supportSearchCategory !== undefined
      ? { supportSearchCategory: card.supportSearchCategory }
      : {}),
    batonPass: canonicalizeRequiredCheers(card.batonPass),
    abilities: card.abilities.map((ability) => ({
      ...(ability.type !== undefined ? { type: ability.type } : {}),
      text: ability.text,
    })),
    arts: card.arts.map((art) => ({
      name: art.name,
      requiredCheers: canonicalizeRequiredCheers(art.requiredCheers),
      ...(art.damage !== undefined ? { damage: art.damage } : {}),
      ...(art.effectText !== undefined ? { effectText: art.effectText } : {}),
      ...(art.critical !== undefined
        ? {
            critical: {
              color: art.critical.color,
              ...(art.critical.bonusDamage !== undefined
                ? { bonusDamage: art.critical.bonusDamage }
                : {}),
            },
          }
        : {}),
    })),
    ...(card.extraText !== undefined ? { extraText: card.extraText } : {}),
    ...(card.deckLimit !== undefined ? { deckLimit: card.deckLimit } : {}),
    effectTags: sortByFixedOrder(
      card.effectTags,
      EFFECT_TAG_ORDER as readonly EffectTag[],
    ),
    criticalColors: sortByFixedOrder(card.criticalColors, CRITICAL_COLOR_ORDER),
    qas: card.qas.map((qa) => ({
      question: qa.question,
      answer: qa.answer,
    })),
    ...(card.imageUrl !== undefined ? { imageUrl: card.imageUrl } : {}),
    ...(card.officialUrl !== undefined
      ? { officialUrl: card.officialUrl }
      : {}),
    rarities: uniqueSortedStrings(card.rarities),
    products: uniqueSortedStrings(card.products),
    illustrators: uniqueSortedStrings(card.illustrators),
    ...(card.releaseDate !== undefined
      ? { releaseDate: card.releaseDate }
      : {}),
    printings: card.printings
      .map(canonicalizePrinting)
      .sort(
        (left, right) =>
          compareOfficialIds(left.officialId, right.officialId) ||
          compareUnicodeCodePoints(
            stableStringify(left),
            stableStringify(right),
          ),
      ),
    conflicts: card.conflicts
      .map(canonicalizeConflict)
      .sort((left, right) =>
        compareTuples(conflictSortKey(left), conflictSortKey(right)),
      ),
  }
}
