import {
  BLOOM_LEVEL_LABELS,
  CARD_COLOR_LABELS,
  SUPPORT_SEARCH_CATEGORY_LABELS,
} from '../cards/constants'
import type { Card, CardColor } from '../cards/types'
import type { BloomFilterValue, CardTypeFilterValue } from '../search/types'
import { getDeckZone } from './legality'
import type { CardRestriction, Deck } from './types'

const COLOR_ORDER = Object.keys(CARD_COLOR_LABELS) as CardColor[]
const CARD_TYPE_ORDER: AnalysisCardType[] = [
  'holomem',
  'support_limited',
  'support_general',
  'support_tool',
  'support_fan',
  'unknown',
]
const BLOOM_ORDER: AnalysisBloomLevel[] = [
  'debut_normal',
  'debut_extra',
  'debut',
  'first',
  'second',
  'spot',
  'unknown',
]

export type AnalysisBreakdownItem = {
  key: string
  label: string
  quantity: number
  percentage?: number
}

export type AnalysisCardType =
  Exclude<CardTypeFilterValue, 'oshi' | 'cheer'> | 'unknown'

export type AnalysisBloomLevel =
  Exclude<BloomFilterValue, 'buzz'> | 'debut' | 'unknown'

export type DeckAnalysis = {
  totals: {
    oshi: number
    main: number
    cheer: number
    unknown: number
    total: number
  }
  oshiCards: Array<{ card: Card; quantity: number }>
  colors: AnalysisBreakdownItem[]
  cardTypes: AnalysisBreakdownItem[]
  bloomLevels: AnalysisBreakdownItem[]
  buzzQuantity: number
  cheerColors: AnalysisBreakdownItem[]
  restrictedCards: Array<{
    cardNumber: string
    name?: string
    quantity: number
    maxCopies: number
    isOverLimit: boolean
  }>
  unknownCards: Array<{ cardNumber: string; quantity: number }>
}

export type AnalyzeDeckInput = {
  deck: Deck
  cards: readonly Card[]
  restrictions: readonly CardRestriction[]
}

function percentage(quantity: number, denominator: number): number | undefined {
  return denominator === 0
    ? undefined
    : Math.round((quantity / denominator) * 1000) / 10
}

function colorCategory(colors: readonly CardColor[]): {
  key: string
  label: string
  order: number[]
} {
  const unique = new Set(colors)
  const ordered = COLOR_ORDER.filter((color) => unique.has(color))
  if (ordered.length === 0) {
    return { key: 'unknown', label: '分類不能', order: [COLOR_ORDER.length] }
  }
  return {
    key: ordered.join('/'),
    label: ordered.map((color) => CARD_COLOR_LABELS[color]).join('/'),
    order: ordered.map((color) => COLOR_ORDER.indexOf(color)),
  }
}

function cardTypeCategory(card: Card): AnalysisCardType {
  if (card.cardType === 'holomem') return 'holomem'
  if (card.cardType !== 'support') return 'unknown'
  if (!card.supportSearchCategory) return 'unknown'
  return `support_${card.supportSearchCategory}`
}

function cardTypeLabel(category: AnalysisCardType): string {
  if (category === 'holomem') return 'ホロメン'
  if (category === 'unknown') return '分類不能'
  const supportCategory = category.replace('support_', '') as NonNullable<
    Card['supportSearchCategory']
  >
  return SUPPORT_SEARCH_CATEGORY_LABELS[supportCategory]
}

function bloomCategory(card: Card): AnalysisBloomLevel {
  if (!card.bloomLevel) return 'unknown'
  if (card.bloomLevel !== 'debut') return card.bloomLevel
  if (card.debutType === 'normal') return 'debut_normal'
  if (card.debutType === 'extra') return 'debut_extra'
  return 'debut'
}

function bloomLabel(category: AnalysisBloomLevel): string {
  if (category === 'debut_normal') return 'Debut（通常）'
  if (category === 'debut_extra') return 'Debut（エクストラ）'
  if (category === 'debut') return BLOOM_LEVEL_LABELS.debut
  if (category === 'unknown') return '分類不能'
  return BLOOM_LEVEL_LABELS[category]
}

function breakdown(
  quantities: ReadonlyMap<string, number>,
  denominator: number,
  labels: (key: string) => string,
  order: readonly string[],
): AnalysisBreakdownItem[] {
  return [...quantities.entries()]
    .filter(([, quantity]) => quantity > 0)
    .sort(([left], [right]) => {
      const leftIndex = order.indexOf(left)
      const rightIndex = order.indexOf(right)
      if (leftIndex === -1 && rightIndex === -1)
        return left.localeCompare(right)
      if (leftIndex === -1) return 1
      if (rightIndex === -1) return -1
      return leftIndex - rightIndex
    })
    .map(([key, quantity]) => ({
      key,
      label: labels(key),
      quantity,
      percentage: percentage(quantity, denominator),
    }))
}

