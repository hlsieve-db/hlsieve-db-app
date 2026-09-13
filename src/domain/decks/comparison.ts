import type { Card } from '../cards/types'
import {
  analyzeDeck,
  type AnalysisBreakdownItem,
  type DeckAnalysis,
} from './analysis'
import { getDeckZone } from './legality'
import type { CardRestriction, Deck } from './types'

export type DeckComparisonInput = {
  beforeDeck: Deck
  afterDeck: Deck
  cards: readonly Card[]
  restrictions: readonly CardRestriction[]
}

export type CardChangeKind = 'added' | 'removed' | 'increased' | 'decreased'
export type ComparisonZone = 'oshi' | 'main' | 'cheer' | 'unknown'

export type CardChange = {
  cardNumber: string
  name?: string
  zone: ComparisonZone
  beforeQuantity: number
  afterQuantity: number
  delta: number
  kind: CardChangeKind
}

export type BreakdownComparison = {
  key: string
  label: string
  beforeQuantity: number
  afterQuantity: number
  delta: number
  beforePercentage?: number
  afterPercentage?: number
}

export type RestrictionComparison = {
  cardNumber: string
  name?: string
  maxCopies: number
  beforeQuantity: number
  afterQuantity: number
  beforeOverLimit: boolean
  afterOverLimit: boolean
}

export type DeckComparison = {
  oshi: {
    before: DeckAnalysis['oshiCards']
    after: DeckAnalysis['oshiCards']
    changed: boolean
  }
  cardChanges: CardChange[]
  analysisBefore: DeckAnalysis
  analysisAfter: DeckAnalysis
  analysisDiff: {
    totals: Array<{
      key: keyof DeckAnalysis['totals']
      beforeQuantity: number
      afterQuantity: number
      delta: number
    }>
    colors: BreakdownComparison[]
    cardTypes: BreakdownComparison[]
    bloomLevels: BreakdownComparison[]
    buzz: {
      beforeQuantity: number
      afterQuantity: number
      delta: number
    }
    cheerColors: BreakdownComparison[]
    restrictions: RestrictionComparison[]
  }
  isIdentical: boolean
}

const ZONE_ORDER: readonly ComparisonZone[] = [
  'oshi',
  'main',
  'cheer',
  'unknown',
]
const TOTAL_ORDER: ReadonlyArray<keyof DeckAnalysis['totals']> = [
  'oshi',
  'main',
  'cheer',
  'unknown',
  'total',
]

function aggregateEntries(deck: Deck): Map<string, number> {
  const quantities = new Map<string, number>()
  for (const entry of deck.entries) {
    quantities.set(
      entry.cardNumber,
      (quantities.get(entry.cardNumber) ?? 0) + entry.quantity,
    )
  }
  return quantities
}

function comparisonZone(card: Card | undefined): ComparisonZone {
  if (!card) return 'unknown'
  try {
    return getDeckZone(card)
  } catch {
    return 'unknown'
  }
}

function compareBreakdown(
  before: readonly AnalysisBreakdownItem[],
  after: readonly AnalysisBreakdownItem[],
): BreakdownComparison[] {
  const beforeByKey = new Map(before.map((item) => [item.key, item]))
  const afterByKey = new Map(after.map((item) => [item.key, item]))
  const orderedKeys = [
    ...before.map((item) => item.key),
    ...after.map((item) => item.key),
  ].filter((key, index, keys) => keys.indexOf(key) === index)

  return orderedKeys.map((key) => {
    const beforeItem = beforeByKey.get(key)
    const afterItem = afterByKey.get(key)
    const beforeQuantity = beforeItem?.quantity ?? 0
    const afterQuantity = afterItem?.quantity ?? 0
    return {
      key,
      label: beforeItem?.label ?? afterItem?.label ?? key,
      beforeQuantity,
      afterQuantity,
      delta: afterQuantity - beforeQuantity,
      beforePercentage: beforeItem?.percentage,
      afterPercentage: afterItem?.percentage,
    }
  })
}

function normalizedOshiSignature(items: DeckAnalysis['oshiCards']): string {
  const quantities = new Map<string, number>()
  for (const { card, quantity } of items) {
    quantities.set(
      card.cardNumber,
      (quantities.get(card.cardNumber) ?? 0) + quantity,
    )
  }
  return [...quantities.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([cardNumber, quantity]) => `${cardNumber}:${quantity}`)
    .join('|')
}

