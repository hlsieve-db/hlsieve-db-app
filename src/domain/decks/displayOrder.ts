import { compareCardNumbers } from '../cards/cardNumber'
import { compareCardsByReading } from '../cards/readingOrder'
import type { Card } from '../cards/types'
import type { DeckEntry } from './types'

export const DECK_DISPLAY_CATEGORY_ORDER = [
  'oshi',
  'debut',
  'first',
  'buzz',
  'second',
  'support_limited',
  'support_general',
  'support_tool',
  'support_fan',
  'cheer',
  'unknown',
] as const

export type DeckDisplayCategory = (typeof DECK_DISPLAY_CATEGORY_ORDER)[number]

const CATEGORY_RANK = new Map<DeckDisplayCategory, number>(
  DECK_DISPLAY_CATEGORY_ORDER.map((category, index) => [category, index]),
)

const HOLOMEM_CATEGORIES = new Set<DeckDisplayCategory>([
  'debut',
  'first',
  'buzz',
  'second',
])

export function getDeckDisplayCategory(
  card: Card | undefined,
): DeckDisplayCategory {
  if (!card) return 'unknown'
  if (card.cardType === 'oshi') return 'oshi'
  if (card.cardType === 'cheer') return 'cheer'
  if (card.cardType === 'holomem') {
    if (card.isBuzz) return 'buzz'
    if (card.bloomLevel === 'debut') return 'debut'
    if (card.bloomLevel === 'first') return 'first'
    if (card.bloomLevel === 'second') return 'second'
    return 'unknown'
  }
  if (card.cardType === 'support') {
    switch (card.supportSearchCategory) {
      case 'limited':
        return 'support_limited'
      case 'general':
        return 'support_general'
      case 'tool':
        return 'support_tool'
      case 'fan':
        return 'support_fan'
      default:
        return 'unknown'
    }
  }
  return 'unknown'
}

export function sortDeckEntriesForDisplay(
  entries: readonly DeckEntry[],
  cardsByNumber: ReadonlyMap<string, Card>,
): DeckEntry[] {
  return entries
    .map((entry, originalIndex) => ({ entry, originalIndex }))
    .sort((left, right) => {
      const leftCategory = getDeckDisplayCategory(
        cardsByNumber.get(left.entry.cardNumber),
      )
      const rightCategory = getDeckDisplayCategory(
        cardsByNumber.get(right.entry.cardNumber),
      )
      const categoryDifference =
        CATEGORY_RANK.get(leftCategory)! - CATEGORY_RANK.get(rightCategory)!
      if (categoryDifference !== 0) return categoryDifference

      const leftCard = cardsByNumber.get(left.entry.cardNumber)
      const rightCard = cardsByNumber.get(right.entry.cardNumber)
      if (HOLOMEM_CATEGORIES.has(leftCategory) && leftCard && rightCard) {
        const holomemDifference = compareCardsByReading(leftCard, rightCard)
        if (holomemDifference !== 0) return holomemDifference
      }

      const cardNumberDifference = compareCardNumbers(
        left.entry.cardNumber,
        right.entry.cardNumber,
      )
      return cardNumberDifference || left.originalIndex - right.originalIndex
    })
    .map(({ entry }) => entry)
}
