import type {
  TournamentDeck,
  TournamentEventIdentity,
  TournamentImportEvent,
  TournamentImportPayload,
  TournamentImportResult,
  TournamentResultCoverage,
  TournamentSeries,
  TournamentSourceMetadata,
  TournamentVenue,
} from './types'

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }
  return value as Record<string, unknown>
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string.`)
  return value.trim()
}

function optionalString(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : string(value, label)
}

function number(value: unknown, label: string): number {
  if (typeof value !== 'number') throw new Error(`${label} must be a number.`)
  return value
}

function series(value: unknown): TournamentSeries {
  const input = record(value, 'tournament')
  return {
    type: string(input.type, 'tournament.type').toLowerCase(),
    round: optionalString(input.round, 'tournament.round')?.toLowerCase(),
    seriesName: string(input.seriesName, 'tournament.seriesName'),
  }
}

function venue(value: unknown): TournamentVenue {
  const input = record(value, 'venue')
  return {
    slug: string(input.slug, 'venue.slug').toLowerCase(),
    name: string(input.name, 'venue.name'),
    prefecture: optionalString(input.prefecture, 'venue.prefecture'),
  }
}

function coverage(value: unknown): TournamentResultCoverage {
  const input = record(value, 'resultCoverage')
  const kind = string(input.kind, 'resultCoverage.kind')
  if (kind === 'exact') {
    return { kind, maxRank: number(input.maxRank, 'resultCoverage.maxRank') }
  }
  if (kind === 'winner-only' || kind === 'variable') return { kind }
  throw new Error('resultCoverage.kind is invalid.')
}

function entries(value: unknown, label: string) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`)
  return value.map((entry, index) => {
    const input = record(entry, `${label}[${index}]`)
    return {
      cardNumber: string(input.cardNumber, `${label}[${index}].cardNumber`),
      quantity: number(input.quantity, `${label}[${index}].quantity`),
    }
  })
}

function deck(value: unknown): TournamentDeck {
  const input = record(value, 'deck')
  return {
    oshi: entries(input.oshi, 'deck.oshi'),
    main: entries(input.main, 'deck.main'),
    cheer: entries(input.cheer, 'deck.cheer'),
  }
}

function source(value: unknown): TournamentSourceMetadata {
  const input = record(value, 'source')
  return {
    sourceType: string(input.sourceType, 'source.sourceType'),
    sourceEventId: optionalString(input.sourceEventId, 'source.sourceEventId'),
    sourceUrl: optionalString(input.sourceUrl, 'source.sourceUrl'),
  }
}

function identity(value: unknown): TournamentEventIdentity {
  const input = record(value, 'identity')
  const occurrenceInput =
    input.occurrence === undefined
      ? undefined
      : record(input.occurrence, 'identity.occurrence')
  const occurrenceKind = occurrenceInput
    ? string(occurrenceInput.kind, 'identity.occurrence.kind')
    : undefined
  if (
    occurrenceKind !== undefined &&
    occurrenceKind !== 'published-time' &&
    occurrenceKind !== 'published-session' &&
    occurrenceKind !== 'stable-discriminator'
  ) {
    throw new Error('identity.occurrence.kind is invalid.')
  }
  return {
    sourceEventId: optionalString(
      input.sourceEventId,
      'identity.sourceEventId',
    ),
    occurrence:
      occurrenceInput && occurrenceKind
        ? {
            kind: occurrenceKind,
            value: string(occurrenceInput.value, 'identity.occurrence.value'),
          }
        : undefined,
  }
}

function result(value: unknown): TournamentImportResult {
  const input = record(value, 'result')
  return {
    sourceResultId: optionalString(
      input.sourceResultId,
      'result.sourceResultId',
    ),
    rank: number(input.rank, 'result.rank'),
    oshiCardNumber: string(input.oshiCardNumber, 'result.oshiCardNumber'),
    deckLogCode: optionalString(input.deckLogCode, 'result.deckLogCode'),
    deck: deck(input.deck),
  }
}

function event(value: unknown): TournamentImportEvent {
  const input = record(value, 'event')
  if (!Array.isArray(input.results))
    throw new Error('event.results must be an array.')
  return {
    identity: identity(input.identity),
    tournament: series(input.tournament),
    date: string(input.date, 'event.date'),
    venue: venue(input.venue),
    participantCount:
      input.participantCount === undefined
        ? undefined
        : number(input.participantCount, 'event.participantCount'),
    resultCoverage: coverage(input.resultCoverage),
    results: input.results.map(result),
    source: source(input.source),
  }
}

/**
 * Constructs the normalized contract from untrusted collector output.
 * Unknown fields, including player names, are deliberately not copied.
 */
export function normalizeTournamentImportPayload(
  value: unknown,
): TournamentImportPayload {
  const input = record(value, 'payload')
  const collector = record(input.collector, 'collector')
  if (!Array.isArray(input.events)) throw new Error('events must be an array.')
  if (
    input.format !== 'hlsieve-tournament-import' ||
    input.formatVersion !== 1
  ) {
    throw new Error('Unsupported Tournament import format.')
  }
  return {
    format: 'hlsieve-tournament-import',
    formatVersion: 1,
    collectedAt: string(input.collectedAt, 'collectedAt'),
    collector: {
      type: string(collector.type, 'collector.type'),
      version: optionalString(collector.version, 'collector.version'),
    },
    events: input.events.map(event),
  }
}
