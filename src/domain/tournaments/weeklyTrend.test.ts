import { describe, expect, it } from 'vitest'
import type { TournamentIndexFile } from './types'
import { aggregateTournamentIndex } from './aggregation'
import { aggregateTournamentWeeklyTrends } from './weeklyTrend'

type ResultInput = readonly [rank: number, oshiCardNumber: string]

function event(
  id: string,
  date: string,
  results: readonly ResultInput[],
  options: {
    type?: string
    environment?: string
    winnerOnly?: boolean
  } = {},
): TournamentIndexFile['events'][number] {
  return {
    id,
    tournament: {
      type: options.type ?? 'selectioncup',
      ...(options.environment === undefined
        ? {}
        : { environment: options.environment }),
      seriesName: 'Test Series',
    },
    date,
    venue: { slug: `venue-${id}`, name: `Venue ${id}` },
    participantCount: 32,
    resultCoverage: options.winnerOnly
      ? { kind: 'winner-only' }
      : { kind: 'variable' },
    resultCount: results.length,
    results: results.map(([rank, oshiCardNumber], index) => ({
      id: `${id}-result-${index}`,
      rank,
      oshiCardNumber,
    })),
  }
}

function index(
  events: TournamentIndexFile['events'],
  startDate = '2026-09-07',
): TournamentIndexFile {
  return {
    format: 'hlsieve-tournament-index',
    formatVersion: 1,
    dataVersion: 'weekly-test-v1',
    startDate,
    events,
  }
}

