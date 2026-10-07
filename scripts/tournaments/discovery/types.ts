export type TournamentDiscoveryCandidate = {
  sourceEventId: string
  sourceUrl: string
  seriesId: string
  observedForDate: string
  discoveredAt: string
}

export type TournamentDiscoveryOutcome =
  'observed' | 'saturated' | 'failed' | 'challenge'

export type TournamentDiscoveryQueryResult = {
  seriesId: string
  date: string
  attemptedAt: string
  outcome: TournamentDiscoveryOutcome
  observedCount?: number
  candidateIds: string[]
  saturated: boolean
  zeroResultObserved: boolean
  errorCode?: string
  attemptCount?: number
  retryReasons?: string[]
}

export type TournamentDiscoveryRunResult = {
  runId: string
  startedAt: string
  completedAt: string
  mode: 'daily' | 'reconciliation' | 'manual'
  requestedRange: { from: string; to: string }
  queries: TournamentDiscoveryQueryResult[]
  candidates: TournamentDiscoveryCandidate[]
  summary: {
    attemptedQueries: number
    successfulQueries: number
    zeroResultQueries: number
    saturatedQueries: number
    failedQueries: number
    challengeQueries: number
    observedCandidates: number
    uniqueCandidates: number
  }
}

export type TournamentDiscoveryObservation = {
  seriesId: string
  date: string
  lastAttemptAt: string
  lastSuccessAt?: string
  observedCount?: number
  discoveredIds: string[]
  saturationObserved: boolean
  zeroResultObserved: boolean
  lastOutcome: TournamentDiscoveryOutcome
  lastErrorCode?: string
  attemptCount: number
}
