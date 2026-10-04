import {
  createSemanticDataVersion,
  createTournamentResultId,
  stableSerialize,
} from './ids'
import type {
  TournamentEvent,
  TournamentPendingRecord,
  TournamentResult,
} from './types'

export type TournamentMergeResult = {
  events: TournamentEvent[]
  pending: TournamentPendingRecord[]
}

function pendingEvent(
  event: TournamentEvent,
  reason: 'source-conflict' | 'result-conflict',
): TournamentPendingRecord {
  return {
    id: `pending_${createSemanticDataVersion({ event, reason })}`,
    scope: 'event',
    reasonCodes: [reason],
    normalizedPayload: { kind: 'event', event },
  }
}

function pendingResult(
  event: TournamentEvent,
  result: TournamentResult,
): TournamentPendingRecord {
  return {
    id: `pending_${createSemanticDataVersion({ event: event.id, result })}`,
    scope: 'result',
    reasonCodes: ['result-conflict'],
    normalizedPayload: {
      kind: 'result',
      eventIdentity: { sourceEventId: event.source.sourceEventId },
      result,
    },
  }
}

function sameSource(left: TournamentEvent, right: TournamentEvent): boolean {
  return (
    left.source.sourceType === right.source.sourceType &&
    left.source.sourceEventId === right.source.sourceEventId
  )
}

function sameFixedIdentity(
  left: TournamentEvent,
  right: TournamentEvent,
): boolean {
  return (
    left.date === right.date &&
    left.tournament.type === right.tournament.type &&
    left.tournament.environment === right.tournament.environment &&
    left.tournament.round === right.tournament.round &&
    left.venue.slug === right.venue.slug
  )
}

function preservePublishedIdentity(
  existing: TournamentEvent,
  incoming: TournamentEvent,
): TournamentEvent {
  if (existing.id === incoming.id) return incoming
  return {
    ...incoming,
    id: existing.id,
    results: incoming.results.map((result) => ({
      ...result,
      id: createTournamentResultId(existing.id, result),
    })),
  }
}

function withoutSourceAndResults(event: TournamentEvent): unknown {
  return {
    tournament: event.tournament,
    date: event.date,
    venue: event.venue,
    participantCount: event.participantCount,
    resultCoverage: event.resultCoverage,
  }
}

function mergeSameSourceEvent(
  existing: TournamentEvent,
  incoming: TournamentEvent,
  pending: TournamentPendingRecord[],
): TournamentEvent {
  const results = new Map(existing.results.map((result) => [result.id, result]))
  for (const result of incoming.results) {
    const sameId = results.get(result.id)
    const rankCollision = [...results.values()].find(
      (candidate) =>
        candidate.rank === result.rank && candidate.id !== result.id,
    )
    const correctedRankCollision = sameId
      ? [...results.values()].find(
          (candidate) =>
            candidate.rank === result.rank && candidate.id !== sameId.id,
        )
      : undefined
    if (rankCollision || correctedRankCollision) {
      pending.push(pendingResult(incoming, result))
      continue
    }
    results.set(result.id, result)
  }
  return {
    ...existing,
    tournament: incoming.tournament,
    date: incoming.date,
    venue: incoming.venue,
    participantCount:
      incoming.participantCount === undefined
        ? existing.participantCount
        : incoming.participantCount,
    resultCoverage: incoming.resultCoverage,
    results: [...results.values()].sort(
      (left, right) =>
        left.rank - right.rank || left.id.localeCompare(right.id),
    ),
    source: incoming.source,
  }
}

export function mergeTournamentEvents(
  existingEvents: readonly TournamentEvent[],
  incomingEvents: readonly TournamentEvent[],
): TournamentMergeResult {
  const merged = new Map(existingEvents.map((event) => [event.id, event]))
  const pending: TournamentPendingRecord[] = []

  for (const incoming of incomingEvents) {
    const existingById = merged.get(incoming.id)
    const existingBySource = incoming.source.sourceEventId
      ? [...merged.values()].find((candidate) =>
          sameSource(candidate, incoming),
        )
      : undefined
    const existing = existingById ?? existingBySource
    if (!existing) {
      merged.set(incoming.id, incoming)
      continue
    }
    if (sameSource(existing, incoming)) {
      const stableIncoming = preservePublishedIdentity(existing, incoming)
      merged.set(
        existing.id,
        mergeSameSourceEvent(existing, stableIncoming, pending),
      )
      continue
    }
    if (!sameFixedIdentity(existing, incoming)) {
      pending.push(pendingEvent(incoming, 'source-conflict'))
      continue
    }
    if (!sameSource(existing, incoming)) {
      const semanticallySame =
        stableSerialize(withoutSourceAndResults(existing)) ===
          stableSerialize(withoutSourceAndResults(incoming)) &&
        stableSerialize(existing.results) === stableSerialize(incoming.results)
      if (!semanticallySame) {
        pending.push(pendingEvent(incoming, 'source-conflict'))
      }
      continue
    }
  }

  return {
    events: [...merged.values()].sort(
      (left, right) =>
        right.date.localeCompare(left.date) || left.id.localeCompare(right.id),
    ),
    pending,
  }
}
