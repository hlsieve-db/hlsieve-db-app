import { TOURNAMENT_SERIES_CONFIGS } from '../collector/seriesConfig'

export type TournamentDiscoveryCliOptions = {
  targetDate: string
  overlapDays: number
  seriesIds: string[]
  delayMs: number
  saveObservations: boolean
}

function optionValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  return index < 0 ? undefined : args[index + 1]
}

export function parseTournamentDiscoveryCli(
  args: string[],
  today = new Date().toISOString().slice(0, 10),
): TournamentDiscoveryCliOptions {
  if (args.includes('--write')) {
    throw new Error('--write is not available in Discovery-1.')
  }
  const overlapValue = optionValue(args, '--overlap-days')
  const overlapDays = overlapValue === undefined ? 4 : Number(overlapValue)
  if (!Number.isSafeInteger(overlapDays) || overlapDays < 1) {
    throw new Error('--overlap-days must be a positive integer.')
  }
  const delayValue = optionValue(args, '--delay-ms')
  const delayMs = delayValue === undefined ? 3_000 : Number(delayValue)
  if (!Number.isSafeInteger(delayMs) || delayMs < 0) {
    throw new Error('--delay-ms must be a non-negative integer.')
  }
  const seriesValue = optionValue(args, '--series')
  return {
    targetDate: optionValue(args, '--date') ?? today,
    overlapDays,
    seriesIds: seriesValue
      ? seriesValue.split(',').map((value) => value.trim())
      : TOURNAMENT_SERIES_CONFIGS.map((series) => series.seriesId),
    delayMs,
    saveObservations: !args.includes('--no-save-observations'),
  }
}
