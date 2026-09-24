import { describe, expect, it } from 'vitest'

import cardsSnapshot from '../../../public/cards.json'
import type { Card, CardsDataFile } from '../cards/types'
import { getDeckZone } from '../decks/legality'
import { getAllowedCardNumbers, isCardAllowed } from './engine'
import { SELECTION_CUP_2026_AUTUMN } from './selectionCup2026Autumn'
import { STANDARD_REGULATION } from './standard'

/**
 * The Selection Cup pool against the published card data.
 *
 * The pool is not written out card by card: it is every card number the three
 * named products hold, so it follows the data. That is the point, and also the
 * risk. If one of those names stops matching, that product contributes nothing,
 * and a pool that has quietly shrunk reads to a reporter as cards being banned.
 * These tests are what makes that fail here instead, which is why they assert
 * the expected sizes rather than only that the pool is non-empty.
 *
 * Nothing in the app reads `expectedCardCount`: production must not start
 * refusing decks because an integrity number went stale.
 */

const cards = (cardsSnapshot as CardsDataFile).cards
const pool = SELECTION_CUP_2026_AUTUMN.cardPool
const allowed = getAllowedCardNumbers(SELECTION_CUP_2026_AUTUMN, cards)

const BOUNCER = 'ブースターパック バウンサーバウンド'
const SUMMER = 'エクストラブースター サマー・ホログラム'
const VOLUME = 'ブースターパック「ボリュームヴォルテックス」'

function cardsInPool(): Card[] {
  return cards.filter((card) => allowed?.has(card.cardNumber))
}

function cardsIn(productName: string): Card[] {
  return cards.filter((card) => card.products.includes(productName))
}

describe('the Selection Cup pool in the published data', () => {
  it('names the three products the official rules name', () => {
    expect(pool?.allowedProductNames).toEqual([BOUNCER, SUMMER, VOLUME])
  })

  // Taken from the data rather than from the official page: two of the three
  // carry 「」 and one does not, and a look-alike character would match nothing.
  it('resolves every one of them against the data', () => {
    for (const productName of pool?.allowedProductNames ?? []) {
      expect(cardsIn(productName).length).toBeGreaterThan(0)
    }
  })

  it('holds what each product contributes', () => {
    expect(cardsIn(BOUNCER)).toHaveLength(127)
    expect(cardsIn(SUMMER)).toHaveLength(114)
    expect(cardsIn(VOLUME)).toHaveLength(123)
  })

  // The number the definition carries, checked against the data it describes.
  it('holds exactly the number of cards the definition expects', () => {
    expect(pool?.expectedCardCount).toBe(364)
    expect(allowed?.size).toBe(pool?.expectedCardCount)
  })

  it('counts a card once however many of the products hold it', () => {
    const numbers = [...(allowed ?? [])]
    expect(new Set(numbers).size).toBe(numbers.length)
  })

  it('is made of card numbers that exist in the data', () => {
    const known = new Set(cards.map((card) => card.cardNumber))
    for (const cardNumber of allowed ?? []) {
      expect(known.has(cardNumber)).toBe(true)
    }
  })

  it('holds the sections the official rules restrict', () => {
    const sections = cardsInPool().map((card) => getDeckZone(card))
    expect(sections.filter((section) => section === 'oshi')).toHaveLength(17)
    expect(sections.filter((section) => section === 'main')).toHaveLength(329)
    expect(sections.filter((section) => section === 'cheer')).toHaveLength(18)
  })

  it('restricts the oshi and the main deck, and says so explicitly', () => {
    expect(pool?.appliesTo).toEqual(['oshi', 'main'])
  })

  // The products do contain cheer cards, so the rule cannot be read off the
  // pool: every cheer card is usable, whether these products hold it or not.
  it('allows every cheer card, in the pool or out of it', () => {
    const cheerCards = cards.filter((card) => card.cardType === 'cheer')
    const outsideThePool = cheerCards.filter(
      (card) => !allowed?.has(card.cardNumber),
    )
    expect(cheerCards.length).toBeGreaterThan(0)
    expect(outsideThePool.length).toBeGreaterThan(0)

    for (const card of cheerCards) {
      expect(
        isCardAllowed({ card, regulation: SELECTION_CUP_2026_AUTUMN, allowed }),
      ).toBe(true)
    }
  })

  it('allows a card from each product', () => {
    for (const productName of [BOUNCER, SUMMER, VOLUME]) {
      const card = cardsIn(productName).find(
        (candidate) =>
          candidate.cardType === 'oshi' || candidate.cardType === 'holomem',
      )
      expect(card).toBeDefined()
      expect(
        isCardAllowed({
          card: card as Card,
          regulation: SELECTION_CUP_2026_AUTUMN,
          allowed,
        }),
      ).toBe(true)
    }
  })

  it('allows a card in each restricted section', () => {
    for (const cardType of ['oshi', 'holomem', 'support'] as const) {
      const card = cards.find(
        (candidate) =>
          candidate.cardType === cardType && allowed?.has(candidate.cardNumber),
      )
      expect(card).toBeDefined()
      expect(
        isCardAllowed({
          card: card as Card,
          regulation: SELECTION_CUP_2026_AUTUMN,
          allowed,
        }),
      ).toBe(true)
    }
  })

  it('refuses an oshi and a main-deck card the products do not hold', () => {
    for (const cardType of ['oshi', 'holomem', 'support'] as const) {
      const card = cards.find(
        (candidate) =>
          candidate.cardType === cardType &&
          !allowed?.has(candidate.cardNumber),
      )
      expect(card).toBeDefined()
      expect(
        isCardAllowed({
          card: card as Card,
          regulation: SELECTION_CUP_2026_AUTUMN,
          allowed,
        }),
      ).toBe(false)
    }
  })

  // A deck records a card number and nothing else, and the official rules allow
  // any printing of an allowed number, so a card first printed elsewhere and
  // reprinted in one of these products is allowed on its number alone.
  it('decides by card number rather than by printing', () => {
    const reprinted = cards.find(
      (card) =>
        allowed?.has(card.cardNumber) &&
        card.products.length > 1 &&
        card.products.some(
          (productName) => !pool?.allowedProductNames?.includes(productName),
        ),
    )

    expect(reprinted).toBeDefined()
    expect(
      isCardAllowed({
        card: reprinted as Card,
        regulation: SELECTION_CUP_2026_AUTUMN,
        allowed,
      }),
    ).toBe(true)
  })

  // A different event's card grouping, which happens to live in the same data.
  it('does not take its pool from the hGS Osaka grouping', () => {
    expect(pool?.allowedProductNames).not.toContain(
      '【使用可能カード】hGS 2026 大阪 セレクションロード',
    )
    const osaka = cardsIn('【使用可能カード】hGS 2026 大阪 セレクションロード')
    expect(osaka).toHaveLength(683)
    expect(allowed?.size).not.toBe(osaka.length)
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
