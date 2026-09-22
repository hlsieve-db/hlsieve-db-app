import type { Card } from '../cards/types'
import type { TournamentReport, TournamentRound } from './types'

/**
 * How an oshi is recorded on a report.
 *
 * The field is free text, so `name` is what the reporter typed and is the only
 * thing shown back to them. `cardNumber` is kept alongside it when that text
 * names exactly one oshi card, which is what lets the statistics page keep
 * grouping by card and the image keep printing the colours and the number.
 *
 * An entry with a name and no card number is perfectly valid: it simply does
 * not take part in per-oshi statistics, the same as a report with no oshi at
 * all. Nothing is rejected for failing to match a card.
 */
export type OshiEntry = {
  name?: string
  cardNumber?: string
}

/** Oshi cards only, de-duplicated by card number, as the report deals in. */
function oshiCardsByName(cards: readonly Card[]): Map<string, Card[]> {
  const byName = new Map<string, Card[]>()
  for (const card of cards) {
    if (card.cardType !== 'oshi') continue
    const existing = byName.get(card.name)
    if (!existing) {
      byName.set(card.name, [card])
    } else if (!existing.some((c) => c.cardNumber === card.cardNumber)) {
      existing.push(card)
    }
  }
  return byName
}

/**
 * Turns what the reporter typed into a stored entry.
 *
 * The card number is attached only when the name identifies exactly one card.
 * Several oshi cards can share a name, and picking one of them arbitrarily
 * would file the report under a card the reporter never chose, so an ambiguous
 * name is stored as text alone.
 */
export function buildOshiEntry(
  text: string,
  cards: readonly Card[],
): OshiEntry {
  const name = text.trim()
  if (!name) return {}
  const matches = oshiCardsByName(cards).get(name)
  return matches?.length === 1
    ? { name, cardNumber: matches[0]!.cardNumber }
    : { name }
}

/**
 * What to show in the input, and in the text and image output.
 *
 * Reports written before the field became free text hold only a card number,
 * so that is resolved to the card's name here rather than being migrated in
 * storage: the report is left exactly as it was saved until the reporter edits
 * it. A number that no longer matches any card is shown as itself, because
 * losing what someone recorded would be worse than showing it unresolved.
 */
export function resolveOshiDisplayName(
  entry: OshiEntry,
  cards: readonly Card[],
): string | undefined {
  if (entry.name) return entry.name
  if (!entry.cardNumber) return undefined
  const card = cards.find(
    (candidate) =>
      candidate.cardType === 'oshi' &&
      candidate.cardNumber === entry.cardNumber,
  )
  return card?.name ?? entry.cardNumber
}

/** The card behind an entry, when it still resolves to one. */
export function resolveOshiCard(
  entry: OshiEntry,
  cards: readonly Card[],
): Card | undefined {
  if (!entry.cardNumber) return undefined
  return cards.find(
    (candidate) =>
      candidate.cardType === 'oshi' &&
      candidate.cardNumber === entry.cardNumber,
  )
}

/** Whether anything was recorded, however it was recorded. */
export function hasOshiEntry(entry: OshiEntry): boolean {
  return Boolean(entry.name?.trim() || entry.cardNumber)
}

/**
 * The report and the round spell the same pair of fields differently, so the
 * mapping lives here rather than at each call site.
 *
 * These exist because OshiEntry has only optional properties, which means a
 * TournamentReport satisfies it structurally: passing a report straight into
 * the helpers above type checks and then silently reads nothing. Going through
 * these adapters is what makes the field names explicit.
 */
export function selfOshiEntry(report: TournamentReport): OshiEntry {
  return { name: report.selfOshiName, cardNumber: report.selfOshiCardNumber }
}

export function opponentOshiEntry(round: TournamentRound): OshiEntry {
  return {
    name: round.opponentOshiName,
    cardNumber: round.opponentOshiCardNumber,
  }
}
