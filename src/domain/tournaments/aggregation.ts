import type { TournamentIndexFile } from './types'

export type TournamentAggregationFilter = {
  from?: string
  to?: string
  tournamentType?: string
  round?: string | null
}

export type TournamentEnvironment = {
  tournamentType: string
  round?: string
}

export type TournamentDistributionEntry = {
  oshiCardNumber: string
  count: number
  percentage: number
}

export type TournamentDistribution = {
  totalResults: number
  entries: TournamentDistributionEntry[]
}

export type TournamentAggregationSummary = {
  totalEvents: number
  eligibleWinnerEvents: number
  eligiblePlacementEvents: number
  winnerResultCount: number
  placementResultCount: number
}

export type TournamentEnvironmentAggregation = {
  environment: TournamentEnvironment
  summary: TournamentAggregationSummary
  winners: TournamentDistribution
  placements: TournamentDistribution
}

export type TournamentAggregationResult = {
  filter: TournamentAggregationFilter
  summary: TournamentAggregationSummary
  groups: TournamentEnvironmentAggregation[]
}

type MutableGroup = {
  environment: TournamentEnvironment
  summary: TournamentAggregationSummary
  winnerCounts: Map<string, number>
  placementCounts: Map<string, number>
}

function emptySummary(): TournamentAggregationSummary {
  return {
    totalEvents: 0,
    eligibleWinnerEvents: 0,
    eligiblePlacementEvents: 0,
    winnerResultCount: 0,
    placementResultCount: 0,
  }
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  )
}

function validateFilter(filter: TournamentAggregationFilter): void {
  if (filter.from !== undefined && !isIsoDate(filter.from)) {
    throw new Error('Tournament aggregation from date is invalid.')
  }
  if (filter.to !== undefined && !isIsoDate(filter.to)) {
    throw new Error('Tournament aggregation to date is invalid.')
  }
  if (filter.from && filter.to && filter.from > filter.to) {
    throw new Error('Tournament aggregation date range is invalid.')
  }
  if (filter.round !== undefined && filter.tournamentType === undefined) {
    throw new Error('Tournament aggregation round requires a tournament type.')
  }
}

function validateIndex(index: TournamentIndexFile): void {
  const eventIds = new Set<string>()
  for (const event of index.events) {
    if (eventIds.has(event.id)) {
      throw new Error(`Duplicate Tournament Event ID: ${event.id}`)
    }
    eventIds.add(event.id)

    const resultIds = new Set<string>()
    const ranks = new Set<number>()
    for (const result of event.results) {
      if (!Number.isSafeInteger(result.rank) || result.rank <= 0) {
        throw new Error(`Invalid Tournament Result rank: ${result.id}`)
      }
      if (resultIds.has(result.id)) {
        throw new Error(`Duplicate Tournament Result ID: ${result.id}`)
      }
      if (ranks.has(result.rank)) {
        throw new Error(`Duplicate Tournament Result rank: ${result.rank}`)
      }
      if (event.resultCoverage.kind === 'winner-only' && result.rank !== 1) {
        throw new Error('Winner-only Tournament contains a non-winner Result.')
      }
      resultIds.add(result.id)
      ranks.add(result.rank)
    }
  }
}

function matchesFilter(
  event: TournamentIndexFile['events'][number],
  filter: TournamentAggregationFilter,
): boolean {
  if (filter.from && event.date < filter.from) return false
  if (filter.to && event.date > filter.to) return false
  if (
    filter.tournamentType &&
    event.tournament.type !== filter.tournamentType
  ) {
    return false
  }
  if (filter.round === null && event.tournament.round !== undefined)
    return false
  if (
    typeof filter.round === 'string' &&
    event.tournament.round !== filter.round
  ) {
    return false
  }
  return true
}

function environmentKey(environment: TournamentEnvironment): string {
  return JSON.stringify([environment.tournamentType, environment.round ?? null])
}

function increment(counts: Map<string, number>, cardNumber: string): void {
  counts.set(cardNumber, (counts.get(cardNumber) ?? 0) + 1)
}

function distribution(counts: Map<string, number>): TournamentDistribution {
  const totalResults = [...counts.values()].reduce(
    (total, count) => total + count,
    0,
  )
  if (totalResults === 0) return { totalResults: 0, entries: [] }
  const entries = [...counts].map(([oshiCardNumber, count]) => ({
    oshiCardNumber,
    count,
    percentage: (count / totalResults) * 100,
  }))
  entries.sort(
    (left, right) =>
      right.count - left.count ||
      (left.oshiCardNumber < right.oshiCardNumber ? -1 : 1),
  )
  return { totalResults, entries }
}

function compareEnvironment(
  left: TournamentEnvironment,
  right: TournamentEnvironment,
): number {
  if (left.tournamentType !== right.tournamentType) {
    return left.tournamentType < right.tournamentType ? -1 : 1
  }
  if (left.round === right.round) return 0
  if (left.round === undefined) return -1
  if (right.round === undefined) return 1
  return left.round < right.round ? -1 : 1
}

function addSummary(
  target: TournamentAggregationSummary,
  source: TournamentAggregationSummary,
): void {
  target.totalEvents += source.totalEvents
  target.eligibleWinnerEvents += source.eligibleWinnerEvents
  target.eligiblePlacementEvents += source.eligiblePlacementEvents
  target.winnerResultCount += source.winnerResultCount
  target.placementResultCount += source.placementResultCount
}

export function aggregateTournamentIndex(
  index: TournamentIndexFile,
  filter: TournamentAggregationFilter = {},
): TournamentAggregationResult {
  validateFilter(filter)
  validateIndex(index)

  const mutableGroups = new Map<string, MutableGroup>()
  for (const event of index.events) {
    if (!matchesFilter(event, filter)) continue
    const environment: TournamentEnvironment = {
      tournamentType: event.tournament.type,
      ...(event.tournament.round === undefined
        ? {}
        : { round: event.tournament.round }),
    }
    const key = environmentKey(environment)
    let group = mutableGroups.get(key)
    if (!group) {
      group = {
        environment,
        summary: emptySummary(),
        winnerCounts: new Map(),
        placementCounts: new Map(),
      }
      mutableGroups.set(key, group)
    }

    group.summary.totalEvents += 1
    const winner = event.results.find((result) => result.rank === 1)
    if (winner) {
      group.summary.eligibleWinnerEvents += 1
      group.summary.winnerResultCount += 1
      increment(group.winnerCounts, winner.oshiCardNumber)
    }

    if (event.resultCoverage.kind !== 'winner-only') {
      const placements = event.results.filter((result) => result.rank <= 8)
      if (placements.length > 0) {
        group.summary.eligiblePlacementEvents += 1
      }
      for (const placement of placements) {
        group.summary.placementResultCount += 1
        increment(group.placementCounts, placement.oshiCardNumber)
      }
    }
  }

  const groups = [...mutableGroups.values()]
    .sort((left, right) =>
      compareEnvironment(left.environment, right.environment),
    )
    .map<TournamentEnvironmentAggregation>((group) => ({
      environment: group.environment,
      summary: group.summary,
      winners: distribution(group.winnerCounts),
      placements: distribution(group.placementCounts),
    }))
  const summary = emptySummary()
  for (const group of groups) addSummary(summary, group.summary)

  return { filter: { ...filter }, summary, groups }
}
