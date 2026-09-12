import type { SavedTournamentReport } from './savedReport'
import type { MatchResult, TournamentRound } from './types'

export type MatchStats = {
  matches: number
  wins: number
  draws: number
  losses: number
  winRate: number | null
}

export type OshiMatchStats = MatchStats & {
  cardNumber: string
}

export type OwnOshiStats = OshiMatchStats & {
  tournamentCount: number
}

export type TournamentStats = {
  tournamentCount: number
  overall: MatchStats
  swiss: MatchStats
  tournament: MatchStats
  byPlayOrder: {
    first: MatchStats
    second: MatchStats
  }
  byInitiative: {
    wonChoice: MatchStats
    lostChoice: MatchStats
  }
  byOpponentOshi: OshiMatchStats[]
  byOwnOshi: OwnOshiStats[]
  missingCounts: {
    playOrderMatches: number
    initiativeMatches: number
    opponentOshiMatches: number
    ownOshiTournaments: number
  }
}

type MutableMatchStats = Omit<MatchStats, 'winRate'>

const emptyMutableStats = (): MutableMatchStats => ({
  matches: 0,
  wins: 0,
  draws: 0,
  losses: 0,
})

const isMatchResult = (value: unknown): value is MatchResult =>
  value === 'win' || value === 'draw' || value === 'loss'

function countResult(stats: MutableMatchStats, result: MatchResult): void {
  stats.matches += 1
  if (result === 'win') stats.wins += 1
  else if (result === 'draw') stats.draws += 1
  else stats.losses += 1
}

function finalize(stats: MutableMatchStats): MatchStats {
  return {
    ...stats,
    winRate: stats.matches === 0 ? null : stats.wins / stats.matches,
  }
}

export function sortOshiMatchStats<T extends OshiMatchStats>(
  values: readonly T[],
  labelFor: (cardNumber: string) => string = (cardNumber) => cardNumber,
): T[] {
  return [...values].sort((left, right) => {
    if (left.matches !== right.matches) return right.matches - left.matches
    const leftRate = left.winRate ?? -1
    const rightRate = right.winRate ?? -1
    if (leftRate !== rightRate) return rightRate - leftRate
    const labelOrder = labelFor(left.cardNumber).localeCompare(
      labelFor(right.cardNumber),
      'ja',
    )
    return labelOrder || left.cardNumber.localeCompare(right.cardNumber, 'en')
  })
}

export function aggregateTournamentStats(
  reports: readonly SavedTournamentReport[],
): TournamentStats {
  const overall = emptyMutableStats()
  const swiss = emptyMutableStats()
  const tournament = emptyMutableStats()
  const first = emptyMutableStats()
  const second = emptyMutableStats()
  const wonChoice = emptyMutableStats()
  const lostChoice = emptyMutableStats()
  const opponent = new Map<string, MutableMatchStats>()
  const own = new Map<
    string,
    { tournamentCount: number; stats: MutableMatchStats }
  >()
  const missingCounts = {
    playOrderMatches: 0,
    initiativeMatches: 0,
    opponentOshiMatches: 0,
    ownOshiTournaments: 0,
  }

  const countRound = (
    round: TournamentRound,
    section: MutableMatchStats,
    ownStats?: MutableMatchStats,
  ) => {
    if (!isMatchResult(round.result)) return
    countResult(overall, round.result)
    countResult(section, round.result)
    if (ownStats) countResult(ownStats, round.result)

    if (round.playOrder === 'first') countResult(first, round.result)
    else if (round.playOrder === 'second') countResult(second, round.result)
    else missingCounts.playOrderMatches += 1

    if (round.initiativeChoiceResult === 'won_choice') {
      countResult(wonChoice, round.result)
    } else if (round.initiativeChoiceResult === 'lost_choice') {
      countResult(lostChoice, round.result)
    } else {
      missingCounts.initiativeMatches += 1
    }

    if (round.opponentOshiCardNumber) {
      const stats =
        opponent.get(round.opponentOshiCardNumber) ?? emptyMutableStats()
      countResult(stats, round.result)
      opponent.set(round.opponentOshiCardNumber, stats)
    } else {
      missingCounts.opponentOshiMatches += 1
    }
  }

  for (const saved of reports) {
    const { report } = saved
    let ownStats: MutableMatchStats | undefined
    if (report.selfOshiCardNumber) {
      const entry = own.get(report.selfOshiCardNumber) ?? {
        tournamentCount: 0,
        stats: emptyMutableStats(),
      }
      entry.tournamentCount += 1
      own.set(report.selfOshiCardNumber, entry)
      ownStats = entry.stats
    } else {
      missingCounts.ownOshiTournaments += 1
    }
    report.swissRounds.forEach((round) => countRound(round, swiss, ownStats))
    report.tournamentRounds.forEach((round) =>
      countRound(round, tournament, ownStats),
    )
  }

  return {
    tournamentCount: reports.length,
    overall: finalize(overall),
    swiss: finalize(swiss),
    tournament: finalize(tournament),
    byPlayOrder: { first: finalize(first), second: finalize(second) },
    byInitiative: {
      wonChoice: finalize(wonChoice),
      lostChoice: finalize(lostChoice),
    },
    byOpponentOshi: sortOshiMatchStats(
      [...opponent].map(([cardNumber, stats]) => ({
        cardNumber,
        ...finalize(stats),
      })),
    ),
    byOwnOshi: sortOshiMatchStats(
      [...own].map(([cardNumber, value]) => ({
        cardNumber,
        tournamentCount: value.tournamentCount,
        ...finalize(value.stats),
      })),
    ),
    missingCounts,
  }
}

export function formatMatchRecord(stats: MatchStats): string {
  return stats.draws === 0
    ? `${stats.wins}-${stats.losses}`
    : `${stats.wins}-${stats.losses}-${stats.draws}`
}

export function formatWinRate(winRate: number | null): string {
  return winRate === null ? '—' : `${(winRate * 100).toFixed(1)}%`
}
