import type { Card } from '../cards/types'
import { getDeckZone } from '../decks/legality'
import type { Deck } from '../decks/types'
import {
  DEFAULT_POOL_SECTIONS,
  type DeckRegulationResult,
  type DeckRegulationViolation,
  type DeckSection,
  type RegulationDefinition,
} from './types'

/**
 * Deciding what a format allows.
 *
 * Pure, and about card numbers rather than printings: a deck records the number
 * and nothing else, and the official pools are published the same way, so a
 * second illustration of an allowed card is the same allowed card.
 *
 * Only the pool is decided here. Deck size, copy limits, restricted cards and
 * cards the data has never heard of are the ordinary legality rules' business,
 * and are left to them so there is one place to correct when they change.
 */

function sectionsFor(regulation: RegulationDefinition): readonly DeckSection[] {
  return regulation.cardPool?.appliesTo ?? DEFAULT_POOL_SECTIONS
}

function bannedFor(regulation: RegulationDefinition): ReadonlySet<string> {
  return new Set(regulation.cardPool?.bannedCardNumbers ?? [])
}

/**
 * The card numbers a format allows, or undefined when it restricts nothing.
 *
 * Undefined rather than a set of every card: "no pool" and "a pool that happens
 * to hold everything" answer differently the moment a new card is published,
 * and only the first one stays right without maintenance.
 *
 * A banned card is removed here as well as being refused by `isCardAllowed`, so
 * anything reading the pool to show what may be used shows the same answer the
 * validator gives.
 */
export function getAllowedCardNumbers(
  regulation: RegulationDefinition,
  cards: readonly Card[],
): ReadonlySet<string> | undefined {
  const pool = regulation.cardPool
  if (!pool) return undefined

  const productNames = new Set(pool.allowedProductNames ?? [])
  const additional = pool.additionalAllowedCardNumbers ?? []
  // Nothing says which cards are in, so there is no pool to be inside. A ban
  // list on its own is still honoured, by isCardAllowed rather than here.
  if (productNames.size === 0 && additional.length === 0) return undefined

  const allowed = new Set<string>()
  for (const card of cards) {
    if (card.products.some((product) => productNames.has(product))) {
      allowed.add(card.cardNumber)
    }
  }
  for (const cardNumber of additional) allowed.add(cardNumber)
  // Last, so a ban wins over a card the same definition also allows: the two
  // lists only ever meet by mistake, and refusing is the correctable direction.
  for (const cardNumber of bannedFor(regulation)) allowed.delete(cardNumber)

  return allowed
}

export type IsCardAllowedOptions = {
  card: Card
  regulation: RegulationDefinition
  /** The pool from `getAllowedCardNumbers`, to avoid rebuilding it per card. */
  allowed?: ReadonlySet<string>
  cards?: readonly Card[]
}

/**
 * Whether one card may be used under a format.
 *
 * A ban applies to the whole format rather than to the restricted sections
 * only. A cheer card banned by name would otherwise be usable because cheer is
 * outside the pool, which is not what banning a card means; and a definition
 * that wants a section-specific rule can say so by restricting that section.
 */
export function isCardAllowed({
  card,
  regulation,
  allowed,
  cards,
}: IsCardAllowedOptions): boolean {
  if (bannedFor(regulation).has(card.cardNumber)) return false

  const pool =
    allowed ?? (cards ? getAllowedCardNumbers(regulation, cards) : undefined)
  if (!pool) return true

  let section: DeckSection
  try {
    section = getDeckZone(card)
  } catch {
    // A card type these rules do not know about is reported by the legality
    // layer, which is the one that owns unknown and unsupported cards.
    return true
  }

  if (!sectionsFor(regulation).includes(section)) return true
  return pool.has(card.cardNumber)
}

export type ValidateDeckRegulationOptions = {
  deck: Deck
  regulation: RegulationDefinition
  cards: readonly Card[]
}

/**
 * Every card in a deck that the format does not allow.
 *
 * A card the data does not know about is passed over rather than reported: the
 * legality rules already say that, and saying it twice would show a reporter
 * two different complaints about one card.
 */
export function validateDeckRegulation({
  deck,
  regulation,
  cards,
}: ValidateDeckRegulationOptions): DeckRegulationResult {
  const allowed = getAllowedCardNumbers(regulation, cards)
  const banned = bannedFor(regulation)
  const cardsByNumber = new Map(cards.map((card) => [card.cardNumber, card]))
  const violations: DeckRegulationViolation[] = []

  for (const entry of deck.entries) {
    const card = cardsByNumber.get(entry.cardNumber)
    if (!card) continue

    let section: DeckSection
    try {
      section = getDeckZone(card)
    } catch {
      continue
    }

    if (isCardAllowed({ card, regulation, allowed })) continue

    violations.push({
      cardNumber: entry.cardNumber,
      section,
      quantity: entry.quantity,
      reason: banned.has(entry.cardNumber) ? 'banned' : 'not-in-card-pool',
    })
  }

  return { valid: violations.length === 0, violations }
}
