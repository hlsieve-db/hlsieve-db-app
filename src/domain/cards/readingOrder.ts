import { compareCardNumbers } from './cardNumber'
import { CARD_COLOR_LABELS } from './constants'
import type { Card, CardColor } from './types'
import { normalizeSearchText } from '../search/normalizeSearchText'

// The declared label order is the canonical colour order: 白 → 緑 → 赤 → 青 →
// 紫 → 黄 → 無.
export const CARD_COLOR_SORT_ORDER = Object.keys(
  CARD_COLOR_LABELS,
) as CardColor[]

const COLOR_RANK = new Map(
  CARD_COLOR_SORT_ORDER.map((color, index) => [color, index]),
)

function colorRank(color: string): number {
  return COLOR_RANK.get(color as CardColor) ?? Number.MAX_SAFE_INTEGER
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, 'ja')
}

function compareColors(left: Card, right: Card): number {
  const leftColors = left.colors.map(colorRank).sort((a, b) => a - b)
  const rightColors = right.colors.map(colorRank).sort((a, b) => a - b)
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
  return 0
}

/**
 * Orders cards the way a Japanese reader scans a name list: by reading, then
 * by name for identical readings, then by the canonical colour order, then by
 * card number. Cards without a `nameReading` fall back to their name.
 */
export function compareCardsByReading(left: Card, right: Card): number {
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

  const colorDifference = compareColors(left, right)
  if (colorDifference !== 0) return colorDifference

  return compareCardNumbers(left.cardNumber, right.cardNumber)
}
