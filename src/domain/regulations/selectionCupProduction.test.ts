import { describe, expect, it } from 'vitest'

import cardsSnapshot from '../../../public/cards.json'
import type { Card, CardsDataFile } from '../cards/types'
import { getDeckZone } from '../decks/legality'
import { getAllowedCardNumbers, isCardAllowed } from './engine'
import { SELECTION_CUP_2026_OSAKA } from './selectionCup2026Osaka'
import { STANDARD_REGULATION } from './standard'

/**
 * The Selection pool against the published card data.
 *
 * The pool is not written out card by card: it is whatever carries the official
 * overlay product, so it follows the data. That is the point, and also the
 * risk. If the official name changes, nothing matches, the pool becomes empty
 * and the app would call every card illegal. These tests are what makes that
 * fail here rather than in front of a reporter, which is why they assert the
 * expected size instead of only asserting that the pool is non-empty.
 *
 * Nothing in the app reads `expectedCardCount`: production must not start
 * refusing decks because an integrity number went stale.
 */

const cards = (cardsSnapshot as CardsDataFile).cards
const pool = SELECTION_CUP_2026_OSAKA.cardPool
const allowed = getAllowedCardNumbers(SELECTION_CUP_2026_OSAKA, cards)

function cardsInPool(): Card[] {
  return cards.filter((card) => allowed?.has(card.cardNumber))
}

describe('the Selection pool in the published data', () => {
  it('resolves the overlay product the definition names', () => {
    const [productName] = pool?.allowedProductNames ?? []
    expect(productName).toBeDefined()
    expect(
      cards.some((card) => card.products.includes(productName ?? '')),
    ).toBe(true)
  })

  // The number the definition carries, checked against the data it describes.
  it('holds exactly the number of cards the definition expects', () => {
    expect(pool?.expectedCardCount).toBe(683)
    expect(allowed?.size).toBe(pool?.expectedCardCount)
  })

  it('is made of card numbers that exist in the data', () => {
    const known = new Set(cards.map((card) => card.cardNumber))
    for (const cardNumber of allowed ?? []) {
      expect(known.has(cardNumber)).toBe(true)
    }
  })

  // The pool holds no cheer card at all, which could mean either that cheer is
  // unrestricted or that no cheer card is legal. The definition says which.
  it('restricts the oshi and the main deck, and says so explicitly', () => {
    expect(pool?.appliesTo).toEqual(['oshi', 'main'])
    expect(cardsInPool().some((card) => card.cardType === 'cheer')).toBe(false)
  })

  it('allows every cheer card despite the pool holding none', () => {
    const cheerCards = cards.filter((card) => card.cardType === 'cheer')
    expect(cheerCards.length).toBeGreaterThan(0)
    for (const card of cheerCards) {
      expect(
        isCardAllowed({ card, regulation: SELECTION_CUP_2026_OSAKA, allowed }),
      ).toBe(true)
    }
  })

  it('covers each restricted section with real cards', () => {
    const sections = cardsInPool().map((card) => getDeckZone(card))
    expect(sections.filter((section) => section === 'oshi').length).toBe(44)
    expect(sections.filter((section) => section === 'main').length).toBe(639)
  })

  it('allows a card the overlay holds, in each restricted section', () => {
    const anOshi = cards.find(
      (card) => card.cardType === 'oshi' && allowed?.has(card.cardNumber),
    )
    const aHolomem = cards.find(
      (card) => card.cardType === 'holomem' && allowed?.has(card.cardNumber),
    )
    const aSupport = cards.find(
      (card) => card.cardType === 'support' && allowed?.has(card.cardNumber),
    )

    for (const card of [anOshi, aHolomem, aSupport]) {
      expect(card).toBeDefined()
      expect(
        isCardAllowed({
          card: card as Card,
          regulation: SELECTION_CUP_2026_OSAKA,
          allowed,
        }),
      ).toBe(true)
    }
  })

  it('refuses a card the overlay does not hold', () => {
    const outside = cards.find(
      (card) =>
        (card.cardType === 'holomem' || card.cardType === 'support') &&
        !allowed?.has(card.cardNumber),
    )

    expect(outside).toBeDefined()
    expect(
      isCardAllowed({
        card: outside as Card,
        regulation: SELECTION_CUP_2026_OSAKA,
        allowed,
      }),
    ).toBe(false)
  })

  // A deck records a card number and nothing else, so a second illustration of
  // an allowed card is the same allowed card.
  it('decides by card number rather than by printing', () => {
    const numbers = [...(allowed ?? [])]
    expect(new Set(numbers).size).toBe(numbers.length)

    const multiProduct = cards.filter(
      (card) => allowed?.has(card.cardNumber) && card.products.length > 1,
    )
    // Every card in this overlay is also sold in the product it was printed in,
    // so the pool is an overlay rather than a separate set of cards.
    expect(multiProduct.length).toBe(allowed?.size)
  })

  it('leaves ordinary construction unrestricted against the same data', () => {
    expect(getAllowedCardNumbers(STANDARD_REGULATION, cards)).toBeUndefined()
    for (const card of cards.slice(0, 50)) {
      expect(
        isCardAllowed({ card, regulation: STANDARD_REGULATION, cards }),
      ).toBe(true)
    }
  })
})
