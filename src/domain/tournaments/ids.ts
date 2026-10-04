import type {
  TournamentDeck,
  TournamentImportEvent,
  TournamentImportResult,
} from './types'

function stableHash(value: string): string {
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x85ebca6b)
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0)
    .toString(16)
    .padStart(8, '0')}`
}

function normalizedEntries(deck: TournamentDeck): string {
  return (['oshi', 'main', 'cheer'] as const)
    .flatMap((zone) =>
      [...deck[zone]]
        .sort((left, right) => left.cardNumber.localeCompare(right.cardNumber))
        .map((entry) => `${zone}:${entry.cardNumber}:${entry.quantity}`),
    )
    .join('|')
}

export function createTournamentEventId(event: TournamentImportEvent): string {
  const discriminator = event.identity.sourceEventId
    ? `source:${event.identity.sourceEventId.trim()}`
    : event.identity.occurrence
      ? `${event.identity.occurrence.kind}:${event.identity.occurrence.value.trim()}`
      : ''
  if (!discriminator || discriminator.endsWith(':')) {
    throw new Error('Tournament event identity is ambiguous.')
  }
  const identity = event.identity.sourceEventId
    ? [discriminator]
    : [
        event.date,
        event.tournament.type,
        event.tournament.environment ?? '',
        event.tournament.round ?? '',
        event.venue.slug,
        discriminator,
      ]
  return `evt_${stableHash(identity.join('\n'))}`
}

export function createTournamentResultId(
  eventId: string,
  result: TournamentImportResult,
): string {
  const sourceResultId = result.sourceResultId?.trim()
  const deckLogCode = result.deckLogCode?.trim()
  const identity = sourceResultId
    ? `source:${sourceResultId}`
    : deckLogCode
      ? `deck-log:${deckLogCode}`
      : normalizedEntries(result.deck)
        ? `deck:${stableHash(normalizedEntries(result.deck))}`
        : ''
  if (!identity) throw new Error('Tournament result identity is ambiguous.')
  return `res_${stableHash(`${eventId}\n${identity}`)}`
}

export function createSemanticDataVersion(value: unknown): string {
  return stableHash(stableSerialize(value))
}

export function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}
