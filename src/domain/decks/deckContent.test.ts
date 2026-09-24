import { describe, expect, it } from 'vitest'

import { deckContentEquals } from './deckContent'
import type { Deck } from './types'

function deck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'deck-1',
    name: 'デッキ A',
    entries: [
      { cardNumber: 'hBP04-042', quantity: 4 },
      { cardNumber: 'hBP04-043', quantity: 2 },
    ],
    createdAt: '2026-09-22T00:00:00.000Z',
    updatedAt: '2026-09-22T00:00:00.000Z',
    ...overrides,
  }
}

describe('comparing what the reporter edits', () => {
  it('treats the same name and cards as the same deck', () => {
    expect(deckContentEquals(deck(), deck())).toBe(true)
  })

  it('sees a renamed deck as different', () => {
    expect(deckContentEquals(deck(), deck({ name: 'デッキ B' }))).toBe(false)
  })

  it('sees a changed quantity as different', () => {
    expect(
      deckContentEquals(
        deck(),
        deck({
          entries: [
            { cardNumber: 'hBP04-042', quantity: 3 },
            { cardNumber: 'hBP04-043', quantity: 2 },
          ],
        }),
      ),
    ).toBe(false)
  })

  it('sees an added card as different', () => {
    expect(
      deckContentEquals(
        deck(),
        deck({
          entries: [
            ...deck().entries,
            { cardNumber: 'hBP04-044', quantity: 1 },
          ],
        }),
      ),
    ).toBe(false)
  })

  it('sees a swapped card as different', () => {
    expect(
      deckContentEquals(
        deck(),
        deck({
          entries: [
            { cardNumber: 'hBP04-042', quantity: 4 },
            { cardNumber: 'hBP04-099', quantity: 2 },
          ],
        }),
      ),
    ).toBe(false)
  })

  // Written by whichever device made the change, so a difference here says
  // nothing about the deck.
  it('ignores the timestamps', () => {
    expect(
      deckContentEquals(
        deck(),
        deck({
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2026-09-24T09:00:00.000Z',
        }),
      ),
    ).toBe(true)
  })

  // The id is what pairs two copies up rather than something to compare.
  it('ignores the id', () => {
    expect(deckContentEquals(deck(), deck({ id: 'deck-2' }))).toBe(true)
  })

  // Storage order, which the views sort anyway.
  it('ignores the order the cards are stored in', () => {
    expect(
      deckContentEquals(
        deck(),
        deck({
          entries: [
            { cardNumber: 'hBP04-043', quantity: 2 },
            { cardNumber: 'hBP04-042', quantity: 4 },
          ],
        }),
      ),
    ).toBe(true)
  })

  it('treats two empty decks with the same name as the same', () => {
    expect(
      deckContentEquals(deck({ entries: [] }), deck({ entries: [] })),
    ).toBe(true)
  })

  // Summing per card would make these look alike.
  it('does not let a stored duplicate hide a difference', () => {
    expect(
      deckContentEquals(
        deck({
          entries: [
            { cardNumber: 'hBP04-042', quantity: 2 },
            { cardNumber: 'hBP04-042', quantity: 2 },
          ],
        }),
        deck({
          entries: [
            { cardNumber: 'hBP04-042', quantity: 1 },
            { cardNumber: 'hBP04-042', quantity: 3 },
          ],
        }),
      ),
    ).toBe(false)
  })
})
