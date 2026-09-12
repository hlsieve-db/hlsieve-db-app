import { CARD_COLOR_LABELS } from '../cards/constants'
import type { Card, CardColor } from '../cards/types'
import { normalizeSearchText } from '../search/normalizeSearchText'

const CARD_COLOR_ORDER = Object.keys(CARD_COLOR_LABELS) as CardColor[]

export function getOshiCandidates(cards: readonly Card[]): Card[] {
  const seenCardNumbers = new Set<string>()
  return cards.filter((card) => {
    if (card.cardType !== 'oshi' || seenCardNumbers.has(card.cardNumber)) {
      return false
    }
    seenCardNumbers.add(card.cardNumber)
    return true
  })
}

function orderedColorLabels(card: Card): string {
  const colors = new Set(card.colors)
  return CARD_COLOR_ORDER.filter((color) => colors.has(color))
    .map((color) => CARD_COLOR_LABELS[color])
    .join('/')
}

export function formatOshiLabel(
  card: Card,
  allOshiCards: readonly Card[],
): string {
  const normalizedName = normalizeSearchText(card.name)
  const hasSameNameVariant = allOshiCards.some(
    (candidate) =>
      candidate.cardNumber !== card.cardNumber &&
      normalizeSearchText(candidate.name) === normalizedName,
  )

  if (!hasSameNameVariant) return card.name
  const colorLabels = orderedColorLabels(card)
  return colorLabels ? `${card.name} 【${colorLabels}】` : card.name
}

export function formatOshiOptionLabel(
  card: Card,
  allOshiCards: readonly Card[],
): string {
  return `${formatOshiLabel(card, allOshiCards)}（${card.cardNumber}）`
}

export function searchOshiCandidates(
  cards: readonly Card[],
  query: string,
): Card[] {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return [...cards]

  return cards.filter((card) =>
    [card.name, card.nameReading, card.cardNumber].some(
      (value) =>
        value !== undefined &&
        normalizeSearchText(value).includes(normalizedQuery),
    ),
  )
}
