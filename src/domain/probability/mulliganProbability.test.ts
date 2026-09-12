import { describe, expect, it } from 'vitest'

import { calculateAtLeastOneProbability } from './atLeastOneProbability'
import {
  calculateMulliganProbability,
  getMulliganValidationErrors,
} from './mulliganProbability'

describe('calculateMulliganProbability', () => {
  it('calculates N=50, K=4, H=7, M=5 with the specified redraw pool', () => {
    const result = calculateMulliganProbability({
      deckSize: 50,
      targetCount: 4,
      openingHandSize: 7,
      redrawCount: 5,
    })

    expect(result.redrawPoolSize).toBe(48)
    expect(result.initialHitProbability).toBeCloseTo(0.46413373860182383, 14)
    expect(result.initialMissProbability).toBeCloseTo(0.5358662613981762, 14)
    expect(result.redrawHitProbabilityGivenMiss).toBeCloseTo(
      0.3657621543838011,
      14,
    )
    expect(result.finalHitProbability).toBeCloseTo(0.6601333368324138, 14)
    expect(result.improvementProbabilityPoints).toBeCloseTo(
      0.19599959823059,
      14,
    )
  })

  it('matches the existing stable helper for the initial hand', () => {
    const input = {
      deckSize: 50,
      targetCount: 4,
      openingHandSize: 7,
      redrawCount: 5,
    }
    expect(calculateMulliganProbability(input).initialHitProbability).toBe(
      calculateAtLeastOneProbability({
        deckSize: input.deckSize,
        targetCount: input.targetCount,
        drawCount: input.openingHandSize,
      }),
    )
  })

  it('makes M=0 identical to the initial hit probability', () => {
    const result = calculateMulliganProbability({
      deckSize: 50,
      targetCount: 4,
      openingHandSize: 7,
      redrawCount: 0,
    })
    expect(result.redrawHitProbabilityGivenMiss).toBe(0)
    expect(result.finalHitProbability).toBe(result.initialHitProbability)
    expect(result.improvementProbabilityPoints).toBe(0)
  })

  it('returns zero throughout when K=0', () => {
    expect(
      calculateMulliganProbability({
        deckSize: 50,
        targetCount: 0,
        openingHandSize: 7,
        redrawCount: 5,
      }),
    ).toMatchObject({
      initialHitProbability: 0,
      initialMissProbability: 1,
      redrawHitProbabilityGivenMiss: 0,
      finalHitProbability: 0,
      improvementProbabilityPoints: 0,
    })
  })

  it('returns 100% and null conditional redraw when initial miss is impossible', () => {
    for (const input of [
      { deckSize: 50, targetCount: 50, openingHandSize: 7, redrawCount: 5 },
      { deckSize: 50, targetCount: 4, openingHandSize: 50, redrawCount: 50 },
    ]) {
      const result = calculateMulliganProbability(input)
      expect(result.initialHitProbability).toBe(1)
      expect(result.initialMissProbability).toBe(0)
      expect(result.redrawHitProbabilityGivenMiss).toBeNull()
      expect(result.finalHitProbability).toBe(1)
      expect(Number.isNaN(result.finalHitProbability)).toBe(false)
    }
  })

  it('uses the full deck again when M equals H', () => {
    const result = calculateMulliganProbability({
      deckSize: 50,
      targetCount: 4,
      openingHandSize: 7,
      redrawCount: 7,
    })
    expect(result.redrawPoolSize).toBe(50)
    expect(result.redrawHitProbabilityGivenMiss).toBe(
      result.initialHitProbability,
    )
  })

  it.each([
    { deckSize: 0, targetCount: 0, openingHandSize: 1, redrawCount: 0 },
    { deckSize: 50, targetCount: 51, openingHandSize: 7, redrawCount: 5 },
    { deckSize: 50, targetCount: 4, openingHandSize: 51, redrawCount: 5 },
    { deckSize: 50, targetCount: 4, openingHandSize: 7, redrawCount: 8 },
    { deckSize: 50.5, targetCount: 4, openingHandSize: 7, redrawCount: 5 },
    { deckSize: 50, targetCount: 4.5, openingHandSize: 7, redrawCount: 5 },
    { deckSize: 50, targetCount: 4, openingHandSize: 7.5, redrawCount: 5 },
    { deckSize: 50, targetCount: 4, openingHandSize: 7, redrawCount: 5.5 },
    { deckSize: 50, targetCount: -1, openingHandSize: 7, redrawCount: 5 },
    { deckSize: 50, targetCount: 4, openingHandSize: -1, redrawCount: 0 },
    { deckSize: 50, targetCount: 4, openingHandSize: 7, redrawCount: -1 },
  ])('rejects invalid input %#', (input) => {
    expect(getMulliganValidationErrors(input).length).toBeGreaterThan(0)
    expect(() => calculateMulliganProbability(input)).toThrow(RangeError)
  })

  it('always returns finite bounded probabilities with final >= initial', () => {
    for (let deckSize = 1; deckSize <= 30; deckSize += 1) {
      for (let targetCount = 0; targetCount <= deckSize; targetCount += 1) {
        for (
          let openingHandSize = 1;
          openingHandSize <= deckSize;
          openingHandSize += 1
        ) {
          const redrawCount = Math.floor(openingHandSize / 2)
          const result = calculateMulliganProbability({
            deckSize,
            targetCount,
            openingHandSize,
            redrawCount,
          })
          for (const probability of [
            result.initialHitProbability,
            result.initialMissProbability,
            result.finalHitProbability,
            result.improvementProbabilityPoints,
            ...(result.redrawHitProbabilityGivenMiss === null
              ? []
              : [result.redrawHitProbabilityGivenMiss]),
          ]) {
            expect(Number.isFinite(probability)).toBe(true)
            expect(probability).toBeGreaterThanOrEqual(0)
            expect(probability).toBeLessThanOrEqual(1)
          }
          expect(result.finalHitProbability).toBeGreaterThanOrEqual(
            result.initialHitProbability,
          )
        }
      }
    }
  })
})
