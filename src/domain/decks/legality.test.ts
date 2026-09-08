import { describe, expect, it } from 'vitest'

import cardsSnapshot from '../../../public/cards.json'
import type { Card, CardsDataFile } from '../cards/types'
import {
  getDeckZone,
  getMainCardCopyLimit,
  validateDeckLegality,
} from './legality'
import { CURRENT_DECK_RESTRICTIONS } from './restrictions'
import type { Deck, DeckEntry } from './types'

function card(
  cardNumber: string,
  cardType: Card['cardType'],
  overrides: Partial<Card> = {},
): Card {
  return {
    cardNumber,
    name: cardNumber,
    cardType,
    colors: ['white'],
    isBuzz: false,
    tags: [],
    isLimited: false,
    abilities: [],
    arts: [],
    batonPass: [],
    effectTags: [],
    criticalColors: [],
    rarities: [],
    products: [],
    illustrators: [],
    qas: [],
    searchText: cardNumber.toLowerCase(),
    ...overrides,
  }
}

const oshi = card('OSHI-001', 'oshi')
const main = card('MAIN-001', 'holomem')
const unlimitedMain = card('MAIN-UNLIMITED', 'support', { deckLimit: null })
const cheer = card('CHEER-001', 'cheer')
const baseCards = [oshi, main, unlimitedMain, cheer]

function deck(entries: DeckEntry[]): Deck {
  return {
    id: 'deck-1',
    name: 'テストデッキ',
    entries,
    createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt: '2026-09-08T00:00:00.000Z',
  }
}

function entry(cardNumber: string, quantity: number): DeckEntry {
  return { cardNumber, quantity }
}

function legalEntries(): DeckEntry[] {
  return [
    entry(oshi.cardNumber, 1),
    entry(unlimitedMain.cardNumber, 50),
    entry(cheer.cardNumber, 20),
  ]
}

describe('getDeckZone', () => {
  it.each([
    ['oshi', 'oshi'],
    ['holomem', 'main'],
    ['support', 'main'],
    ['cheer', 'cheer'],
  ] as const)('maps %s to %s', (cardType, expected) => {
    expect(getDeckZone(card('CARD-001', cardType))).toBe(expected)
  })

  it('does not silently classify a future card type as main', () => {
    const future = {
      ...card('FUTURE-001', 'holomem'),
      cardType: 'future',
    } as unknown as Card
    expect(() => getDeckZone(future)).toThrow('Unsupported card type')
  })
})

describe('validateDeckLegality structure', () => {
  it('accepts an exact 1/50/20, 71-card deck', () => {
    expect(validateDeckLegality(deck(legalEntries()), baseCards)).toEqual({
      isLegal: true,
      status: 'legal',
      oshiCount: 1,
      mainCount: 50,
      cheerCount: 20,
      totalCount: 71,
      issues: [],
    })
  })

  it.each([
    ['oshi_count', 0, 50, 20, 'incomplete'],
    ['oshi_count', 2, 50, 20, 'invalid'],
    ['main_count', 1, 49, 20, 'incomplete'],
    ['main_count', 1, 51, 20, 'invalid'],
    ['cheer_count', 1, 50, 19, 'incomplete'],
    ['cheer_count', 1, 50, 21, 'invalid'],
  ] as const)(
    'reports %s for counts %i/%i/%i',
    (code, oshiCount, mainCount, cheerCount, status) => {
      const result = validateDeckLegality(
        deck([
          ...(oshiCount ? [entry(oshi.cardNumber, oshiCount)] : []),
          entry(unlimitedMain.cardNumber, mainCount),
          entry(cheer.cardNumber, cheerCount),
        ]),
        baseCards,
      )
      expect(result.status).toBe(status)
      expect(result.issues).toContainEqual(
        expect.objectContaining({ code, actual: expect.any(Number) }),
      )
    },
  )

  it('rejects total 71 when the zone breakdown is 1/49/21', () => {
    const result = validateDeckLegality(
      deck([
        entry(oshi.cardNumber, 1),
        entry(unlimitedMain.cardNumber, 49),
        entry(cheer.cardNumber, 21),
      ]),
      baseCards,
    )
    expect(result.totalCount).toBe(71)
    expect(result.status).toBe('invalid')
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'main_count',
      'cheer_count',
    ])
  })

  it('does not enforce color matching', () => {
    const redUnlimited = card('RED-MAIN', 'holomem', {
      colors: ['red'],
      deckLimit: null,
    })
    expect(
      validateDeckLegality(
        deck([
          entry(oshi.cardNumber, 1),
          entry(redUnlimited.cardNumber, 50),
          entry(cheer.cardNumber, 20),
        ]),
        [oshi, redUnlimited, cheer],
      ).isLegal,
    ).toBe(true)
  })
})

