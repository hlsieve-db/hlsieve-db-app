export type AtLeastOneProbabilityInput = {
  deckSize: number
  targetCount: number
  drawCount: number
}

export function getProbabilityValidationErrors({
  deckSize,
  targetCount,
  drawCount,
}: AtLeastOneProbabilityInput): string[] {
  const errors: string[] = []
  const deckSizeIsInteger =
    Number.isFinite(deckSize) && Number.isInteger(deckSize)
  const targetCountIsInteger =
    Number.isFinite(targetCount) && Number.isInteger(targetCount)
  const drawCountIsInteger =
    Number.isFinite(drawCount) && Number.isInteger(drawCount)

  if (!deckSizeIsInteger || deckSize < 1) {
    errors.push('現在の山札枚数は1以上の整数で入力してください。')
  }
  if (!targetCountIsInteger || targetCount < 0) {
    errors.push('対象カードの枚数は0以上の整数で入力してください。')
  } else if (deckSizeIsInteger && deckSize >= 1 && targetCount > deckSize) {
    errors.push('対象カードの枚数は現在の山札枚数以下にしてください。')
  }
  if (!drawCountIsInteger || drawCount < 1) {
    errors.push('見る枚数は1以上の整数で入力してください。')
  } else if (deckSizeIsInteger && deckSize >= 1 && drawCount > deckSize) {
    errors.push('見る枚数は現在の山札枚数以下にしてください。')
  }

  return errors
}

export function calculateAtLeastOneProbability(
  input: AtLeastOneProbabilityInput,
): number {
  if (getProbabilityValidationErrors(input).length > 0) {
    throw new RangeError('Invalid probability calculation input.')
  }

  const { deckSize, targetCount, drawCount } = input
  if (targetCount === 0) return 0
  if (targetCount === deckSize) return 1

  let probabilityOfNoTarget = 1
  for (let index = 0; index < drawCount; index += 1) {
    const nonTargetRemaining = deckSize - targetCount - index
    if (nonTargetRemaining <= 0) return 1
    probabilityOfNoTarget *= nonTargetRemaining / (deckSize - index)
  }

  return Math.min(1, Math.max(0, 1 - probabilityOfNoTarget))
}

export function formatProbability(probability: number): string {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new RangeError('Probability must be a finite value from 0 to 1.')
  }
  if (probability === 0) return '0%'
  if (probability === 1) return '100%'
  const percentage = probability * 100
  if (percentage < 0.1) return '<0.1%'
  if (percentage > 99.9) return '>99.9%'
  return `${percentage.toFixed(1)}%`
}
