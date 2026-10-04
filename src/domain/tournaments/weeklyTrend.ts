import {
  aggregateSelectedTournamentEvents,
  selectTournamentEvents,
  type TournamentAggregationFilter,
  type TournamentAggregationSummary,
  type TournamentEnvironment,
  type TournamentIndexEvent,
} from './aggregation'
import {
  addCalendarDays,
  getMondayWeekStart,
  getSundayWeekEnd,
} from './calendarDate'
import type { TournamentIndexFile } from './types'

export type TournamentTrendPartialReason =
  'data-start' | 'filter-start' | 'filter-end'

export type TournamentTrendMetric = {
  count: number
  totalResults: number
  share: number | null
}

export type TournamentWeeklyTrendEntry = {
  oshiCardNumber: string
  winner: TournamentTrendMetric
  placement: TournamentTrendMetric
}

export type TournamentWeeklyTrendPoint = {
  weekStart: string
  weekEnd: string
  isPartial: boolean
  partialReasons: TournamentTrendPartialReason[]
  summary: TournamentAggregationSummary
  entries: TournamentWeeklyTrendEntry[]
}

export type TournamentWeeklyTrendResult = {
  environment: TournamentEnvironment
  candidates: string[]
  points: TournamentWeeklyTrendPoint[]
}

export type TournamentWeeklyTrendAggregation = {
  filter: TournamentAggregationFilter
  groups: TournamentWeeklyTrendResult[]
}

const EMPTY_SUMMARY: TournamentAggregationSummary = {
  totalEvents: 0,
  eligibleWinnerEvents: 0,
  eligiblePlacementEvents: 0,
  winnerResultCount: 0,
  placementResultCount: 0,
}

function environmentKey(environment: TournamentEnvironment): string {
  return JSON.stringify([
    environment.tournamentType,
    environment.environment ?? null,
  ])
}

function eventEnvironmentKey(event: TournamentIndexEvent): string {
  return environmentKey({
    tournamentType: event.tournament.type,
    ...(event.tournament.environment === undefined
      ? {}
      : { environment: event.tournament.environment }),
  })
}

function metric(count: number, totalResults: number): TournamentTrendMetric {
  return {
    count,
    totalResults,
    share: totalResults === 0 ? null : count / totalResults,
  }
}

function partialReasons(
  weekStart: string,
  weekEnd: string,
  indexStart: string,
  filter: TournamentAggregationFilter,
): TournamentTrendPartialReason[] {
  const reasons: TournamentTrendPartialReason[] = []
  if (indexStart > weekStart && indexStart <= weekEnd) {
    reasons.push('data-start')
  }
  if (filter.from && filter.from > weekStart && filter.from <= weekEnd) {
    reasons.push('filter-start')
  }
  if (filter.to && filter.to >= weekStart && filter.to < weekEnd) {
    reasons.push('filter-end')
  }
  return reasons
}

function dateRange(
  events: readonly TournamentIndexEvent[],
  indexStart: string,
  filter: TournamentAggregationFilter,
): { start: string; end: string } | undefined {
  const dates = events.map((event) => event.date).sort()
  const derivedStart = filter.from ?? dates[0]
  const derivedEnd = filter.to ?? dates.at(-1)
  if (!derivedStart || !derivedEnd) return undefined
  const start = derivedStart < indexStart ? indexStart : derivedStart
  if (start > derivedEnd) return undefined
  return { start, end: derivedEnd }
}

export function aggregateTournamentWeeklyTrends(
  index: TournamentIndexFile,
  filter: TournamentAggregationFilter = {},
): TournamentWeeklyTrendAggregation {
  const selectedEvents = selectTournamentEvents(index, filter)
  const environmentEvents = selectTournamentEvents(index, {
    tournamentType: filter.tournamentType,
    environment: filter.environment,
  })
  const knownGroups =
    aggregateSelectedTournamentEvents(environmentEvents).groups
  const selectedAggregation = aggregateSelectedTournamentEvents(selectedEvents)
  const selectedByEnvironment = new Map(
    selectedAggregation.groups.map((group) => [
      environmentKey(group.environment),
      group,
    ]),
  )
  const selectedEventsByEnvironment = new Map<string, TournamentIndexEvent[]>()
  for (const event of selectedEvents) {
    const key = eventEnvironmentKey(event)
    const events = selectedEventsByEnvironment.get(key) ?? []
    events.push(event)
    selectedEventsByEnvironment.set(key, events)
  }

  const groups = knownGroups.map<TournamentWeeklyTrendResult>((knownGroup) => {
    const key = environmentKey(knownGroup.environment)
    const events = selectedEventsByEnvironment.get(key) ?? []
    const range = dateRange(events, index.startDate, filter)
    const selectedGroup = selectedByEnvironment.get(key)
    const candidates = [
      ...new Set([
        ...(selectedGroup?.winners.entries.map(
          (entry) => entry.oshiCardNumber,
        ) ?? []),
        ...(selectedGroup?.placements.entries.map(
          (entry) => entry.oshiCardNumber,
        ) ?? []),
      ]),
    ].sort()
    if (!range) {
      return {
        environment: { ...knownGroup.environment },
        candidates,
        points: [],
      }
    }

    const eventsByWeek = new Map<string, TournamentIndexEvent[]>()
    for (const event of events) {
      const weekStart = getMondayWeekStart(event.date)
      const bucket = eventsByWeek.get(weekStart) ?? []
      bucket.push(event)
      eventsByWeek.set(weekStart, bucket)
    }

    const points: TournamentWeeklyTrendPoint[] = []
    const finalWeekStart = getMondayWeekStart(range.end)
    for (
      let weekStart = getMondayWeekStart(range.start);
      weekStart <= finalWeekStart;
      weekStart = addCalendarDays(weekStart, 7)
    ) {
      const weekEnd = getSundayWeekEnd(weekStart)
      const aggregate = aggregateSelectedTournamentEvents(
        eventsByWeek.get(weekStart) ?? [],
      )
      const group = aggregate.groups[0]
      const winnerCounts = new Map(
        group?.winners.entries.map((entry) => [
          entry.oshiCardNumber,
          entry.count,
        ]) ?? [],
      )
      const placementCounts = new Map(
        group?.placements.entries.map((entry) => [
          entry.oshiCardNumber,
          entry.count,
        ]) ?? [],
      )
      const summary = group?.summary ?? { ...EMPTY_SUMMARY }
      const reasons = partialReasons(
        weekStart,
        weekEnd,
        index.startDate,
        filter,
      )
      points.push({
        weekStart,
        weekEnd,
        isPartial: reasons.length > 0,
        partialReasons: reasons,
        summary,
        entries: candidates.map((oshiCardNumber) => ({
          oshiCardNumber,
          winner: metric(
            winnerCounts.get(oshiCardNumber) ?? 0,
            summary.winnerResultCount,
          ),
          placement: metric(
            placementCounts.get(oshiCardNumber) ?? 0,
            summary.placementResultCount,
          ),
        })),
      })
    }
    return { environment: { ...knownGroup.environment }, candidates, points }
  })

  return { filter: { ...filter }, groups }
}
