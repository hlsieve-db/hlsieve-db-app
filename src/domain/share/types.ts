import type { DeckEntry } from '../decks/types'

export type SharedDeckPayloadV1 = {
  v: 1
  name: string
  entries: DeckEntry[]
}

export type DeckShareDecodeErrorCode =
  | 'invalid_encoding'
  | 'invalid_utf8'
  | 'invalid_json'
  | 'invalid_payload'
  | 'unsupported_version'
  | 'payload_too_large'

export type DeckShareDecodeResult =
  | { ok: true; value: SharedDeckPayloadV1 }
  | {
      ok: false
      error: { code: DeckShareDecodeErrorCode }
    }
