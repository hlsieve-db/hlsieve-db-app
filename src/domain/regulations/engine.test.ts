import { describe, expect, it } from 'vitest'

import type { Card } from '../cards/types'
import type { Deck } from '../decks/types'
import {
  getAllowedCardNumbers,
  isCardAllowed,
  validateDeckRegulation,
} from './engine'
import { STANDARD_REGULATION } from './standard'
import type { RegulationDefinition } from './types'

function card(cardNumber: string, overrides: Partial<Card> = {}): Card {
  return {
    cardNumber,
    name: `カード ${cardNumber}`,
    cardType: 'holomem',
    colors: ['white'],
    isBuzz: false,
    tags: [],
    abilities: [],
    arts: [],
    batonPass: [],
    effectTags: [],
    criticalColors: [],
    rarities: ['C'],
    products: ['対象商品'],
    illustrators: [],
    qas: [],
    searchText: '',
    ...overrides,
  }
}

const inPool = card('IN-001')
const outOfPool = card('OUT-001', { products: ['対象外商品'] })
const oshiInPool = card('OSHI-001', { cardType: 'oshi' })
const oshiOutOfPool = card('OSHI-002', {
  cardType: 'oshi',
  products: ['対象外商品'],
})
const cheerOutOfPool = card('CHEER-001', {
  cardType: 'cheer',
  products: ['対象外商品'],
})
const cards = [
  inPool,
  outOfPool,
  oshiInPool,
  oshiOutOfPool,
  cheerOutOfPool,
  card('EXTRA-001', { products: ['対象外商品'] }),
]

function regulation(
  cardPool: RegulationDefinition['cardPool'],
): RegulationDefinition {
  return { id: 'test', name: 'テスト', cardPool }
}

const productPool = regulation({ allowedProductNames: ['対象商品'] })

function deck(cardNumbers: string[]): Deck {
  return {
    id: 'deck-1',
    name: 'テストデッキ',
    entries: cardNumbers.map((cardNumber) => ({ cardNumber, quantity: 1 })),
    createdAt: '2026-09-22T00:00:00.000Z',
    updatedAt: '2026-09-22T00:00:00.000Z',
  }
}

describe('working out which cards a format allows', () => {
  it('collects the cards the named products hold', () => {
    expect(getAllowedCardNumbers(productPool, cards)).toEqual(
      new Set(['IN-001', 'OSHI-001']),
    )
  })

  // "No pool" and "a pool holding everything" differ the moment a card is
  // published, and only the first stays right without maintenance.
  it('reports no pool at all for ordinary construction', () => {
    expect(getAllowedCardNumbers(STANDARD_REGULATION, cards)).toBeUndefined()
  })

  it('reports no pool when nothing says which cards are in', () => {
    expect(
      getAllowedCardNumbers(regulation({ appliesTo: ['main'] }), cards),
    ).toBeUndefined()
    expect(
      getAllowedCardNumbers(
        regulation({ bannedCardNumbers: ['IN-001'] }),
        cards,
      ),
    ).toBeUndefined()
  })

  it('adds the cards named on top of the products', () => {
    expect(
      getAllowedCardNumbers(
        regulation({
          allowedProductNames: ['対象商品'],
          additionalAllowedCardNumbers: ['OUT-001'],
        }),
        cards,
      ),
    ).toEqual(new Set(['IN-001', 'OSHI-001', 'OUT-001']))
  })

  it('builds a pool from named cards with no product at all', () => {
    expect(
      getAllowedCardNumbers(
        regulation({ additionalAllowedCardNumbers: ['OUT-001'] }),
        cards,
      ),
    ).toEqual(new Set(['OUT-001']))
  })

  it('leaves out a banned card the products hold', () => {
    expect(
      getAllowedCardNumbers(
        regulation({
          allowedProductNames: ['対象商品'],
          bannedCardNumbers: ['IN-001'],
        }),
        cards,
      ),
    ).toEqual(new Set(['OSHI-001']))
  })

  // The two lists only ever meet by mistake, and refusing is the direction
  // that can be corrected without anyone having played an illegal deck.
  it('lets a ban win over the same definition allowing the card', () => {
    expect(
      getAllowedCardNumbers(
        regulation({
          additionalAllowedCardNumbers: ['OUT-001'],
          bannedCardNumbers: ['OUT-001'],
        }),
        cards,
      ),
    ).toEqual(new Set())
  })

  it('gives the same answer for the same input', () => {
    expect(getAllowedCardNumbers(productPool, cards)).toEqual(
      getAllowedCardNumbers(productPool, cards),
    )
  })
})

