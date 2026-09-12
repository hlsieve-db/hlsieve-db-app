export const MAX_SWISS_PARTICIPANTS = 100_000
export const MAX_SWISS_ROUNDS = 20

export type SwissDistributionInput = {
  participantCount: number
  roundCount: number
}

export type SwissDistributionRow = {
  wins: number
  losses: number
  expectedPlayers: number
  probability: number
}

export function getSwissValidationErrors({
  participantCount,
  roundCount,
}: SwissDistributionInput): string[] {
  const errors: string[] = []

  if (
    !Number.isFinite(participantCount) ||
    !Number.isInteger(participantCount) ||
    participantCount < 2 ||
    participantCount > MAX_SWISS_PARTICIPANTS
  ) {
    errors.push(
      `参加人数は2〜${MAX_SWISS_PARTICIPANTS.toLocaleString('ja-JP')}の整数で入力してください。`,
    )
  }

  if (
    !Number.isFinite(roundCount) ||
    !Number.isInteger(roundCount) ||
    roundCount < 1 ||
    roundCount > MAX_SWISS_ROUNDS
  ) {
    errors.push(
      `スイス回戦数は1〜${MAX_SWISS_ROUNDS}の整数で入力してください。`,
    )
  }

  return errors
}

function calculateCombination(total: number, selected: number): number {
  const count = Math.min(selected, total - selected)
  let result = 1

  for (let index = 1; index <= count; index += 1) {
    result *= (total - count + index) / index
  }

  return result
}

export function calculateSwissDistribution(
  input: SwissDistributionInput,
): SwissDistributionRow[] {
  if (getSwissValidationErrors(input).length > 0) {
    throw new RangeError('Invalid Swiss distribution input.')
  }

  const { participantCount, roundCount } = input
  const possibleOutcomes = 2 ** roundCount

  return Array.from({ length: roundCount + 1 }, (_, index) => {
    const wins = roundCount - index
    const probability =
      calculateCombination(roundCount, wins) / possibleOutcomes

    return {
      wins,
      losses: roundCount - wins,
      expectedPlayers: participantCount * probability,
      probability,
    }
  })
}

export function formatExpectedPlayers(expectedPlayers: number): string {
  if (!Number.isFinite(expectedPlayers) || expectedPlayers < 0) {
    throw new RangeError(
      'Expected players must be a non-negative finite value.',
    )
  }

  return Number.isInteger(expectedPlayers)
    ? `${expectedPlayers.toLocaleString('ja-JP')}人`
    : `約${expectedPlayers.toLocaleString('ja-JP', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}人`
}

export function formatSwissPercentage(probability: number): string {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new RangeError('Probability must be a finite value from 0 to 1.')
  }

  const percentage = probability * 100
  if (percentage > 0 && percentage < 0.1) return '<0.1%'
  return `${percentage.toFixed(1)}%`
}