describe('aggregateTournamentWeeklyTrends', () => {
  it('keeps zero and null distinct across weeks and reuses winner-only placement semantics', () => {
    const input = index([
      event('week1-normal', '2026-09-07', [
        [1, 'A'],
        [2, 'B'],
      ]),
      event('week1-winner-only', '2026-09-08', [[1, 'W']], {
        winnerOnly: true,
      }),
      event('week2', '2026-09-14', [
        [1, 'B'],
        [2, 'B'],
      ]),
      event('week3-no-winner', '2026-09-21', [[2, 'B']]),
    ])

    const result = aggregateTournamentWeeklyTrends(input)
    const group = result.groups[0]!
    expect(group.candidates).toEqual(['A', 'B', 'W'])
    expect(group.points.map((point) => point.weekStart)).toEqual([
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
    ])
    expect(group.points[0]?.summary).toEqual({
      totalEvents: 2,
      eligibleWinnerEvents: 2,
      eligiblePlacementEvents: 1,
      winnerResultCount: 2,
      placementResultCount: 2,
    })
    expect(group.points[0]?.entries[0]).toEqual({
      oshiCardNumber: 'A',
      winner: { count: 1, totalResults: 2, share: 0.5 },
      placement: { count: 1, totalResults: 2, share: 0.5 },
    })
    expect(group.points[1]?.entries[0]).toEqual({
      oshiCardNumber: 'A',
      winner: { count: 0, totalResults: 1, share: 0 },
      placement: { count: 0, totalResults: 2, share: 0 },
    })
    expect(group.points[2]?.entries[0]).toEqual({
      oshiCardNumber: 'A',
      winner: { count: 0, totalResults: 0, share: null },
      placement: { count: 0, totalResults: 1, share: 0 },
    })
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/)
  })

  it('generates empty intervening weeks with candidates and null metrics', () => {
    const result = aggregateTournamentWeeklyTrends(
      index([
        event('first', '2026-09-07', [[1, 'A']]),
        event('third', '2026-09-21', [[1, 'A']]),
      ]),
    )
    const middle = result.groups[0]?.points[1]
    expect(result.groups[0]?.points.map((point) => point.weekStart)).toEqual([
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
    ])
    expect(middle).toEqual({
      weekStart: '2026-09-14',
      weekEnd: '2026-09-20',
      isPartial: false,
      partialReasons: [],
      summary: {
        totalEvents: 0,
        eligibleWinnerEvents: 0,
        eligiblePlacementEvents: 0,
        winnerResultCount: 0,
        placementResultCount: 0,
      },
      entries: [
        {
          oshiCardNumber: 'A',
          winner: { count: 0, totalResults: 0, share: null },
          placement: { count: 0, totalResults: 0, share: null },
        },
      ],
    })
  })

  it('reports data and filter partial reasons without treating the last Wednesday as partial', () => {
    const input = index([event('only', '2026-09-09', [[1, 'A']])], '2026-09-09')
    const unfiltered = aggregateTournamentWeeklyTrends(input)
    expect(unfiltered.groups[0]?.points[0]).toMatchObject({
      weekStart: '2026-09-07',
      weekEnd: '2026-09-13',
      isPartial: true,
      partialReasons: ['data-start'],
    })

    const filtered = aggregateTournamentWeeklyTrends(input, {
      from: '2026-09-10',
      to: '2026-09-12',
    })
    expect(filtered.groups[0]?.points[0]).toMatchObject({
      isPartial: true,
      partialReasons: ['data-start', 'filter-start', 'filter-end'],
    })

    const fullStartInput = index(
      [event('wednesday', '2026-09-09', [[1, 'A']])],
      '2026-09-07',
    )
    expect(
      aggregateTournamentWeeklyTrends(fullStartInput).groups[0]?.points[0],
    ).toMatchObject({ isPartial: false, partialReasons: [] })
  })

  it('keeps environments separate and in Phase 10B order, including unknown types', () => {
    const result = aggregateTournamentWeeklyTrends(
      index([
        event('selection-r2', '2026-09-07', [[1, 'A']], {
          environment: 'r2',
        }),
        event('selection-r1', '2026-09-07', [[1, 'B']], {
          environment: 'r1',
        }),
        event('bloom', '2026-09-07', [[1, 'C']], { type: 'bloomcup' }),
        event('unknown', '2026-09-07', [[1, 'D']], { type: 'zzz' }),
      ]),
    )
    expect(result.groups.map((group) => group.environment)).toEqual([
      { tournamentType: 'bloomcup' },
      { tournamentType: 'selectioncup', environment: 'r1' },
      { tournamentType: 'selectioncup', environment: 'r2' },
      { tournamentType: 'zzz' },
    ])
    expect(result.groups.map((group) => group.candidates)).toEqual([
      ['C'],
      ['B'],
      ['A'],
      ['D'],
    ])
    expect(
      result.groups.map((group) => group.points[0]?.entries[0]?.winner.count),
    ).toEqual([1, 1, 1, 1])
  })

  it('applies inclusive filters and retains a known environment over an explicit empty range', () => {
    const input = index([
      event('no-round', '2026-09-07', [[1, 'A']]),
      event('round', '2026-09-14', [[1, 'B']], { environment: 'bp09' }),
      event('to', '2026-09-21', [[1, 'C']], { environment: 'bp09' }),
    ])
    const result = aggregateTournamentWeeklyTrends(input, {
      tournamentType: 'selectioncup',
      environment: 'bp09',
      from: '2026-09-14',
      to: '2026-09-21',
    })
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]?.candidates).toEqual(['B', 'C'])
    expect(
      result.groups[0]?.points.map((point) => point.summary.totalEvents),
    ).toEqual([1, 1])

    const empty = aggregateTournamentWeeklyTrends(input, {
      tournamentType: 'selectioncup',
      environment: null,
      from: '2026-10-05',
      to: '2026-10-11',
    })
    expect(empty.groups).toEqual([
      {
        environment: { tournamentType: 'selectioncup' },
        candidates: [],
        points: [
          expect.objectContaining({
            weekStart: '2026-10-05',
            summary: expect.objectContaining({ totalEvents: 0 }),
            entries: [],
          }),
        ],
      },
    ])
    expect(() =>
      aggregateTournamentWeeklyTrends(input, { environment: 'bp09' }),
    ).toThrow('environment requires a tournament type')
  })

  it('returns no groups for an empty production index', () => {
    expect(aggregateTournamentWeeklyTrends(index([]))).toEqual({
      filter: {},
      groups: [],
    })
  })

  it('does not mutate index, nested arrays, or filter and is deterministic', () => {
    const input = index([
      event('later', '2026-09-14', [[1, 'B']]),
      event('earlier', '2026-09-07', [[1, 'A']]),
    ])
    const filter = { from: '2026-09-07', to: '2026-09-14' }
    const beforeInput = structuredClone(input)
    const beforeFilter = structuredClone(filter)
    const first = aggregateTournamentWeeklyTrends(input, filter)
    expect(aggregateTournamentWeeklyTrends(input, filter)).toEqual(first)
    expect(input).toEqual(beforeInput)
    expect(filter).toEqual(beforeFilter)
    expect(first.filter).not.toBe(filter)
  })

  it('matches Phase 10B aggregation for each populated weekly partition', () => {
    const input = index([
      event('one', '2026-09-07', [
        [1, 'A'],
        [3, 'B'],
      ]),
      event('two', '2026-09-08', [[1, 'B']], { winnerOnly: true }),
    ])
    const trend = aggregateTournamentWeeklyTrends(input)
    const aggregate = aggregateTournamentIndex(input, {
      from: '2026-09-07',
      to: '2026-09-13',
    })
    expect(trend.groups[0]?.points[0]?.summary).toEqual(
      aggregate.groups[0]?.summary,
    )
    expect(
      trend.groups[0]?.points[0]?.entries.map((entry) => ({
        oshiCardNumber: entry.oshiCardNumber,
        winnerCount: entry.winner.count,
        placementCount: entry.placement.count,
      })),
    ).toEqual([
      { oshiCardNumber: 'A', winnerCount: 1, placementCount: 1 },
      { oshiCardNumber: 'B', winnerCount: 1, placementCount: 1 },
    ])
  })
})
