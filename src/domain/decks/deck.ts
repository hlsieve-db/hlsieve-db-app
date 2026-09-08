import { DEFAULT_DECK_NAME } from './constants'
import type { Deck } from './types'

type DeckOperationOptions = {
  now?: () => string
}

type CreateDeckOptions = DeckOperationOptions & {
  id?: () => string
  name?: string
}

function isoNow(options?: DeckOperationOptions): string {
  return (options?.now ?? (() => new Date().toISOString()))()
}

function assertValidQuantity(quantity: number): void {
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new Error('Deck quantity must be a positive safe integer.')
  }
}

function assertCardNumber(cardNumber: string): void {
  if (!cardNumber.trim()) throw new Error('Card number must not be empty.')
}

function withUpdatedAt(deck: Deck, options?: DeckOperationOptions): Deck {
  return { ...deck, updatedAt: isoNow(options) }
}

export function createDeck(options: CreateDeckOptions = {}): Deck {
  const name = (options.name ?? DEFAULT_DECK_NAME).trim()
  if (!name) throw new Error('Deck name must not be empty.')
  const timestamp = isoNow(options)
  return {
    id: (options.id ?? (() => crypto.randomUUID()))(),
    name,
    entries: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function renameDeck(
  deck: Deck,
  name: string,
  options?: DeckOperationOptions,
): Deck {
  const trimmedName = name.trim()
  if (!trimmedName) throw new Error('Deck name must not be empty.')
  return withUpdatedAt({ ...deck, name: trimmedName }, options)
}

export function addCardToDeck(
  deck: Deck,
  cardNumber: string,
  quantity = 1,
  options?: DeckOperationOptions,
): Deck {
  assertCardNumber(cardNumber)
  assertValidQuantity(quantity)
  const index = deck.entries.findIndex(
    (entry) => entry.cardNumber === cardNumber,
  )
  if (index < 0) {
    return withUpdatedAt(
      { ...deck, entries: [...deck.entries, { cardNumber, quantity }] },
      options,
    )
  }
  const current = deck.entries[index]!
  const nextQuantity = current.quantity + quantity
  assertValidQuantity(nextQuantity)
  const entries = deck.entries.map((entry, entryIndex) =>
    entryIndex === index ? { ...entry, quantity: nextQuantity } : entry,
  )
  return withUpdatedAt({ ...deck, entries }, options)
}

export function setCardQuantity(
  deck: Deck,
  cardNumber: string,
  quantity: number,
  options?: DeckOperationOptions,
): Deck {
  assertCardNumber(cardNumber)
  if (quantity === 0) return removeCardFromDeck(deck, cardNumber, options)
  assertValidQuantity(quantity)
  if (!deck.entries.some((entry) => entry.cardNumber === cardNumber)) {
    throw new Error('Deck entry was not found.')
  }
  const entries = deck.entries.map((entry) =>
    entry.cardNumber === cardNumber ? { ...entry, quantity } : entry,
  )
  return withUpdatedAt({ ...deck, entries }, options)
}

export function incrementCardQuantity(
  deck: Deck,
  cardNumber: string,
  options?: DeckOperationOptions,
): Deck {
  const entry = deck.entries.find((item) => item.cardNumber === cardNumber)
  if (!entry) throw new Error('Deck entry was not found.')
  return setCardQuantity(deck, cardNumber, entry.quantity + 1, options)
}

export function decrementCardQuantity(
  deck: Deck,
  cardNumber: string,
  options?: DeckOperationOptions,
): Deck {
  const entry = deck.entries.find((item) => item.cardNumber === cardNumber)
  if (!entry) throw new Error('Deck entry was not found.')
  return setCardQuantity(deck, cardNumber, entry.quantity - 1, options)
}

export function removeCardFromDeck(
  deck: Deck,
  cardNumber: string,
  options?: DeckOperationOptions,
): Deck {
  assertCardNumber(cardNumber)
  if (!deck.entries.some((entry) => entry.cardNumber === cardNumber)) {
    throw new Error('Deck entry was not found.')
  }
  return withUpdatedAt(
    {
      ...deck,
      entries: deck.entries.filter((entry) => entry.cardNumber !== cardNumber),
    },
    options,
  )
}

export function getDeckTotal(deck: Deck): number {
  return deck.entries.reduce((total, entry) => total + entry.quantity, 0)
}
