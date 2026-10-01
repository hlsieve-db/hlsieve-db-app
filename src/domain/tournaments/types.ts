import type { DeckEntry } from '../decks/types'

export type TournamentSeries = {
  type: string
  round?: string
  seriesName: string
}

export type TournamentResultCoverage =
  | { kind: 'exact'; maxRank: number }
  | { kind: 'winner-only' }
  | { kind: 'variable' }

export type TournamentVenue = {
  slug: string
  name: string
  prefecture?: string
}

export type TournamentDeck = {
  oshi: DeckEntry[]
  main: DeckEntry[]
  cheer: DeckEntry[]
}

export type TournamentSourceMetadata = {
  sourceType: string
  sourceEventId?: string
  sourceUrl?: string
}

export type TournamentResult = {
  id: string
  rank: number
  oshiCardNumber: string
  deckLogCode?: string
  deck: TournamentDeck
}

export type TournamentEvent = {
  id: string
  tournament: TournamentSeries
  date: string
  venue: TournamentVenue
  participantCount?: number
  resultCoverage: TournamentResultCoverage
  results: TournamentResult[]
  source: TournamentSourceMetadata
}

export type TournamentEventIdentity = {
  sourceEventId?: string
  occurrence?: {
    kind: 'published-time' | 'published-session' | 'stable-discriminator'
    value: string
  }
}

export type TournamentImportResult = {
  sourceResultId?: string
  rank: number
  oshiCardNumber: string
  deckLogCode?: string
  deck: TournamentDeck
}

export type TournamentImportEvent = {
  identity: TournamentEventIdentity
  tournament: TournamentSeries
  date: string
  venue: TournamentVenue
  participantCount?: number
  resultCoverage: TournamentResultCoverage
  results: TournamentImportResult[]
  source: TournamentSourceMetadata
}

export type TournamentImportPayload = {
  format: 'hlsieve-tournament-import'
  formatVersion: 1
  collectedAt: string
  collector: {
    type: string
    version?: string
  }
  events: TournamentImportEvent[]
}

export type TournamentPendingReason =
  | 'invalid-event'
  | 'ambiguous-event-identity'
  | 'duplicate-event'
  | 'invalid-rank'
  | 'rank-outside-coverage'
  | 'duplicate-rank'
  | 'ambiguous-result-identity'
  | 'duplicate-result'
  | 'unknown-card'
  | 'invalid-quantity'
  | 'duplicate-deck-card'
  | 'wrong-deck-zone'
  | 'wrong-deck-counts'
  | 'oshi-mismatch'
  | 'no-valid-results'
  | 'source-conflict'
  | 'result-conflict'

export type TournamentNormalizedPendingPayload =
  | { kind: 'event'; event: TournamentImportEvent | TournamentEvent }
  | {
      kind: 'result'
      eventIdentity: TournamentEventIdentity
      result: TournamentImportResult | TournamentResult
    }

export type TournamentPendingRecord = {
  id: string
  scope: 'event' | 'result'
  reasonCodes: TournamentPendingReason[]
  normalizedPayload: TournamentNormalizedPendingPayload
}

export type TournamentIndexFile = {
  format: 'hlsieve-tournament-index'
  formatVersion: 1
  dataVersion: string
  startDate: string
  events: Array<{
    id: string
    tournament: TournamentSeries
    date: string
    venue: TournamentVenue
    participantCount?: number
    resultCoverage: TournamentResultCoverage
    resultCount: number
    results: Array<{
      id: string
      rank: number
      oshiCardNumber: string
    }>
  }>
}

export type TournamentEventFile = {
  format: 'hlsieve-tournament-event'
  formatVersion: 1
  dataVersion: string
  event: TournamentEvent
}

export type TournamentOshiMasterFile = {
  format: 'hlsieve-tournament-oshi-master'
  formatVersion: 1
  cardsDataVersion: string
  cards: Record<
    string,
    {
      name: string
      representativeImageUrl?: string
    }
  >
}