function colorBreakdown(
  cards: readonly { card: Card; quantity: number }[],
): AnalysisBreakdownItem[] {
  const quantities = new Map<string, number>()
  const categories = new Map<string, ReturnType<typeof colorCategory>>()
  for (const item of cards) {
    const category = colorCategory(item.card.colors)
    categories.set(category.key, category)
    quantities.set(
      category.key,
      (quantities.get(category.key) ?? 0) + item.quantity,
    )
  }
  const denominator = cards.reduce((total, item) => total + item.quantity, 0)
  return [...quantities.entries()]
    .sort(([left], [right]) => {
      if (left === 'unknown') return 1
      if (right === 'unknown') return -1
      const leftOrder = categories.get(left)?.order ?? []
      const rightOrder = categories.get(right)?.order ?? []
      const lengthDifference = leftOrder.length - rightOrder.length
      if (lengthDifference !== 0) return lengthDifference
      const length = Math.max(leftOrder.length, rightOrder.length)
      for (let index = 0; index < length; index += 1) {
        const difference =
          (leftOrder[index] ?? COLOR_ORDER.length + 1) -
          (rightOrder[index] ?? COLOR_ORDER.length + 1)
        if (difference !== 0) return difference
      }
      return left.localeCompare(right)
    })
    .map(([key, quantity]) => ({
      key,
      label: categories.get(key)?.label ?? '分類不能',
      quantity,
      percentage: percentage(quantity, denominator),
    }))
}

export function analyzeDeck({
  deck,
  cards,
  restrictions,
}: AnalyzeDeckInput): DeckAnalysis {
  const cardsByNumber = new Map(cards.map((card) => [card.cardNumber, card]))
  const resolved = { oshi: [], main: [], cheer: [] } as Record<
    'oshi' | 'main' | 'cheer',
    Array<{ card: Card; quantity: number }>
  >
  const unknownCards: DeckAnalysis['unknownCards'] = []

  for (const entry of deck.entries) {
    const card = cardsByNumber.get(entry.cardNumber)
    if (!card) {
      unknownCards.push({ ...entry })
      continue
    }
    try {
      resolved[getDeckZone(card)].push({ card, quantity: entry.quantity })
    } catch {
      unknownCards.push({ ...entry })
    }
  }

  const totalFor = (zone: keyof typeof resolved) =>
    resolved[zone].reduce((total, item) => total + item.quantity, 0)
  const mainTotal = totalFor('main')
  const cheerTotal = totalFor('cheer')
  const unknownTotal = unknownCards.reduce(
    (total, item) => total + item.quantity,
    0,
  )

  const cardTypeQuantities = new Map<string, number>()
  for (const item of resolved.main) {
    const category = cardTypeCategory(item.card)
    cardTypeQuantities.set(
      category,
      (cardTypeQuantities.get(category) ?? 0) + item.quantity,
    )
  }

  const holomem = resolved.main.filter(
    (item) => item.card.cardType === 'holomem',
  )
  const bloomQuantities = new Map<string, number>()
  for (const item of holomem) {
    const category = bloomCategory(item.card)
    bloomQuantities.set(
      category,
      (bloomQuantities.get(category) ?? 0) + item.quantity,
    )
  }

  const restrictionByNumber = new Map(
    restrictions.map((restriction) => [restriction.cardNumber, restriction]),
  )
  const restrictedCards = resolved.main.flatMap(({ card, quantity }) => {
    const restriction = restrictionByNumber.get(card.cardNumber)
    return restriction
      ? [
          {
            cardNumber: card.cardNumber,
            name: card.name,
            quantity,
            maxCopies: restriction.maxCopies,
            isOverLimit: quantity > restriction.maxCopies,
          },
        ]
      : []
  })

  return {
    totals: {
      oshi: totalFor('oshi'),
      main: mainTotal,
      cheer: cheerTotal,
      unknown: unknownTotal,
      total: deck.entries.reduce((total, entry) => total + entry.quantity, 0),
    },
    oshiCards: resolved.oshi,
    colors: colorBreakdown(resolved.main),
    cardTypes: breakdown(
      cardTypeQuantities,
      mainTotal,
      (key) => cardTypeLabel(key as AnalysisCardType),
      CARD_TYPE_ORDER,
    ),
    bloomLevels: breakdown(
      bloomQuantities,
      holomem.reduce((total, item) => total + item.quantity, 0),
      (key) => bloomLabel(key as AnalysisBloomLevel),
      BLOOM_ORDER,
    ),
    buzzQuantity: holomem.reduce(
      (total, item) => total + (item.card.isBuzz ? item.quantity : 0),
      0,
    ),
    cheerColors: colorBreakdown(resolved.cheer),
    restrictedCards,
    unknownCards,
  }
}
