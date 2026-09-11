import { describe, expect, it } from 'vitest'

import {
  calculateAtLeastOneProbability,
  formatProbability,
  getProbabilityValidationErrors,
} from './atLeastOneProbability'

describe('calculateAtLeastOneProbability', () => {
  it('calculates N=50, K=4, n=5', () => {
    expect(
      calculateAtLeastOneProbability({
        deckSize: 50,
        targetCount: 4,
        drawCount: 5,
      }),
    ).toBeCloseTo(0.3530395136778116, 14)
  })

  it('calculates N=50, K=8, n=5', () => {
    expect(
      calculateAtLeastOneProbability({
        deckSize: 50,
        targetCount: 8,
        drawCount: 5,
      }),
    ).toBeCloseTo(0.5985066737148144, 14)
  })

  it('returns zero when K is zero', () => {
    expect(
      calculateAtLeastOneProbability({
        deckSize: 50,
        targetCount: 0,
        drawCount: 5,
      }),
    ).toBe(0)
  })

  it('returns one when K equals N', () => {
    expect(
      calculateAtLeastOneProbability({
        deckSize: 50,
        targetCount: 50,
        drawCount: 1,
      }),
    ).toBe(1)
  })

  it('uses K/N when seeing one card', () => {
    expect(
      calculateAtLeastOneProbability({
        deckSize: 50,
        targetCount: 4,
        drawCount: 1,
      }),
    ).toBeCloseTo(0.08, 14)
  })

  it('handles seeing the entire remaining deck', () => {
    expect(
      calculateAtLeastOneProbability({
        deckSize: 34,
        targetCount: 2,
        drawCount: 34,
      }),
    ).toBe(1)
    expect(
      calculateAtLeastOneProbability({
        deckSize: 34,
        targetCount: 0,
        drawCount: 34,
      }),
    ).toBe(0)
  })

  it.each([
    { deckSize: 50, targetCount: 51, drawCount: 5 },
    { deckSize: 50, targetCount: 4, drawCount: 51 },
    { deckSize: 0, targetCount: 0, drawCount: 1 },
    { deckSize: -1, targetCount: 0, drawCount: 1 },
    { deckSize: 50, targetCount: -1, drawCount: 5 },
    { deckSize: 50, targetCount: 4, drawCount: -1 },
    { deckSize: 50.5, targetCount: 4, drawCount: 5 },
    { deckSize: 50, targetCount: 4.5, drawCount: 5 },
    { deckSize: 50, targetCount: 4, drawCount: 5.5 },
    { deckSize: Number.NaN, targetCount: 4, drawCount: 5 },
    { deckSize: 50, targetCount: Number.POSITIVE_INFINITY, drawCount: 5 },
  ])('rejects invalid input %#', (input) => {
    expect(() => calculateAtLeastOneProbability(input)).toThrow(RangeError)
  })

  it('returns only finite values from zero to one for valid inputs', () => {
    for (let targetCount = 0; targetCount <= 50; targetCount += 1) {
      const result = calculateAtLeastOneProbability({
        deckSize: 50,
        targetCount,
        drawCount: 5,
      })
      expect(Number.isFinite(result)).toBe(true)
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThanOrEqual(1)
    }
  })
})

describe('probability validation and formatting', () => {
  it('returns field-specific validation messages', () => {
    expect(
      getProbabilityValidationErrors({
        deckSize: 10,
        targetCount: 11,
        drawCount: 12,
      }),
    ).toEqual([
      '対象カードの枚数は現在の山札枚数以下にしてください。',
      '見る枚数は現在の山札枚数以下にしてください。',
    ])
  })

  it('formats endpoints, one decimal, and extreme values', () => {
    expect(formatProbability(0)).toBe('0%')
    expect(formatProbability(1)).toBe('100%')
    expect(formatProbability(0.3530395136778116)).toBe('35.3%')
    expect(formatProbability(0.0005)).toBe('<0.1%')
    expect(formatProbability(0.9995)).toBe('>99.9%')
  })
})
