import type { Deck, DeckEntry } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIsoDateString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  )
}

function isDeckEntry(value: unknown): value is DeckEntry {
  return (
    isRecord(value) &&
    typeof value.cardNumber === 'string' &&
    value.cardNumber.trim().length > 0 &&
    Number.isSafeInteger(value.quantity) &&
    (value.quantity as number) >= 1
  )
}

export function isDeck(value: unknown): value is Deck {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    !Array.isArray(value.entries) ||
    !value.entries.every(isDeckEntry) ||
    !isIsoDateString(value.createdAt) ||
    !isIsoDateString(value.updatedAt) ||
    // Absent means ordinary construction. Any string is accepted, including an
    // id this build does not define: refusing one would turn a deck built for
    // a format that has since been removed into unreadable data, and saying
    // the definition is missing belongs to the screen showing it.
    (value.regulationId !== undefined && typeof value.regulationId !== 'string')
  ) {
    return false
  }
  const cardNumbers = value.entries.map((entry) => entry.cardNumber)
  return new Set(cardNumbers).size === cardNumbers.length
}
