import { compareCardNumbers } from '../cards/cardNumber'
import type { Card } from '../cards/types'
import { normalizeSearchText } from '../search/normalizeSearchText'
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

const HOLOMEM_COLOR_RANK = new Map(
  ['white', 'green', 'red', 'blue', 'purple', 'yellow', 'colorless'].map(
    (color, index) => [color, index],
  ),
)

function compareText(left: string, right: string): number {
  return left.localeCompare(right, 'ja')
}

function compareHolomem(left: Card, right: Card): number {
  const readingDifference = compareText(
    normalizeSearchText(left.nameReading ?? left.name),
    normalizeSearchText(right.nameReading ?? right.name),
  )
  if (readingDifference !== 0) return readingDifference

  const nameDifference = compareText(
    normalizeSearchText(left.name),
    normalizeSearchText(right.name),
  )
  if (nameDifference !== 0) return nameDifference

  const leftColors = left.colors
    .map((color) => HOLOMEM_COLOR_RANK.get(color) ?? Number.MAX_SAFE_INTEGER)
    .sort((a, b) => a - b)
  const rightColors = right.colors
    .map((color) => HOLOMEM_COLOR_RANK.get(color) ?? Number.MAX_SAFE_INTEGER)
    .sort((a, b) => a - b)
  for (
    let index = 0;
    index < Math.max(leftColors.length, rightColors.length);
    index += 1
  ) {
    const difference =
      (leftColors[index] ?? Number.MAX_SAFE_INTEGER) -
      (rightColors[index] ?? Number.MAX_SAFE_INTEGER)
    if (difference !== 0) return difference
  }

  return compareCardNumbers(left.cardNumber, right.cardNumber)
}

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
        const holomemDifference = compareHolomem(leftCard, rightCard)
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
