import { calculateAtLeastOneProbability } from './atLeastOneProbability'

export type MulliganProbabilityInput = {
  deckSize: number
  targetCount: number
  openingHandSize: number
  redrawCount: number
}

export type MulliganProbabilityResult = {
  initialHitProbability: number
  initialMissProbability: number
  redrawHitProbabilityGivenMiss: number | null
  finalHitProbability: number
  improvementProbabilityPoints: number
  redrawPoolSize: number
}

export function getMulliganValidationErrors({
  deckSize,
  targetCount,
  openingHandSize,
  redrawCount,
}: MulliganProbabilityInput): string[] {
  const errors: string[] = []
  const deckSizeIsInteger = Number.isInteger(deckSize)
  const targetCountIsInteger = Number.isInteger(targetCount)
  const openingHandSizeIsInteger = Number.isInteger(openingHandSize)
  const redrawCountIsInteger = Number.isInteger(redrawCount)

  if (!Number.isFinite(deckSize) || !deckSizeIsInteger || deckSize < 1) {
    errors.push('現在の山札枚数は1以上の整数で入力してください。')
  }
  if (
    !Number.isFinite(targetCount) ||
    !targetCountIsInteger ||
    targetCount < 0
  ) {
    errors.push('対象カードの枚数は0以上の整数で入力してください。')
  } else if (deckSizeIsInteger && deckSize >= 1 && targetCount > deckSize) {
    errors.push('対象カードの枚数は現在の山札枚数以下にしてください。')
  }
  if (
    !Number.isFinite(openingHandSize) ||
    !openingHandSizeIsInteger ||
    openingHandSize < 1
  ) {
    errors.push('初手枚数は1以上の整数で入力してください。')
  } else if (deckSizeIsInteger && deckSize >= 1 && openingHandSize > deckSize) {
    errors.push('初手枚数は現在の山札枚数以下にしてください。')
  }
  if (
    !Number.isFinite(redrawCount) ||
    !redrawCountIsInteger ||
    redrawCount < 0
  ) {
    errors.push('引き直す枚数は0以上の整数で入力してください。')
  } else if (
    openingHandSizeIsInteger &&
    openingHandSize >= 1 &&
    redrawCount > openingHandSize
  ) {
    errors.push('引き直す枚数は初手枚数以下にしてください。')
  }

  if (
    deckSizeIsInteger &&
    deckSize >= 1 &&
    openingHandSizeIsInteger &&
    openingHandSize >= 1 &&
    openingHandSize <= deckSize &&
    redrawCountIsInteger &&
    redrawCount >= 0 &&
    redrawCount <= openingHandSize
  ) {
    const redrawPoolSize = deckSize - (openingHandSize - redrawCount)
    if (redrawPoolSize < redrawCount) {
      errors.push('引き直し時の山札枚数が引き直す枚数より少なくなります。')
    }
  }

  return errors
}

export function calculateMulliganProbability(
  input: MulliganProbabilityInput,
): MulliganProbabilityResult {
  if (getMulliganValidationErrors(input).length > 0) {
    throw new RangeError('Invalid mulligan probability input.')
  }

  const { deckSize, targetCount, openingHandSize, redrawCount } = input
  const initialHitProbability = calculateAtLeastOneProbability({
    deckSize,
    targetCount,
    drawCount: openingHandSize,
  })
  const initialMissProbability = 1 - initialHitProbability
  const redrawPoolSize = deckSize - (openingHandSize - redrawCount)

  if (initialMissProbability === 0) {
    return {
      initialHitProbability,
      initialMissProbability,
      redrawHitProbabilityGivenMiss: null,
      finalHitProbability: 1,
      improvementProbabilityPoints: 0,
      redrawPoolSize,
    }
  }

  const redrawHitProbabilityGivenMiss =
    redrawCount === 0
      ? 0
      : calculateAtLeastOneProbability({
          deckSize: redrawPoolSize,
          targetCount,
          drawCount: redrawCount,
        })
  const finalHitProbability = Math.min(
    1,
    Math.max(
      0,
      initialHitProbability +
        initialMissProbability * redrawHitProbabilityGivenMiss,
    ),
  )

  return {
    initialHitProbability,
    initialMissProbability,
    redrawHitProbabilityGivenMiss,
    finalHitProbability,
    improvementProbabilityPoints: finalHitProbability - initialHitProbability,
    redrawPoolSize,
  }
}
