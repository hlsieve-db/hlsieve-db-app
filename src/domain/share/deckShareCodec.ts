import { DECK_NAME_MAX_LENGTH } from '../decks/constants'
import { createDeck } from '../decks/deck'
import type { Deck } from '../decks/types'
import { isDeck } from '../decks/validation'
import type {
  DeckShareDecodeErrorCode,
  DeckShareDecodeResult,
  SharedDeckPayloadV1,
} from './types'

export const SHARED_DECK_FORMAT_VERSION = 1
export const MAX_SHARED_DECK_ENCODED_LENGTH = 16_384
export const MAX_SHARED_DECK_JSON_LENGTH = 12_000
export const MAX_SHARED_DECK_ENTRIES = 200
export const MAX_SHARED_CARD_NUMBER_LENGTH = 100

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actualKeys = Object.keys(value).sort()
  return (
    actualKeys.length === keys.length &&
    keys.every((key, index) => actualKeys[index] === key)
  )
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  return bytesToBase64Url(bytes)
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

function decodeBase64Url(encoded: string): Uint8Array | undefined {
  if (
    !encoded ||
    !/^[A-Za-z0-9_-]+$/u.test(encoded) ||
    encoded.length % 4 === 1
  ) {
    return undefined
  }
  try {
    const base64 = encoded.replaceAll('-', '+').replaceAll('_', '/')
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    )
    return bytesToBase64Url(bytes) === encoded ? bytes : undefined
  } catch {
    return undefined
  }
}

function failure(code: DeckShareDecodeErrorCode): DeckShareDecodeResult {
  return { ok: false, error: { code } }
}

function validatePayload(value: unknown): DeckShareDecodeResult {
  if (!isRecord(value)) return failure('invalid_payload')
  if (!Object.hasOwn(value, 'v')) return failure('invalid_payload')
  if (value.v !== SHARED_DECK_FORMAT_VERSION) {
    return failure('unsupported_version')
  }
  if (!hasExactKeys(value, ['entries', 'name', 'v'])) {
    return failure('invalid_payload')
  }
  if (
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name !== value.name.trim() ||
    value.name.length > DECK_NAME_MAX_LENGTH ||
    !Array.isArray(value.entries) ||
    value.entries.length > MAX_SHARED_DECK_ENTRIES
  ) {
    return failure('invalid_payload')
  }

  const cardNumbers = new Set<string>()
  for (const entry of value.entries) {
    if (
      !isRecord(entry) ||
      !hasExactKeys(entry, ['cardNumber', 'quantity']) ||
      typeof entry.cardNumber !== 'string' ||
      !entry.cardNumber.trim() ||
      entry.cardNumber !== entry.cardNumber.trim() ||
      entry.cardNumber.length > MAX_SHARED_CARD_NUMBER_LENGTH ||
      !Number.isSafeInteger(entry.quantity) ||
      (entry.quantity as number) < 1 ||
      cardNumbers.has(entry.cardNumber)
    ) {
      return failure('invalid_payload')
    }
    cardNumbers.add(entry.cardNumber)
  }

  return {
    ok: true,
    value: {
      v: SHARED_DECK_FORMAT_VERSION,
      name: value.name,
      entries: value.entries.map((entry) => ({
        cardNumber: (entry as Record<string, unknown>).cardNumber as string,
        quantity: (entry as Record<string, unknown>).quantity as number,
      })),
    },
  }
}

export function encodeDeckSharePayload(deck: Deck): string {
  if (
    !isDeck(deck) ||
    deck.name !== deck.name.trim() ||
    deck.name.length > DECK_NAME_MAX_LENGTH ||
    deck.entries.length > MAX_SHARED_DECK_ENTRIES ||
    deck.entries.some(
      (entry) =>
        entry.cardNumber !== entry.cardNumber.trim() ||
        entry.cardNumber.length > MAX_SHARED_CARD_NUMBER_LENGTH,
    )
  ) {
    throw new Error('Deck cannot be encoded as a share payload.')
  }
  const payload: SharedDeckPayloadV1 = {
    v: SHARED_DECK_FORMAT_VERSION,
    name: deck.name,
    entries: deck.entries.map(({ cardNumber, quantity }) => ({
      cardNumber,
      quantity,
    })),
  }
  const json = JSON.stringify(payload)
  if (json.length > MAX_SHARED_DECK_JSON_LENGTH) {
    throw new Error('Deck share payload exceeds the technical size limit.')
  }
  const encoded = toBase64Url(json)
  if (encoded.length > MAX_SHARED_DECK_ENCODED_LENGTH) {
    throw new Error('Encoded deck share payload exceeds the technical limit.')
  }
  return encoded
}

export function decodeDeckSharePayload(encoded: string): DeckShareDecodeResult {
  if (encoded.length > MAX_SHARED_DECK_ENCODED_LENGTH) {
    return failure('payload_too_large')
  }
  const bytes = decodeBase64Url(encoded)
  if (!bytes) return failure('invalid_encoding')

  let json: string
  try {
    json = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return failure('invalid_utf8')
  }
  if (json.length > MAX_SHARED_DECK_JSON_LENGTH) {
    return failure('payload_too_large')
  }

  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    return failure('invalid_json')
  }
  return validatePayload(value)
}

export function buildDeckShareUrl(deck: Deck, origin: string): string {
  const url = new URL('/deck/share', origin)
  url.searchParams.set('d', encodeDeckSharePayload(deck))
  return url.toString()
}

export function createDeckFromSharedPayload(
  payload: SharedDeckPayloadV1,
  options: { id?: () => string; now?: () => string } = {},
): Deck {
  const created = createDeck({
    id: options.id,
    now: options.now,
    name: payload.name,
  })
  return {
    ...created,
    entries: payload.entries.map((entry) => ({ ...entry })),
  }
}
