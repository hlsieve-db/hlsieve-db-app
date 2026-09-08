import type { Card } from '../cards/types'
import {
  CURRENT_DECK_RESTRICTIONS,
  DECK_ZONE_COUNTS,
  DEFAULT_MAIN_COPY_LIMIT,
} from './restrictions'
import type {
  Deck,
  DeckLegalityIssue,
  DeckLegalityResult,
  DeckZone,
} from './types'

export function getDeckZone(card: Card): DeckZone {
  switch (card.cardType) {
    case 'oshi':
      return 'oshi'
    case 'holomem':
    case 'support':
      return 'main'
    case 'cheer':
      return 'cheer'
    default:
      throw new Error(`Unsupported card type: ${String(card.cardType)}`)
  }
}

type MainCopyLimit = {
  max: number | null
  issueCode: 'copy_limit' | 'restricted_card'
}

export function getMainCardCopyLimit(card: Card): MainCopyLimit {
  const restriction = CURRENT_DECK_RESTRICTIONS.find(
    (candidate) => candidate.cardNumber === card.cardNumber,
  )
  const cardLimit =
    card.deckLimit === null ? null : (card.deckLimit ?? DEFAULT_MAIN_COPY_LIMIT)

  if (
    restriction &&
    (cardLimit === null || restriction.maxCopies <= cardLimit)
  ) {
    return { max: restriction.maxCopies, issueCode: 'restricted_card' }
  }
  return { max: cardLimit, issueCode: 'copy_limit' }
}

function countIssue(
  code: 'oshi_count' | 'main_count' | 'cheer_count',
  actual: number,
  expected: number,
): DeckLegalityIssue | undefined {
  return actual === expected ? undefined : { code, actual, expected }
}

export function validateDeckLegality(
  deck: Deck,
  cards: readonly Card[],
): DeckLegalityResult {
  const cardsByNumber = new Map(cards.map((card) => [card.cardNumber, card]))
  let oshiCount = 0
  let mainCount = 0
  let cheerCount = 0
  const entryIssues: DeckLegalityIssue[] = []

  for (const entry of deck.entries) {
    const card = cardsByNumber.get(entry.cardNumber)
    if (!card) {
      entryIssues.push({
        code: 'unknown_card',
        cardNumber: entry.cardNumber,
        actual: entry.quantity,
      })
      continue
    }

    let zone: DeckZone
    try {
      zone = getDeckZone(card)
    } catch {
      entryIssues.push({
        code: 'unsupported_card_type',
        cardNumber: entry.cardNumber,
        actual: entry.quantity,
      })
      continue
    }

    if (zone === 'oshi') oshiCount += entry.quantity
    if (zone === 'main') mainCount += entry.quantity
    if (zone === 'cheer') cheerCount += entry.quantity

    if (zone === 'main') {
      const limit = getMainCardCopyLimit(card)
      if (limit.max !== null && entry.quantity > limit.max) {
        entryIssues.push({
          code: limit.issueCode,
          cardNumber: entry.cardNumber,
          actual: entry.quantity,
          max: limit.max,
        })
      }
    }
  }

  const issues = [
    countIssue('oshi_count', oshiCount, DECK_ZONE_COUNTS.oshi),
    countIssue('main_count', mainCount, DECK_ZONE_COUNTS.main),
    countIssue('cheer_count', cheerCount, DECK_ZONE_COUNTS.cheer),
    ...entryIssues,
  ].filter((issue): issue is DeckLegalityIssue => issue !== undefined)

  const hasHardViolation = issues.some((issue) => {
    if (
      issue.code === 'oshi_count' ||
      issue.code === 'main_count' ||
      issue.code === 'cheer_count'
    ) {
      return issue.actual > issue.expected
    }
    return true
  })
  const status =
    issues.length === 0 ? 'legal' : hasHardViolation ? 'invalid' : 'incomplete'

  return {
    isLegal: status === 'legal',
    status,
    oshiCount,
    mainCount,
    cheerCount,
    totalCount: deck.entries.reduce(
      (total, entry) => total + entry.quantity,
      0,
    ),
    issues,
  }
}
