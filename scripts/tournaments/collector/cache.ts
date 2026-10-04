import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { Card } from '../../../src/domain/cards/types'
import { getDeckZone } from '../../../src/domain/decks/legality'
import { DECK_ZONE_COUNTS } from '../../../src/domain/decks/restrictions'
import type { TournamentDeck } from '../../../src/domain/tournaments/types'

export const COLLECTOR_PARSER_VERSION = 1

type DeckCacheRecord = {
  parserVersion: number
  deckCode: string
  deck: TournamentDeck
}

export type EventCacheRecord = {
  parserVersion: number
  sourceEventId: string
  sourceUrl: string
  collectedAt: string
  deckLogCodes: string[]
}

export type CollectorCacheOptions = {
  root?: string
  refresh?: boolean
}

type DeckZone = keyof TournamentDeck

export type DeckValidationIssue =
  | { type: 'malformed-entry'; zone: DeckZone; index: number }
  | { type: 'duplicate'; zone: DeckZone; cardNumber: string }
  | {
      type: 'invalid-total'
      zone: DeckZone
      expected: number
      actual: number
    }
  | { type: 'unknown-card'; cardNumber: string; expectedZone: DeckZone }
  | {
      type: 'zone-mismatch'
      cardNumber: string
      deckZone: DeckZone
      catalogZone: DeckZone
    }

export type DeckValidationDiagnostic = {
  valid: boolean
  issues: DeckValidationIssue[]
}

function safeName(value: string): string {
  return encodeURIComponent(value).replaceAll('%', '_')
}

function deckPath(root: string, deckCode: string): string {
  return resolve(root, 'decks', `${safeName(deckCode)}.json`)
}

function eventPath(root: string, sourceEventId: string): string {
  return resolve(root, 'events', `${safeName(sourceEventId)}.json`)
}

function isDeckShape(value: unknown): value is TournamentDeck {
  if (!value || typeof value !== 'object') return false
  const input = value as Partial<TournamentDeck>
  return (['oshi', 'main', 'cheer'] as const).every(
    (zone) =>
      Array.isArray(input[zone]) &&
      input[zone].every(
        (entry) =>
          typeof entry?.cardNumber === 'string' &&
          Number.isSafeInteger(entry.quantity) &&
          entry.quantity > 0,
      ),
  )
}

export function diagnoseDeckValidation(
  deck: TournamentDeck,
  cards: readonly Card[],
): DeckValidationDiagnostic {
  const cardsByNumber = new Map(cards.map((card) => [card.cardNumber, card]))
  const expected = {
    oshi: DECK_ZONE_COUNTS.oshi,
    main: DECK_ZONE_COUNTS.main,
    cheer: DECK_ZONE_COUNTS.cheer,
  }
  const issues: DeckValidationIssue[] = []
  for (const zone of ['oshi', 'main', 'cheer'] as const) {
    const entries = deck[zone]
    const seen = new Set<string>()
    let actualTotal = 0
    entries.forEach((entry, index) => {
      if (
        !entry ||
        typeof entry.cardNumber !== 'string' ||
        !entry.cardNumber ||
        !Number.isSafeInteger(entry.quantity) ||
        entry.quantity < 1
      ) {
        issues.push({ type: 'malformed-entry', zone, index })
        return
      }
      actualTotal += entry.quantity
      if (seen.has(entry.cardNumber)) {
        issues.push({ type: 'duplicate', zone, cardNumber: entry.cardNumber })
      }
      seen.add(entry.cardNumber)
      const card = cardsByNumber.get(entry.cardNumber)
      if (!card) {
        issues.push({
          type: 'unknown-card',
          cardNumber: entry.cardNumber,
          expectedZone: zone,
        })
        return
      }
      const catalogZone = getDeckZone(card)
      if (catalogZone !== zone) {
        issues.push({
          type: 'zone-mismatch',
          cardNumber: entry.cardNumber,
          deckZone: zone,
          catalogZone,
        })
      }
    })
    if (actualTotal !== expected[zone]) {
      issues.push({
        type: 'invalid-total',
        zone,
        expected: expected[zone],
        actual: actualTotal,
      })
    }
  }
  return { valid: issues.length === 0, issues }
}

export function validateDeckForCache(
  deck: TournamentDeck,
  cards: readonly Card[],
): boolean {
  return diagnoseDeckValidation(deck, cards).valid
}

export async function loadCachedDeck(
  deckCode: string,
  options: CollectorCacheOptions = {},
): Promise<TournamentDeck | undefined> {
  if (options.refresh) return undefined
  const root = options.root ?? resolve('.cache/tournaments/collector')
  try {
    const parsed = JSON.parse(
      await readFile(deckPath(root, deckCode), 'utf8'),
    ) as Partial<DeckCacheRecord>
    if (
      parsed.parserVersion !== COLLECTOR_PARSER_VERSION ||
      parsed.deckCode !== deckCode ||
      !isDeckShape(parsed.deck)
    ) {
      return undefined
    }
    return parsed.deck
  } catch {
    return undefined
  }
}

export async function saveValidatedDeck(
  deckCode: string,
  deck: TournamentDeck,
  cards: readonly Card[],
  options: CollectorCacheOptions = {},
): Promise<void> {
  if (!validateDeckForCache(deck, cards)) {
    throw new Error(`Refusing to cache an invalid Deck Log deck: ${deckCode}`)
  }
  const root = options.root ?? resolve('.cache/tournaments/collector')
  const path = deckPath(root, deckCode)
  await mkdir(resolve(root, 'decks'), { recursive: true })
  await writeFile(
    path,
    `${JSON.stringify(
      { parserVersion: COLLECTOR_PARSER_VERSION, deckCode, deck },
      null,
      2,
    )}\n`,
    'utf8',
  )
}

export async function getOrCollectDeck(
  deckCode: string,
  collect: () => Promise<TournamentDeck>,
  cards: readonly Card[],
  options: CollectorCacheOptions = {},
): Promise<TournamentDeck> {
  const cached = await loadCachedDeck(deckCode, options)
  if (cached && validateDeckForCache(cached, cards)) return cached
  const deck = await collect()
  await saveValidatedDeck(deckCode, deck, cards, options)
  return deck
}

export async function saveEventCache(
  record: Omit<EventCacheRecord, 'parserVersion'>,
  options: CollectorCacheOptions = {},
): Promise<void> {
  const root = options.root ?? resolve('.cache/tournaments/collector')
  await mkdir(resolve(root, 'events'), { recursive: true })
  await writeFile(
    eventPath(root, record.sourceEventId),
    `${JSON.stringify(
      { parserVersion: COLLECTOR_PARSER_VERSION, ...record },
      null,
      2,
    )}\n`,
    'utf8',
  )
}
