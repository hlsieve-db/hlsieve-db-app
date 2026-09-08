import { describe, expect, it } from 'vitest'

import {
  addCardToDeck,
  createDeck,
  decrementCardQuantity,
  getDeckTotal,
  incrementCardQuantity,
  removeCardFromDeck,
  renameDeck,
  setCardQuantity,
} from './deck'
import type { Deck } from './types'
import { isDeck } from './validation'

const firstTimestamp = '2026-09-08T00:00:00.000Z'
const secondTimestamp = '2026-09-08T00:01:00.000Z'
const now = () => secondTimestamp

function deck(): Deck {
  return {
    id: 'deck-1',
    name: 'テストデッキ',
    entries: [
      { cardNumber: 'CARD-001', quantity: 2 },
      { cardNumber: 'CARD-002', quantity: 1 },
    ],
    createdAt: firstTimestamp,
    updatedAt: firstTimestamp,
  }
}

describe('deck domain operations', () => {
  it('creates a deck with a stable generated ID and timestamps', () => {
    expect(
      createDeck({ id: () => 'generated-id', now: () => firstTimestamp }),
    ).toEqual({
      id: 'generated-id',
      name: '無題のデッキ',
      entries: [],
      createdAt: firstTimestamp,
      updatedAt: firstTimestamp,
    })
  })

  it('trims a renamed deck without mutating the input', () => {
    const input = deck()
    const renamed = renameDeck(input, '  新しい名前  ', { now })

    expect(renamed.name).toBe('新しい名前')
    expect(renamed.updatedAt).toBe(secondTimestamp)
    expect(input.name).toBe('テストデッキ')
    expect(renamed).not.toBe(input)
  })

  it('rejects an empty rename', () => {
    expect(() => renameDeck(deck(), '   ')).toThrow('must not be empty')
  })

  it('adds a first card at the end in insertion order', () => {
    const input = createDeck({
      id: () => 'deck-1',
      now: () => firstTimestamp,
    })
    const added = addCardToDeck(input, 'CARD-002', 1, { now })

    expect(added.entries).toEqual([{ cardNumber: 'CARD-002', quantity: 1 }])
    expect(input.entries).toEqual([])
  })

  it('increments an existing logical card without duplicating it', () => {
    const input = deck()
    const added = addCardToDeck(input, 'CARD-001', 3, { now })

    expect(added.entries).toEqual([
      { cardNumber: 'CARD-001', quantity: 5 },
      { cardNumber: 'CARD-002', quantity: 1 },
    ])
    expect(input.entries[0]?.quantity).toBe(2)
  })

  it('increments and decrements without changing entry order', () => {
    const input = deck()
    const incremented = incrementCardQuantity(input, 'CARD-002', { now })
    const decremented = decrementCardQuantity(incremented, 'CARD-001', {
      now,
    })

    expect(decremented.entries).toEqual([
      { cardNumber: 'CARD-001', quantity: 1 },
      { cardNumber: 'CARD-002', quantity: 2 },
    ])
  })

  it('removes an entry when decrement reaches zero', () => {
    expect(decrementCardQuantity(deck(), 'CARD-002', { now }).entries).toEqual([
      { cardNumber: 'CARD-001', quantity: 2 },
    ])
  })

  it('sets quantity and removes a card immutably', () => {
    const input = deck()
    expect(
      setCardQuantity(input, 'CARD-001', 4, { now }).entries[0]?.quantity,
    ).toBe(4)
    expect(removeCardFromDeck(input, 'CARD-001', { now }).entries).toEqual([
      { cardNumber: 'CARD-002', quantity: 1 },
    ])
    expect(input.entries).toHaveLength(2)
  })

  it('returns the sum without applying legality rules', () => {
    expect(getDeckTotal(deck())).toBe(3)
  })

  it.each([NaN, Infinity, -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid add quantity %s',
    (quantity) => {
      expect(() => addCardToDeck(deck(), 'CARD-003', quantity)).toThrow(
        'positive safe integer',
      )
    },
  )

  it('puts a removed and re-added card at the end', () => {
    const removed = removeCardFromDeck(deck(), 'CARD-001', { now })
    const readded = addCardToDeck(removed, 'CARD-001', 1, { now })
    expect(readded.entries.map((entry) => entry.cardNumber)).toEqual([
      'CARD-002',
      'CARD-001',
    ])
  })
})

describe('deck persistence validation', () => {
  it('accepts a valid deck and forward-compatible extra keys', () => {
    expect(isDeck({ ...deck(), futureField: true })).toBe(true)
  })

  it.each([
    { ...deck(), id: '' },
    { ...deck(), name: ' ' },
    { ...deck(), entries: [{ cardNumber: 'CARD-001', quantity: 0 }] },
    { ...deck(), entries: [{ cardNumber: 'CARD-001', quantity: 1.5 }] },
    {
      ...deck(),
      entries: [
        { cardNumber: 'CARD-001', quantity: 1 },
        { cardNumber: 'CARD-001', quantity: 2 },
      ],
    },
    { ...deck(), createdAt: 'not-a-date' },
  ])('rejects malformed persisted records', (value) => {
    expect(isDeck(value)).toBe(false)
  })
})
