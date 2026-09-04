import type { Card } from '../cards/types'
import type { CardSort } from './types'

function compareText(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}

function compareReleaseDate(
  left: Card,
  right: Card,
  direction: 'asc' | 'desc',
): number {
  if (left.releaseDate === undefined && right.releaseDate === undefined) {
    return compareText(left.cardNumber, right.cardNumber)
  }
  if (left.releaseDate === undefined) return 1
  if (right.releaseDate === undefined) return -1
  const dateComparison = compareText(left.releaseDate, right.releaseDate)
  if (dateComparison !== 0) {
    return direction === 'asc' ? dateComparison : -dateComparison
  }
  return compareText(left.cardNumber, right.cardNumber)
}

export function sortCards(cards: readonly Card[], sort: CardSort): Card[] {
  const result = [...cards]
  if (sort === 'default') return result
  if (sort === 'card_number_asc') {
    return result.sort((left, right) =>
      compareText(left.cardNumber, right.cardNumber),
    )
  }
  return result.sort((left, right) =>
    compareReleaseDate(
      left,
      right,
      sort === 'release_date_asc' ? 'asc' : 'desc',
    ),
  )
}
