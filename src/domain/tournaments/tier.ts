import type {
  TournamentEnvironment,
  TournamentEnvironmentAggregation,
} from './aggregation'

export type TournamentTier = 'S' | 'A' | 'B' | 'C'

export type TournamentTierSampleStatus = 'sufficient' | 'limited'

export type TournamentTierUnavailableReason =
  | 'missing-winner-data'
  | 'missing-placement-data'
  | 'too-few-winner-results'
  | 'too-few-placement-events'
  | 'too-few-placement-results'

export type TournamentTierEntry = {
  oshiCardNumber: string
  tier: TournamentTier | null
  winnerCount: number
  winnerShare: number
  placementCount: number
  placementShare: number
  evidenceScore: number
  relativeScore: number | null
}

export type TournamentTierSample = {
  status: TournamentTierSampleStatus
  totalEvents: number
  eligibleWinnerEvents: number
  eligiblePlacementEvents: number
  winnerResultCount: number
  placementResultCount: number
  reasons: TournamentTierUnavailableReason[]
}

export type TournamentTierResult = {
  environment: TournamentEnvironment
  sample: TournamentTierSample
  entries: TournamentTierEntry[]
}

const TOURNAMENT_TIER_SAMPLE_REQUIREMENTS = {
  winnerResults: 5,
  placementEvents: 3,
  placementResults: 20,
} as const

const TOURNAMENT_TIER_THRESHOLDS = {
  S: 0.85,
  A: 0.6,
  B: 0.35,
} as const

const WINNER_WEIGHT = 0.5
const PLACEMENT_WEIGHT = 0.5

const TIER_ORDER: Record<TournamentTier, number> = {
  S: 0,
  A: 1,
  B: 2,
  C: 3,
}

function sampleFor(
  group: TournamentEnvironmentAggregation,
): TournamentTierSample {
  const reasons: TournamentTierUnavailableReason[] = []

  if (group.winners.totalResults === 0) {
    reasons.push('missing-winner-data')
  } else if (
    group.summary.winnerResultCount <
    TOURNAMENT_TIER_SAMPLE_REQUIREMENTS.winnerResults
  ) {
    reasons.push('too-few-winner-results')
  }

  if (group.placements.totalResults === 0) {
    reasons.push('missing-placement-data')
  } else {
    if (
      group.summary.eligiblePlacementEvents <
      TOURNAMENT_TIER_SAMPLE_REQUIREMENTS.placementEvents
    ) {
      reasons.push('too-few-placement-events')
    }
    if (
      group.summary.placementResultCount <
      TOURNAMENT_TIER_SAMPLE_REQUIREMENTS.placementResults
    ) {
      reasons.push('too-few-placement-results')
    }
  }

  return {
    status: reasons.length === 0 ? 'sufficient' : 'limited',
    totalEvents: group.summary.totalEvents,
    eligibleWinnerEvents: group.summary.eligibleWinnerEvents,
    eligiblePlacementEvents: group.summary.eligiblePlacementEvents,
    winnerResultCount: group.summary.winnerResultCount,
    placementResultCount: group.summary.placementResultCount,
    reasons,
  }
}

function tierFor(relativeScore: number): TournamentTier | null {
  if (relativeScore >= TOURNAMENT_TIER_THRESHOLDS.S) return 'S'
  if (relativeScore >= TOURNAMENT_TIER_THRESHOLDS.A) return 'A'
  if (relativeScore >= TOURNAMENT_TIER_THRESHOLDS.B) return 'B'
  if (relativeScore > 0) return 'C'
  return null
}

function compareEntries(
  left: TournamentTierEntry,
  right: TournamentTierEntry,
): number {
  const leftTier = left.tier === null ? 4 : TIER_ORDER[left.tier]
  const rightTier = right.tier === null ? 4 : TIER_ORDER[right.tier]
  if (leftTier !== rightTier) return leftTier - rightTier
  if (left.evidenceScore !== right.evidenceScore) {
    return right.evidenceScore - left.evidenceScore
  }
  return left.oshiCardNumber.localeCompare(right.oshiCardNumber)
}

export function evaluateTournamentTier(
  group: TournamentEnvironmentAggregation,
): TournamentTierResult {
  const sample = sampleFor(group)
  const winnerCounts = new Map(
    group.winners.entries.map((entry) => [entry.oshiCardNumber, entry.count]),
  )
  const placementCounts = new Map(
    group.placements.entries.map((entry) => [
      entry.oshiCardNumber,
      entry.count,
    ]),
  )
  const candidates = new Set([
    ...winnerCounts.keys(),
    ...placementCounts.keys(),
  ])

  const entries = [...candidates].map<TournamentTierEntry>((oshiCardNumber) => {
    const winnerCount = winnerCounts.get(oshiCardNumber) ?? 0
    const placementCount = placementCounts.get(oshiCardNumber) ?? 0
    const winnerShare =
      group.winners.totalResults > 0
        ? winnerCount / group.winners.totalResults
        : 0
    const placementShare =
      group.placements.totalResults > 0
        ? placementCount / group.placements.totalResults
        : 0
    return {
      oshiCardNumber,
      tier: null,
      winnerCount,
      winnerShare,
      placementCount,
      placementShare,
      evidenceScore:
        winnerShare * WINNER_WEIGHT + placementShare * PLACEMENT_WEIGHT,
      relativeScore: null,
    }
  })

  if (sample.status === 'sufficient') {
    const maxEvidenceScore = entries.reduce(
      (maximum, entry) => Math.max(maximum, entry.evidenceScore),
      0,
    )
    if (maxEvidenceScore > 0 && Number.isFinite(maxEvidenceScore)) {
      for (const entry of entries) {
        const relativeScore = entry.evidenceScore / maxEvidenceScore
        if (Number.isFinite(relativeScore)) {
          entry.relativeScore = relativeScore
          entry.tier = tierFor(relativeScore)
        }
      }
    }
  }

  return {
    environment: { ...group.environment },
    sample,
    entries: entries.sort(compareEntries),
  }
}

export function evaluateTournamentTiers(
  groups: readonly TournamentEnvironmentAggregation[],
): TournamentTierResult[] {
  return groups.map(evaluateTournamentTier)
}
