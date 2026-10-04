import { describe, expect, it } from 'vitest'

import { aggregateTournamentIndex } from './aggregation'
import type { TournamentIndexFile, TournamentResultCoverage } from './types'

type IndexEvent = TournamentIndexFile['events'][number]
type IndexResult = IndexEvent['results'][number]

function result(
  rank: number,
  oshiCardNumber: string,
  id = `result-${rank}`,
): IndexResult {
  return { id, rank, oshiCardNumber }
}

function event(
  id: string,
  results: IndexResult[],
  options: {
    coverage?: TournamentResultCoverage
    date?: string
    type?: string
    round?: string
  } = {},
): IndexEvent {
  return {
    id,
    tournament: {
      type: options.type ?? 'selectioncup',
      ...(options.round === undefined ? {} : { round: options.round }),
      seriesName: 'Tournament',
    },
    date: options.date ?? '2026-09-20',
    venue: { slug: `venue-${id}`, name: `Venue ${id}` },
    resultCoverage: options.coverage ?? { kind: 'exact', maxRank: 8 },
    resultCount: results.length,
    results,
  }
}

function index(events: IndexEvent[]): TournamentIndexFile {
  return {
    format: 'hlsieve-tournament-index',
    formatVersion: 1,
    dataVersion: 'test',
    startDate: '2026-09-19',
    events,
  }
}

