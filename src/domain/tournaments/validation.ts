import type { Card } from '../cards/types'
import { getDeckZone } from '../decks/legality'
import { DECK_ZONE_COUNTS } from '../decks/restrictions'
import { TOURNAMENT_DATA_START_DATE } from './constants'
import {
  createSemanticDataVersion,
  createTournamentEventId,
  createTournamentResultId,
} from './ids'
import type {
  TournamentDeck,
  TournamentEvent,
  TournamentEventIdentity,
  TournamentImportEvent,
  TournamentImportPayload,
  TournamentImportResult,
  TournamentPendingReason,
  TournamentPendingRecord,
  TournamentResult,
} from './types'

export type TournamentValidationResult = {
  events: TournamentEvent[]
  pending: TournamentPendingRecord[]
}

function pendingId(value: unknown): string {
  return `pending_${createSemanticDataVersion(value)}`
}

function eventPending(
  event: TournamentImportEvent | TournamentEvent,
  reasons: TournamentPendingReason[],
): TournamentPendingRecord {
  return {
    id: pendingId({ scope: 'event', event, reasons }),
    scope: 'event',
    reasonCodes: [...new Set(reasons)].sort(),
    normalizedPayload: { kind: 'event', event },
  }
}

function resultPending(
  eventIdentity: TournamentEventIdentity,
  result: TournamentImportResult | TournamentResult,
  reasons: TournamentPendingReason[],
): TournamentPendingRecord {
  return {
    id: pendingId({ scope: 'result', eventIdentity, result, reasons }),
    scope: 'result',
    reasonCodes: [...new Set(reasons)].sort(),
    normalizedPayload: { kind: 'result', eventIdentity, result },
  }
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
}

function isSlug(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(value)
}

function eventReasons(event: TournamentImportEvent): TournamentPendingReason[] {
  const invalid =
    !isDate(event.date) ||
    event.date < TOURNAMENT_DATA_START_DATE ||
    !isSlug(event.tournament.type) ||
    (event.tournament.environment !== undefined &&
      !isSlug(event.tournament.environment)) ||
    (event.tournament.round !== undefined && !isSlug(event.tournament.round)) ||
    !event.tournament.seriesName ||
    !isSlug(event.venue.slug) ||
    !event.venue.name ||
    !event.source.sourceType ||
    (event.participantCount !== undefined &&
      (!Number.isSafeInteger(event.participantCount) ||
        event.participantCount < 1)) ||
    (event.resultCoverage.kind === 'exact' &&
      (!Number.isSafeInteger(event.resultCoverage.maxRank) ||
        event.resultCoverage.maxRank < 1))
  return invalid ? ['invalid-event'] : []
}

function deckReasons(
  deck: TournamentDeck,
  cardsByNumber: ReadonlyMap<string, Card>,
): TournamentPendingReason[] {
  const reasons = new Set<TournamentPendingReason>()
  const all = (['oshi', 'main', 'cheer'] as const).flatMap((zone) =>
    deck[zone].map((entry) => ({ zone, entry })),
  )
  const cardNumbers = all.map(({ entry }) => entry.cardNumber)
  if (new Set(cardNumbers).size !== cardNumbers.length) {
    reasons.add('duplicate-deck-card')
  }
  for (const { zone, entry } of all) {
    if (!Number.isSafeInteger(entry.quantity) || entry.quantity < 1) {
      reasons.add('invalid-quantity')
    }
    const card = cardsByNumber.get(entry.cardNumber)
    if (!card) {
      reasons.add('unknown-card')
      continue
    }
    if (getDeckZone(card) !== zone) reasons.add('wrong-deck-zone')
  }
  const quantity = (zone: keyof TournamentDeck) =>
    deck[zone].reduce((total, entry) => total + entry.quantity, 0)
  if (
    quantity('oshi') !== DECK_ZONE_COUNTS.oshi ||
    quantity('main') !== DECK_ZONE_COUNTS.main ||
    quantity('cheer') !== DECK_ZONE_COUNTS.cheer
  ) {
    reasons.add('wrong-deck-counts')
  }
  return [...reasons]
}

