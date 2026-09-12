import { describe, expect, it } from 'vitest'

import {
  calculateSwissDistribution,
  formatExpectedPlayers,
  formatSwissPercentage,
  getSwissValidationErrors,
} from './swissDistribution'

describe('calculateSwissDistribution', () => {
  it.each([
    { participantCount: 64, roundCount: 5, expected: [2, 10, 20, 20, 10, 2] },
    { participantCount: 32, roundCount: 5, expected: [1, 5, 10, 10, 5, 1] },
    { participantCount: 8, roundCount: 3, expected: [1, 3, 3, 1] },
  ])(
    'calculates the exact $participantCount / $roundCount distribution',
    (input) => {
      expect(
        calculateSwissDistribution(input).map((row) => row.expectedPlayers),
      ).toEqual(input.expected)
    },
  )

  it('returns fractional theoretical values without integer allocation', () => {
    const rows = calculateSwissDistribution({
      participantCount: 150,
      roundCount: 5,
    })

    expect(rows.map((row) => row.expectedPlayers)).toEqual([
      4.6875, 23.4375, 46.875, 46.875, 23.4375, 4.6875,
    ])
  })

  it('handles one round', () => {
    expect(
      calculateSwissDistribution({ participantCount: 10, roundCount: 1 }),
    ).toEqual([
      { wins: 1, losses: 0, expectedPlayers: 5, probability: 0.5 },
      { wins: 0, losses: 1, expectedPlayers: 5, probability: 0.5 },
    ])
  })

  it('sums expected players and probabilities to their inputs', () => {
    const rows = calculateSwissDistribution({
      participantCount: 99_999,
      roundCount: 20,
    })

    expect(rows.reduce((sum, row) => sum + row.expectedPlayers, 0)).toBeCloseTo(
      99_999,
      8,
    )
    expect(rows.reduce((sum, row) => sum + row.probability, 0)).toBeCloseTo(
      1,
      12,
    )
    expect(rows.every((row) => Number.isFinite(row.expectedPlayers))).toBe(true)
  })

  it('is symmetric and ordered from most wins to most losses', () => {
    const rows = calculateSwissDistribution({
      participantCount: 150,
      roundCount: 5,
    })

    expect(rows.map((row) => row.wins)).toEqual([5, 4, 3, 2, 1, 0])
    for (let index = 0; index < rows.length; index += 1) {
      expect(rows[index].expectedPlayers).toBe(
        rows.at(-index - 1)?.expectedPlayers,
      )
      expect(rows[index].probability).toBe(rows.at(-index - 1)?.probability)
    }
  })
})

describe('Swiss distribution validation and formatting', () => {
  it.each([
    { participantCount: 1, roundCount: 5 },
    { participantCount: -1, roundCount: 5 },
    { participantCount: 2.5, roundCount: 5 },
    { participantCount: Number.NaN, roundCount: 5 },
    { participantCount: Number.POSITIVE_INFINITY, roundCount: 5 },
    { participantCount: 64, roundCount: 0 },
    { participantCount: 64, roundCount: -1 },
    { participantCount: 64, roundCount: 1.5 },
    { participantCount: 64, roundCount: Number.NaN },
    { participantCount: 64, roundCount: Number.POSITIVE_INFINITY },
    { participantCount: 100_001, roundCount: 5 },
    { participantCount: 64, roundCount: 21 },
  ])('rejects invalid input %#', (input) => {
    expect(getSwissValidationErrors(input)).not.toHaveLength(0)
    expect(() => calculateSwissDistribution(input)).toThrow(RangeError)
  })

  it('formats integer, fractional, and percentage values honestly', () => {
    expect(formatExpectedPlayers(10)).toBe('10人')
    expect(formatExpectedPlayers(4.6875)).toBe('約4.7人')
    expect(formatSwissPercentage(0.03125)).toBe('3.1%')
    expect(formatSwissPercentage(1 / 2048)).toBe('<0.1%')
  })
})
