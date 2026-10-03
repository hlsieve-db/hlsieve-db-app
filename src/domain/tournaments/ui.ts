import type {
  TournamentIndexFile,
  TournamentResult,
  TournamentResultCoverage,
} from './types'

export const TOURNAMENT_PAGE_SIZE = 20
export const TOURNAMENT_NO_ROUND = 'none'

export type TournamentSort = 'date-desc' | 'date-asc'
export type TournamentIndexEvent = TournamentIndexFile['events'][number]

const TYPE_LABELS: Readonly<Record<string, string>> = {
  selectioncup: 'セレクションカップ',
  bloomcup: 'ブルームカップ',
  wgp: 'WGP',
}

export function tournamentTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? 'その他'
}

export function tournamentCoverageLabel(
  coverage: TournamentResultCoverage,
): string {
  if (coverage.kind === 'winner-only') return '優勝結果のみ収録'
  if (coverage.kind === 'variable') return '取得できた結果のみ収録'
  return `1〜${coverage.maxRank}位の結果を収録`
}

export function visibleTournamentResults(
  results: readonly TournamentResult[],
): TournamentResult[] {
  return [...results]
    .filter((result) => result.rank <= 8)
    .sort(
      (left, right) =>
        left.rank - right.rank || left.id.localeCompare(right.id),
    )
}

export function normalizeTournamentVenue(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase()
}

export function filterTournamentEvents(
  events: readonly TournamentIndexEvent[],
  filters: {
    from?: string
    to?: string
    type?: string
    round?: string
    oshi?: string
    venue?: string
  },
): TournamentIndexEvent[] {
  const venue = normalizeTournamentVenue(filters.venue ?? '').trim()
  return events.filter((event) => {
    if (filters.from && event.date < filters.from) return false
    if (filters.to && event.date > filters.to) return false
    if (filters.type && event.tournament.type !== filters.type) return false
    if (
      filters.round &&
      (filters.round === TOURNAMENT_NO_ROUND
        ? event.tournament.round !== undefined
        : event.tournament.round !== filters.round)
    ) {
      return false
    }
    if (
      filters.oshi &&
      !event.results.some((result) => result.oshiCardNumber === filters.oshi)
    ) {
      return false
    }
    if (venue) {
      const target = normalizeTournamentVenue(
        `${event.venue.name} ${event.venue.prefecture ?? ''}`,
      )
      if (!target.includes(venue)) return false
    }
    return true
  })
}

export function sortTournamentEvents(
  events: readonly TournamentIndexEvent[],
  sort: TournamentSort,
): TournamentIndexEvent[] {
  return [...events].sort((left, right) => {
    const byDate = left.date.localeCompare(right.date)
    if (byDate !== 0) return sort === 'date-asc' ? byDate : -byDate
    return left.id.localeCompare(right.id)
  })
}