function validateResult(
  eventId: string,
  event: TournamentImportEvent,
  result: TournamentImportResult,
  cardsByNumber: ReadonlyMap<string, Card>,
): { result?: TournamentResult; reasons: TournamentPendingReason[] } {
  const reasons = new Set<TournamentPendingReason>()
  if (!Number.isSafeInteger(result.rank) || result.rank < 1) {
    reasons.add('invalid-rank')
  }
  if (
    (event.resultCoverage.kind === 'winner-only' && result.rank !== 1) ||
    (event.resultCoverage.kind === 'exact' &&
      result.rank > event.resultCoverage.maxRank)
  ) {
    reasons.add('rank-outside-coverage')
  }
  for (const reason of deckReasons(result.deck, cardsByNumber)) {
    reasons.add(reason)
  }
  const oshi = cardsByNumber.get(result.oshiCardNumber)
  if (!oshi) reasons.add('unknown-card')
  const oshiEntry = result.deck.oshi.find(
    (entry) => entry.cardNumber === result.oshiCardNumber,
  )
  if (!oshiEntry || oshiEntry.quantity !== 1 || oshi?.cardType !== 'oshi') {
    reasons.add('oshi-mismatch')
  }
  let id = ''
  try {
    id = createTournamentResultId(eventId, result)
  } catch {
    reasons.add('ambiguous-result-identity')
  }
  if (reasons.size > 0) return { reasons: [...reasons] }
  return {
    reasons: [],
    result: {
      id,
      rank: result.rank,
      oshiCardNumber: result.oshiCardNumber,
      deckLogCode: result.deckLogCode?.trim() || undefined,
      deck: result.deck,
    },
  }
}

export function validateTournamentImportPayload(
  payload: TournamentImportPayload,
  cards: readonly Card[],
): TournamentValidationResult {
  const cardsByNumber = new Map(cards.map((card) => [card.cardNumber, card]))
  const events: TournamentEvent[] = []
  const pending: TournamentPendingRecord[] = []
  const seenEventIds = new Set<string>()

  for (const input of payload.events) {
    const baseReasons = eventReasons(input)
    let eventId = ''
    try {
      eventId = createTournamentEventId(input)
    } catch {
      baseReasons.push('ambiguous-event-identity')
    }
    if (eventId && seenEventIds.has(eventId)) {
      baseReasons.push('duplicate-event')
    }
    if (baseReasons.length > 0) {
      pending.push(eventPending(input, baseReasons))
      continue
    }
    seenEventIds.add(eventId)

    const candidates: Array<{
      input: TournamentImportResult
      result: TournamentResult
    }> = []
    for (const result of input.results) {
      const validated = validateResult(eventId, input, result, cardsByNumber)
      if (validated.result) {
        candidates.push({ input: result, result: validated.result })
      } else {
        pending.push(resultPending(input.identity, result, validated.reasons))
      }
    }
    const rankCounts = new Map<number, number>()
    const idCounts = new Map<string, number>()
    for (const candidate of candidates) {
      rankCounts.set(
        candidate.result.rank,
        (rankCounts.get(candidate.result.rank) ?? 0) + 1,
      )
      idCounts.set(
        candidate.result.id,
        (idCounts.get(candidate.result.id) ?? 0) + 1,
      )
    }
    const validResults: TournamentResult[] = []
    for (const candidate of candidates) {
      const reasons: TournamentPendingReason[] = []
      if ((rankCounts.get(candidate.result.rank) ?? 0) > 1) {
        reasons.push('duplicate-rank')
      }
      if ((idCounts.get(candidate.result.id) ?? 0) > 1) {
        reasons.push('duplicate-result')
      }
      if (reasons.length > 0) {
        pending.push(resultPending(input.identity, candidate.input, reasons))
      } else {
        validResults.push(candidate.result)
      }
    }
    if (validResults.length === 0) {
      pending.push(eventPending(input, ['no-valid-results']))
      continue
    }
    events.push({
      id: eventId,
      tournament: input.tournament,
      date: input.date,
      venue: input.venue,
      participantCount: input.participantCount,
      resultCoverage: input.resultCoverage,
      results: validResults.sort(
        (left, right) =>
          left.rank - right.rank || left.id.localeCompare(right.id),
      ),
      source: input.source,
    })
  }

  return {
    events: events.sort(
      (left, right) =>
        right.date.localeCompare(left.date) || left.id.localeCompare(right.id),
    ),
    pending,
  }
}
