import { describe, expect, it } from 'vitest'
import type { TournamentEnvironmentAggregation } from './aggregation'
import { evaluateTournamentTier, evaluateTournamentTiers } from './tier'

type EntryInput = readonly [oshiCardNumber: string, count: number]

function group(
  winners: readonly EntryInput[] = [],
  placements: readonly EntryInput[] = [],
  summary: Partial<TournamentEnvironmentAggregation['summary']> = {},
): TournamentEnvironmentAggregation {
  const distribution = (entries: readonly EntryInput[]) => {
    const totalResults = entries.reduce((total, [, count]) => total + count, 0)
    return {
      totalResults,
      entries: entries.map(([oshiCardNumber, count]) => ({
        oshiCardNumber,
        count,
        percentage: totalResults === 0 ? 0 : (count / totalResults) * 100,
      })),
    }
  }
  const winnerDistribution = distribution(winners)
  const placementDistribution = distribution(placements)
  return {
    environment: { tournamentType: 'selectioncup', round: 'bp08' },
    summary: {
      totalEvents: 20,
      eligibleWinnerEvents: winnerDistribution.totalResults,
      eligiblePlacementEvents: 3,
      winnerResultCount: winnerDistribution.totalResults,
      placementResultCount: placementDistribution.totalResults,
      ...summary,
    },
    winners: winnerDistribution,
    placements: placementDistribution,
  }
}