describe('whether one card may be used', () => {
  const allowed = getAllowedCardNumbers(productPool, cards)

  it('allows a card the pool holds', () => {
    expect(
      isCardAllowed({ card: inPool, regulation: productPool, allowed }),
    ).toBe(true)
  })

  it('refuses a card the pool does not hold', () => {
    expect(
      isCardAllowed({ card: outOfPool, regulation: productPool, allowed }),
    ).toBe(false)
  })

  it('allows everything under ordinary construction', () => {
    expect(
      isCardAllowed({
        card: outOfPool,
        regulation: STANDARD_REGULATION,
        cards,
      }),
    ).toBe(true)
  })

  // The default is the oshi and the main deck, so cheer is untouched by a pool
  // that says nothing about it.
  it('leaves cheer alone by default', () => {
    expect(
      isCardAllowed({ card: cheerOutOfPool, regulation: productPool, allowed }),
    ).toBe(true)
  })

  it('restricts the oshi by default', () => {
    expect(
      isCardAllowed({ card: oshiOutOfPool, regulation: productPool, allowed }),
    ).toBe(false)
  })

  it('restricts only the sections the definition names', () => {
    const mainOnly = regulation({
      allowedProductNames: ['対象商品'],
      appliesTo: ['main'],
    })
    const pool = getAllowedCardNumbers(mainOnly, cards)

    expect(
      isCardAllowed({
        card: oshiOutOfPool,
        regulation: mainOnly,
        allowed: pool,
      }),
    ).toBe(true)
    expect(
      isCardAllowed({ card: outOfPool, regulation: mainOnly, allowed: pool }),
    ).toBe(false)
  })

  // A ban is about the card, not about where it sits, so a section the pool
  // does not restrict cannot smuggle a banned card back in.
  it('refuses a banned card even in a section the pool ignores', () => {
    const banned = regulation({
      allowedProductNames: ['対象商品'],
      bannedCardNumbers: ['CHEER-001'],
    })

    expect(
      isCardAllowed({
        card: cheerOutOfPool,
        regulation: banned,
        allowed: getAllowedCardNumbers(banned, cards),
      }),
    ).toBe(false)
  })

  it('refuses a banned card where the format restricts nothing else', () => {
    const banned = regulation({ bannedCardNumbers: ['IN-001'] })

    expect(isCardAllowed({ card: inPool, regulation: banned, cards })).toBe(
      false,
    )
  })

  it('works out the pool itself when it is not handed one', () => {
    expect(
      isCardAllowed({ card: outOfPool, regulation: productPool, cards }),
    ).toBe(false)
  })
})

describe('checking a whole deck', () => {
  it('reports each card the format does not allow', () => {
    const result = validateDeckRegulation({
      deck: deck(['IN-001', 'OUT-001', 'OSHI-002']),
      regulation: productPool,
      cards,
    })

    expect(result.valid).toBe(false)
    expect(result.violations).toEqual([
      {
        cardNumber: 'OUT-001',
        section: 'main',
        quantity: 1,
        reason: 'not-in-card-pool',
      },
      {
        cardNumber: 'OSHI-002',
        section: 'oshi',
        quantity: 1,
        reason: 'not-in-card-pool',
      },
    ])
  })

  it('tells a banned card apart from one merely outside the pool', () => {
    const banned = regulation({
      allowedProductNames: ['対象商品'],
      bannedCardNumbers: ['IN-001'],
    })

    expect(
      validateDeckRegulation({
        deck: deck(['IN-001']),
        regulation: banned,
        cards,
      }).violations,
    ).toEqual([
      {
        cardNumber: 'IN-001',
        section: 'main',
        quantity: 1,
        reason: 'banned',
      },
    ])
  })

  it('reports the quantity that was used', () => {
    const result = validateDeckRegulation({
      deck: {
        ...deck([]),
        entries: [{ cardNumber: 'OUT-001', quantity: 3 }],
      },
      regulation: productPool,
      cards,
    })

    expect(result.violations[0]?.quantity).toBe(3)
  })

  it('passes a deck built inside the pool', () => {
    expect(
      validateDeckRegulation({
        deck: deck(['IN-001', 'OSHI-001', 'CHEER-001']),
        regulation: productPool,
        cards,
      }),
    ).toEqual({ valid: true, violations: [] })
  })

  it('passes everything under ordinary construction', () => {
    expect(
      validateDeckRegulation({
        deck: deck(['IN-001', 'OUT-001', 'OSHI-002']),
        regulation: STANDARD_REGULATION,
        cards,
      }).valid,
    ).toBe(true)
  })

  // Saying it here as well would show two complaints about one card.
  it('leaves a card the data does not know about to the legality rules', () => {
    expect(
      validateDeckRegulation({
        deck: deck(['NOT-A-CARD']),
        regulation: productPool,
        cards,
      }),
    ).toEqual({ valid: true, violations: [] })
  })

  it('gives the same answer for the same deck', () => {
    const input = {
      deck: deck(['IN-001', 'OUT-001']),
      regulation: productPool,
      cards,
    }

    expect(validateDeckRegulation(input)).toEqual(validateDeckRegulation(input))
  })
})