describe('aggregateTournamentIndex', () => {
  it('uses actual winner and placement Results as denominators across coverage kinds', () => {
    const exact = event(
      'exact',
      Array.from({ length: 8 }, (_, offset) =>
        result(
          offset + 1,
          offset < 4 ? 'OSHI-A' : 'OSHI-B',
          `exact-${offset + 1}`,
        ),
      ),
      { coverage: { kind: 'exact', maxRank: 8 }, round: 'bp08' },
    )
    const variable = event(
      'variable',
      [
        result(1, 'OSHI-A', 'variable-1'),
        result(2, 'OSHI-C', 'variable-2'),
        result(3, 'OSHI-C', 'variable-3'),
        result(5, 'OSHI-D', 'variable-5'),
      ],
      { coverage: { kind: 'variable' }, round: 'bp08' },
    )
    const winnerOnly = event(
      'winner-only',
      [result(1, 'OSHI-B', 'winner-only-1')],
      {
        coverage: { kind: 'winner-only' },
        round: 'bp08',
      },
    )

    const aggregated = aggregateTournamentIndex(
      index([exact, variable, winnerOnly]),
    )

    expect(aggregated.summary).toEqual({
      totalEvents: 3,
      eligibleWinnerEvents: 3,
      eligiblePlacementEvents: 2,
      winnerResultCount: 3,
      placementResultCount: 12,
    })
    expect(aggregated.groups).toHaveLength(1)
    expect(aggregated.groups[0].winners).toEqual({
      totalResults: 3,
      entries: [
        { oshiCardNumber: 'OSHI-A', count: 2, percentage: (2 / 3) * 100 },
        { oshiCardNumber: 'OSHI-B', count: 1, percentage: (1 / 3) * 100 },
      ],
    })
    expect(aggregated.groups[0].placements.totalResults).toBe(12)
    expect(aggregated.groups[0].placements.entries).toEqual([
      { oshiCardNumber: 'OSHI-A', count: 5, percentage: (5 / 12) * 100 },
      { oshiCardNumber: 'OSHI-B', count: 4, percentage: (4 / 12) * 100 },
      { oshiCardNumber: 'OSHI-C', count: 2, percentage: (2 / 12) * 100 },
      { oshiCardNumber: 'OSHI-D', count: 1, percentage: (1 / 12) * 100 },
    ])
  })

  it('does not fill missing ranks and excludes ranks above 8 from placements', () => {
    const aggregated = aggregateTournamentIndex(
      index([
        event('partial-exact', [result(1, 'A'), result(4, 'B')], {
          coverage: { kind: 'exact', maxRank: 4 },
        }),
        event(
          'sparse',
          [result(2, 'C', 'sparse-2'), result(9, 'D', 'sparse-9')],
          {
            coverage: { kind: 'variable' },
          },
        ),
      ]),
    )

    expect(aggregated.summary).toEqual({
      totalEvents: 2,
      eligibleWinnerEvents: 1,
      eligiblePlacementEvents: 2,
      winnerResultCount: 1,
      placementResultCount: 3,
    })
    expect(
      aggregated.groups[0].placements.entries.map(
        (entry) => entry.oshiCardNumber,
      ),
    ).toEqual(['A', 'B', 'C'])
  })

  it('keeps every type and round in a separate, stably ordered environment', () => {
    const aggregated = aggregateTournamentIndex(
      index([
        event('z-round', [result(1, 'Z')], { type: 'zeta', round: 'r2' }),
        event('a-r2', [result(1, 'A2')], { type: 'alpha', round: 'r2' }),
        event('a-none', [result(1, 'AN')], { type: 'alpha' }),
        event('a-r1', [result(1, 'A1')], { type: 'alpha', round: 'r1' }),
        event('unknown', [result(1, 'U')], { type: 'future', round: 'x' }),
      ]),
    )

    expect(aggregated.groups.map((group) => group.environment)).toEqual([
      { tournamentType: 'alpha' },
      { tournamentType: 'alpha', round: 'r1' },
      { tournamentType: 'alpha', round: 'r2' },
      { tournamentType: 'future', round: 'x' },
      { tournamentType: 'zeta', round: 'r2' },
    ])
    expect(
      aggregateTournamentIndex(index(aggregated.groups.flatMap(() => [])))
        .groups,
    ).toEqual([])
  })

  it('applies inclusive date, type, round, and explicit no-round filters', () => {
    const source = index([
      event('before', [result(1, 'A')], {
        date: '2026-09-19',
        type: 'cup',
        round: 'r1',
      }),
      event('start', [result(1, 'B')], {
        date: '2026-09-20',
        type: 'cup',
        round: 'r1',
      }),
      event('no-round', [result(1, 'C')], { date: '2026-09-21', type: 'cup' }),
      event('end', [result(1, 'D')], {
        date: '2026-09-22',
        type: 'cup',
        round: 'r2',
      }),
      event('other', [result(1, 'E')], {
        date: '2026-09-21',
        type: 'other',
        round: 'r1',
      }),
    ])

    expect(
      aggregateTournamentIndex(source, { from: '2026-09-20', to: '2026-09-22' })
        .summary.totalEvents,
    ).toBe(4)
    expect(
      aggregateTournamentIndex(source, { tournamentType: 'cup', round: 'r1' })
        .summary.totalEvents,
    ).toBe(2)
    expect(
      aggregateTournamentIndex(source, { tournamentType: 'cup', round: null })
        .summary.totalEvents,
    ).toBe(1)
    expect(
      aggregateTournamentIndex(source, { tournamentType: 'cup' }).groups,
    ).toHaveLength(3)
  })

  it.each([
    [{ from: '2026-02-30' }, 'from date'],
    [{ to: 'not-a-date' }, 'to date'],
    [{ from: '2026-09-22', to: '2026-09-20' }, 'date range'],
    [{ round: 'bp08' }, 'requires a tournament type'],
    [{ round: null }, 'requires a tournament type'],
  ] as const)('rejects an invalid filter: %s', (filter, message) => {
    expect(() => aggregateTournamentIndex(index([]), filter)).toThrow(message)
  })

  it('uses cardNumber identity and stable cardNumber tie-breaking without an Oshi master', () => {
    const aggregated = aggregateTournamentIndex(
      index([
        event('one', [result(1, 'Z-UNKNOWN'), result(2, 'A-UNKNOWN')]),
        event('two', [
          result(1, 'A-UNKNOWN', 'two-1'),
          result(2, 'Z-UNKNOWN', 'two-2'),
        ]),
        event('three', [result(1, 'THIRD', 'three-1')]),
      ]),
    )

    expect(aggregated.groups[0].winners.entries).toEqual([
      { oshiCardNumber: 'A-UNKNOWN', count: 1, percentage: (1 / 3) * 100 },
      { oshiCardNumber: 'THIRD', count: 1, percentage: (1 / 3) * 100 },
      { oshiCardNumber: 'Z-UNKNOWN', count: 1, percentage: (1 / 3) * 100 },
    ])
  })

  it('returns an empty, finite result and echoes a defensive filter copy', () => {
    const filter = { tournamentType: 'missing' }
    const aggregated = aggregateTournamentIndex(index([]), filter)

    expect(aggregated).toEqual({
      filter,
      summary: {
        totalEvents: 0,
        eligibleWinnerEvents: 0,
        eligiblePlacementEvents: 0,
        winnerResultCount: 0,
        placementResultCount: 0,
      },
      groups: [],
    })
    expect(aggregated.filter).not.toBe(filter)

    const zeroPlacement = aggregateTournamentIndex(
      index([
        event('winner-only-zero', [result(1, 'A')], {
          coverage: { kind: 'winner-only' },
        }),
      ]),
    )
    expect(zeroPlacement.groups[0].placements).toEqual({
      totalResults: 0,
      entries: [],
    })
  })

  it.each([
    [
      index([event('duplicate', []), event('duplicate', [])]),
      'Duplicate Tournament Event ID',
    ],
    [
      index([
        event('event', [
          result(1, 'A', 'duplicate'),
          result(2, 'B', 'duplicate'),
        ]),
      ]),
      'Duplicate Tournament Result ID',
    ],
    [
      index([event('event', [result(1, 'A', 'one'), result(1, 'B', 'two')])]),
      'Duplicate Tournament Result rank',
    ],
    [
      index([event('event', [result(0, 'A')])]),
      'Invalid Tournament Result rank',
    ],
    [
      index([event('event', [result(-1, 'A')])]),
      'Invalid Tournament Result rank',
    ],
    [
      index([event('event', [result(1.5, 'A')])]),
      'Invalid Tournament Result rank',
    ],
    [
      index([
        event('event', [result(2, 'A')], { coverage: { kind: 'winner-only' } }),
      ]),
      'Winner-only Tournament',
    ],
  ])('rejects structurally ambiguous input %#', (source, message) => {
    expect(() => aggregateTournamentIndex(source)).toThrow(message)
  })

  it('accepts rank above 8 and keeps top-level summaries equal to group sums', () => {
    const aggregated = aggregateTournamentIndex(
      index([
        event('rank-nine', [result(9, 'A')], {
          type: 'a',
          coverage: { kind: 'variable' },
        }),
        event('winner', [result(1, 'B')], {
          type: 'b',
          coverage: { kind: 'winner-only' },
        }),
      ]),
    )
    const summed = aggregated.groups.reduce(
      (total, group) => ({
        totalEvents: total.totalEvents + group.summary.totalEvents,
        eligibleWinnerEvents:
          total.eligibleWinnerEvents + group.summary.eligibleWinnerEvents,
        eligiblePlacementEvents:
          total.eligiblePlacementEvents + group.summary.eligiblePlacementEvents,
        winnerResultCount:
          total.winnerResultCount + group.summary.winnerResultCount,
        placementResultCount:
          total.placementResultCount + group.summary.placementResultCount,
      }),
      {
        totalEvents: 0,
        eligibleWinnerEvents: 0,
        eligiblePlacementEvents: 0,
        winnerResultCount: 0,
        placementResultCount: 0,
      },
    )

    expect(aggregated.summary).toEqual(summed)
    expect(aggregated.summary).toEqual({
      totalEvents: 2,
      eligibleWinnerEvents: 1,
      eligiblePlacementEvents: 0,
      winnerResultCount: 1,
      placementResultCount: 0,
    })
  })
})