describe('evaluateTournamentTier', () => {
  it('calculates the complete winner/placement pipeline and every tier exactly', () => {
    const result = evaluateTournamentTier(
      group(
        [
          ['S-LEADER', 200],
          ['A-ENTRY', 120],
          ['B-ENTRY', 70],
          ['C-ENTRY', 20],
        ],
        [
          ['S-LEADER', 200],
          ['A-ENTRY', 120],
          ['B-ENTRY', 70],
          ['C-ENTRY', 20],
        ],
      ),
    )

    expect(result.sample.status).toBe('sufficient')
    expect(result.entries).toEqual([
      {
        oshiCardNumber: 'S-LEADER',
        tier: 'S',
        winnerCount: 200,
        winnerShare: 200 / 410,
        placementCount: 200,
        placementShare: 200 / 410,
        evidenceScore: 200 / 410,
        relativeScore: 1,
      },
      {
        oshiCardNumber: 'A-ENTRY',
        tier: 'A',
        winnerCount: 120,
        winnerShare: 120 / 410,
        placementCount: 120,
        placementShare: 120 / 410,
        evidenceScore: 120 / 410,
        relativeScore: 0.6,
      },
      {
        oshiCardNumber: 'B-ENTRY',
        tier: 'B',
        winnerCount: 70,
        winnerShare: 70 / 410,
        placementCount: 70,
        placementShare: 70 / 410,
        evidenceScore: 70 / 410,
        relativeScore: 70 / 410 / (200 / 410),
      },
      {
        oshiCardNumber: 'C-ENTRY',
        tier: 'C',
        winnerCount: 20,
        winnerShare: 20 / 410,
        placementCount: 20,
        placementShare: 20 / 410,
        evidenceScore: 20 / 410,
        relativeScore: 0.1,
      },
    ])
  })

  it('uses the union of card numbers and a 50:50 score without an Oshi master', () => {
    const result = evaluateTournamentTier(
      group(
        [
          ['UNKNOWN-WINNER', 5],
          ['LEADER', 5],
        ],
        [
          ['LEADER', 20],
          ['UNKNOWN-PLACEMENT', 20],
        ],
      ),
    )

    expect(result.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          oshiCardNumber: 'UNKNOWN-WINNER',
          winnerCount: 5,
          winnerShare: 0.5,
          placementCount: 0,
          placementShare: 0,
          evidenceScore: 0.25,
        }),
        expect.objectContaining({
          oshiCardNumber: 'UNKNOWN-PLACEMENT',
          winnerCount: 0,
          winnerShare: 0,
          placementCount: 20,
          placementShare: 0.5,
          evidenceScore: 0.25,
        }),
      ]),
    )
  })

  it.each([
    {
      name: 'missing winner data',
      value: group([], [['P', 20]]),
      reasons: ['missing-winner-data'],
    },
    {
      name: 'too few winner results',
      value: group([['W', 4]], [['P', 20]]),
      reasons: ['too-few-winner-results'],
    },
    {
      name: 'too few placement events',
      value: group([['W', 5]], [['P', 20]], {
        eligiblePlacementEvents: 2,
      }),
      reasons: ['too-few-placement-events'],
    },
    {
      name: 'too few placement results',
      value: group([['W', 5]], [['P', 19]]),
      reasons: ['too-few-placement-results'],
    },
    {
      name: 'missing placement data',
      value: group([['W', 5]], []),
      reasons: ['missing-placement-data'],
    },
    {
      name: 'multiple independent failures',
      value: group([['W', 4]], [['P', 19]], {
        eligiblePlacementEvents: 2,
      }),
      reasons: [
        'too-few-winner-results',
        'too-few-placement-events',
        'too-few-placement-results',
      ],
    },
  ])('reports $name without redundant reasons', ({ value, reasons }) => {
    const result = evaluateTournamentTier(value)
    expect(result.sample).toMatchObject({ status: 'limited', reasons })
    expect(result.entries.every((entry) => entry.tier === null)).toBe(true)
    expect(result.entries.every((entry) => entry.relativeScore === null)).toBe(
      true,
    )
    expect(result.entries.some((entry) => entry.evidenceScore > 0)).toBe(true)
  })

  it.each([
    { winnerResults: 5, placementEvents: 3, placementResults: 20 },
    { winnerResults: 6, placementEvents: 4, placementResults: 21 },
  ])('accepts every sample threshold inclusively: %o', (thresholds) => {
    const result = evaluateTournamentTier(
      group(
        [['W', thresholds.winnerResults]],
        [['P', thresholds.placementResults]],
        {
          eligiblePlacementEvents: thresholds.placementEvents,
        },
      ),
    )
    expect(result.sample.status).toBe('sufficient')
    expect(result.sample.reasons).toEqual([])
  })

  it.each([
    { ratio: 0.85, tier: 'S' },
    { ratio: 0.849999, tier: 'A' },
    { ratio: 0.6, tier: 'A' },
    { ratio: 0.599999, tier: 'B' },
    { ratio: 0.35, tier: 'B' },
    { ratio: 0.349999, tier: 'C' },
  ] as const)('assigns the inclusive band for $ratio', ({ ratio, tier }) => {
    const scale = 1_000_000
    const value = Math.round(ratio * scale)
    const result = evaluateTournamentTier(
      group(
        [
          ['LEADER', scale],
          ['TARGET', value],
        ],
        [
          ['LEADER', scale],
          ['TARGET', value],
        ],
      ),
    )
    expect(
      result.entries.find((entry) => entry.oshiCardNumber === 'TARGET'),
    ).toMatchObject({
      tier,
      relativeScore: ratio,
    })
  })

  it('gives exact ties the same tier and uses card number only for ordering', () => {
    const result = evaluateTournamentTier(
      group(
        [
          ['B-CARD', 5],
          ['A-CARD', 5],
        ],
        [
          ['B-CARD', 10],
          ['A-CARD', 10],
        ],
      ),
    )
    expect(
      result.entries.map(({ oshiCardNumber, tier, relativeScore }) => ({
        oshiCardNumber,
        tier,
        relativeScore,
      })),
    ).toEqual([
      { oshiCardNumber: 'A-CARD', tier: 'S', relativeScore: 1 },
      { oshiCardNumber: 'B-CARD', tier: 'S', relativeScore: 1 },
    ])
  })

  it('keeps a zero-score candidate unranked without NaN or Infinity', () => {
    const result = evaluateTournamentTier(
      group(
        [
          ['LEADER', 5],
          ['ZERO', 0],
        ],
        [
          ['LEADER', 20],
          ['ZERO', 0],
        ],
      ),
    )
    expect(
      result.entries.find((entry) => entry.oshiCardNumber === 'ZERO'),
    ).toEqual({
      oshiCardNumber: 'ZERO',
      tier: null,
      winnerCount: 0,
      winnerShare: 0,
      placementCount: 0,
      placementShare: 0,
      evidenceScore: 0,
      relativeScore: 0,
    })
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/)
  })

  it('sorts limited entries by unrounded evidence score then card number', () => {
    const result = evaluateTournamentTier(
      group(
        [
          ['B-CARD', 2],
          ['A-CARD', 2],
          ['TOP', 3],
        ],
        [['PLACEMENT', 19]],
      ),
    )
    expect(result.sample.status).toBe('limited')
    expect(result.entries.map((entry) => entry.oshiCardNumber)).toEqual([
      'PLACEMENT',
      'TOP',
      'A-CARD',
      'B-CARD',
    ])
  })

  it('keeps different card numbers separate regardless of name assumptions', () => {
    const result = evaluateTournamentTier(
      group(
        [
          ['SAME-NAME-001', 5],
          ['SAME-NAME-002', 5],
        ],
        [
          ['SAME-NAME-001', 10],
          ['SAME-NAME-002', 10],
        ],
      ),
    )
    expect(result.entries.map((entry) => entry.oshiCardNumber)).toEqual([
      'SAME-NAME-001',
      'SAME-NAME-002',
    ])
  })

  it('returns an empty finite result without inventing entries', () => {
    const result = evaluateTournamentTier(group())
    expect(result.entries).toEqual([])
    expect(result.sample).toMatchObject({
      status: 'limited',
      reasons: ['missing-winner-data', 'missing-placement-data'],
    })
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/)
  })

  it('does not mutate the input or either source array order', () => {
    const input = group(
      [
        ['Z', 5],
        ['A', 5],
      ],
      [
        ['Y', 10],
        ['B', 10],
      ],
    )
    const before = structuredClone(input)
    const result = evaluateTournamentTier(input)
    expect(input).toEqual(before)
    expect(result.environment).not.toBe(input.environment)
  })

  it('maps multiple environments independently', () => {
    const first = group([['A', 5]], [['A', 20]])
    const second = {
      ...group([['B', 5]], [['B', 20]]),
      environment: { tournamentType: 'bloomcup', round: 'bp08' },
    }
    const results = evaluateTournamentTiers([first, second])
    expect(results.map((result) => result.environment)).toEqual([
      first.environment,
      second.environment,
    ])
    expect(results[0]?.entries[0]?.oshiCardNumber).toBe('A')
    expect(results[1]?.entries[0]?.oshiCardNumber).toBe('B')
  })
})