export function compareDecks({
  beforeDeck,
  afterDeck,
  cards,
  restrictions,
}: DeckComparisonInput): DeckComparison {
  const cardsByNumber = new Map(cards.map((card) => [card.cardNumber, card]))
  const beforeEntries = aggregateEntries(beforeDeck)
  const afterEntries = aggregateEntries(afterDeck)
  const cardNumbers = new Set([...beforeEntries.keys(), ...afterEntries.keys()])

  const cardChanges = [...cardNumbers]
    .flatMap<CardChange>((cardNumber) => {
      const beforeQuantity = beforeEntries.get(cardNumber) ?? 0
      const afterQuantity = afterEntries.get(cardNumber) ?? 0
      const delta = afterQuantity - beforeQuantity
      if (delta === 0) return []
      const kind: CardChangeKind =
        beforeQuantity === 0
          ? 'added'
          : afterQuantity === 0
            ? 'removed'
            : delta > 0
              ? 'increased'
              : 'decreased'
      const card = cardsByNumber.get(cardNumber)
      return [
        {
          cardNumber,
          name: card?.name,
          zone: comparisonZone(card),
          beforeQuantity,
          afterQuantity,
          delta,
          kind,
        },
      ]
    })
    .sort((left, right) => {
      const zoneDifference =
        ZONE_ORDER.indexOf(left.zone) - ZONE_ORDER.indexOf(right.zone)
      return (
        zoneDifference || left.cardNumber.localeCompare(right.cardNumber, 'en')
      )
    })

  const analysisBefore = analyzeDeck({
    deck: beforeDeck,
    cards,
    restrictions,
  })
  const analysisAfter = analyzeDeck({
    deck: afterDeck,
    cards,
    restrictions,
  })
  const restrictionNumbers = [
    ...analysisBefore.restrictedCards.map((item) => item.cardNumber),
    ...analysisAfter.restrictedCards.map((item) => item.cardNumber),
  ].filter((cardNumber, index, items) => items.indexOf(cardNumber) === index)

  return {
    oshi: {
      before: analysisBefore.oshiCards,
      after: analysisAfter.oshiCards,
      changed:
        normalizedOshiSignature(analysisBefore.oshiCards) !==
        normalizedOshiSignature(analysisAfter.oshiCards),
    },
    cardChanges,
    analysisBefore,
    analysisAfter,
    analysisDiff: {
      totals: TOTAL_ORDER.map((key) => ({
        key,
        beforeQuantity: analysisBefore.totals[key],
        afterQuantity: analysisAfter.totals[key],
        delta: analysisAfter.totals[key] - analysisBefore.totals[key],
      })),
      colors: compareBreakdown(analysisBefore.colors, analysisAfter.colors),
      cardTypes: compareBreakdown(
        analysisBefore.cardTypes,
        analysisAfter.cardTypes,
      ),
      bloomLevels: compareBreakdown(
        analysisBefore.bloomLevels,
        analysisAfter.bloomLevels,
      ),
      buzz: {
        beforeQuantity: analysisBefore.buzzQuantity,
        afterQuantity: analysisAfter.buzzQuantity,
        delta: analysisAfter.buzzQuantity - analysisBefore.buzzQuantity,
      },
      cheerColors: compareBreakdown(
        analysisBefore.cheerColors,
        analysisAfter.cheerColors,
      ),
      restrictions: restrictionNumbers.map((cardNumber) => {
        const before = analysisBefore.restrictedCards.find(
          (item) => item.cardNumber === cardNumber,
        )
        const after = analysisAfter.restrictedCards.find(
          (item) => item.cardNumber === cardNumber,
        )
        return {
          cardNumber,
          name: before?.name ?? after?.name,
          maxCopies: before?.maxCopies ?? after?.maxCopies ?? 0,
          beforeQuantity: before?.quantity ?? 0,
          afterQuantity: after?.quantity ?? 0,
          beforeOverLimit: before?.isOverLimit ?? false,
          afterOverLimit: after?.isOverLimit ?? false,
        }
      }),
    },
    isIdentical: cardChanges.length === 0,
  }
}