describe('validateDeckLegality copy limits', () => {
  it('accepts four copies of a regular Main card and rejects five', () => {
    const four = validateDeckLegality(
      deck([
        entry(oshi.cardNumber, 1),
        entry(main.cardNumber, 4),
        entry(unlimitedMain.cardNumber, 46),
        entry(cheer.cardNumber, 20),
      ]),
      baseCards,
    )
    const five = validateDeckLegality(
      deck([
        entry(oshi.cardNumber, 1),
        entry(main.cardNumber, 5),
        entry(unlimitedMain.cardNumber, 45),
        entry(cheer.cardNumber, 20),
      ]),
      baseCards,
    )
    expect(four.isLegal).toBe(true)
    expect(five.issues).toContainEqual({
      code: 'copy_limit',
      cardNumber: main.cardNumber,
      actual: 5,
      max: 4,
    })
  })

  it('uses one logical cardNumber quantity regardless of printing variants', () => {
    const result = validateDeckLegality(
      deck([
        entry(oshi.cardNumber, 1),
        entry(main.cardNumber, 4),
        entry(unlimitedMain.cardNumber, 46),
        entry(cheer.cardNumber, 20),
      ]),
      baseCards,
    )
    expect(result.isLegal).toBe(true)
    expect(deck(legalEntries()).entries[0]).not.toHaveProperty('officialId')
  })

  it('treats null deckLimit as unlimited and supports numeric overrides', () => {
    const sixLimit = card('MAIN-SIX', 'support', { deckLimit: 6 })
    expect(getMainCardCopyLimit(unlimitedMain)).toEqual({
      max: null,
      issueCode: 'copy_limit',
    })
    expect(getMainCardCopyLimit(sixLimit).max).toBe(6)

    const six = validateDeckLegality(
      deck([
        entry(oshi.cardNumber, 1),
        entry(sixLimit.cardNumber, 6),
        entry(unlimitedMain.cardNumber, 44),
        entry(cheer.cardNumber, 20),
      ]),
      [...baseCards, sixLimit],
    )
    const seven = validateDeckLegality(
      deck([
        entry(oshi.cardNumber, 1),
        entry(sixLimit.cardNumber, 7),
        entry(unlimitedMain.cardNumber, 43),
        entry(cheer.cardNumber, 20),
      ]),
      [...baseCards, sixLimit],
    )
    expect(six.isLegal).toBe(true)
    expect(seven.issues).toContainEqual({
      code: 'copy_limit',
      cardNumber: sixLimit.cardNumber,
      actual: 7,
      max: 6,
    })
  })

  it.each([
    ['hBP01-030', 'IRyS'],
    ['hBP07-101', 'ASMRマイク'],
  ])('applies the current restriction to %s', (cardNumber, name) => {
    const restricted = card(cardNumber, 'support', { name })
    const one = validateDeckLegality(
      deck([
        entry(oshi.cardNumber, 1),
        entry(restricted.cardNumber, 1),
        entry(unlimitedMain.cardNumber, 49),
        entry(cheer.cardNumber, 20),
      ]),
      [...baseCards, restricted],
    )
    const two = validateDeckLegality(
      deck([
        entry(oshi.cardNumber, 1),
        entry(restricted.cardNumber, 2),
        entry(unlimitedMain.cardNumber, 48),
        entry(cheer.cardNumber, 20),
      ]),
      [...baseCards, restricted],
    )
    expect(one.isLegal).toBe(true)
    expect(two.issues).toContainEqual({
      code: 'restricted_card',
      cardNumber,
      actual: 2,
      max: 1,
    })
  })

  it('uses the strictest limit when a card-specific and current restriction overlap', () => {
    const restricted = card('hBP01-030', 'holomem', { deckLimit: 3 })
    expect(getMainCardCopyLimit(restricted)).toEqual({
      max: 1,
      issueCode: 'restricted_card',
    })
    expect(CURRENT_DECK_RESTRICTIONS).toEqual([
      expect.objectContaining({
        cardNumber: 'hBP01-030',
        maxCopies: 1,
        effectiveFrom: '2026-06-19',
      }),
      expect.objectContaining({
        cardNumber: 'hBP07-101',
        maxCopies: 1,
        effectiveFrom: '2026-06-19',
      }),
    ])
  })

  it('does not infer a one-copy rule from LIMITED', () => {
    const limited = card('LIMITED-001', 'support', { isLimited: true })
    const result = validateDeckLegality(
      deck([
        entry(oshi.cardNumber, 1),
        entry(limited.cardNumber, 4),
        entry(unlimitedMain.cardNumber, 46),
        entry(cheer.cardNumber, 20),
      ]),
      [...baseCards, limited],
    )
    expect(result.isLegal).toBe(true)
  })

  it('allows all 20 Cheer cards to share one cardNumber', () => {
    expect(validateDeckLegality(deck(legalEntries()), baseCards).isLegal).toBe(
      true,
    )
  })
})

describe('validateDeckLegality issues', () => {
  it('keeps unknown entries, marks them invalid, and orders issues deterministically', () => {
    const input = deck([
      entry(oshi.cardNumber, 1),
      entry(unlimitedMain.cardNumber, 50),
      entry('UNKNOWN-001', 1),
      entry('UNKNOWN-002', 2),
      entry(cheer.cardNumber, 17),
    ])
    const before = structuredClone(input)
    const result = validateDeckLegality(input, baseCards)

    expect(result.status).toBe('invalid')
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'cheer_count',
      'unknown_card',
      'unknown_card',
    ])
    expect(result.issues[1]).toEqual({
      code: 'unknown_card',
      cardNumber: 'UNKNOWN-001',
      actual: 1,
    })
    expect(input).toEqual(before)
  })
})

describe('published deckLimit audit', () => {
  it('keeps the audited unlimited semantics of the production snapshot', () => {
    const data = cardsSnapshot as CardsDataFile
    const withDeckLimit = data.cards.filter((candidate) =>
      Object.hasOwn(candidate, 'deckLimit'),
    )

    expect(data.cards).toHaveLength(1270)
    expect(withDeckLimit).toHaveLength(68)
    expect(
      new Set(withDeckLimit.map((candidate) => candidate.deckLimit)),
    ).toEqual(new Set([null]))
    expect(
      withDeckLimit.find((candidate) => candidate.cardNumber === 'hBP01-024')
        ?.deckLimit,
    ).toBeNull()
  })
})
