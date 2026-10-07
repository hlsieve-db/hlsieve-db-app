import { TOURNAMENT_SERIES_CONFIGS } from '../collector/seriesConfig'

type TournamentDiscoveryCliBase = {
  seriesIds: string[]
  delayMs: number
  saveObservations: boolean
}

export type TournamentDiscoveryCliOptions = TournamentDiscoveryCliBase &
  (
    | { mode: 'overlap'; targetDate: string; overlapDays: number }
    | { mode: 'reconciliation'; from: string; to: string; chunkDays: number }
  )

function optionValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  return index < 0 ? undefined : args[index + 1]
}

export function parseTournamentDiscoveryCli(
  args: string[],
  today = new Date().toISOString().slice(0, 10),
): TournamentDiscoveryCliOptions {
  if (args.includes('--write')) {
    throw new Error('--write is not available for Discovery preview.')
  }
  const date = optionValue(args, '--date')
  const from = optionValue(args, '--from')
  const to = optionValue(args, '--to')
  if (date !== undefined && (from !== undefined || to !== undefined)) {
    throw new Error('Choose either --date or --from/--to.')
  }
  if ((from === undefined) !== (to === undefined)) {
    throw new Error('--from and --to must be provided together.')
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
  const base: TournamentDiscoveryCliBase = {
    seriesIds: seriesValue
      ? seriesValue.split(',').map((value) => value.trim())
      : TOURNAMENT_SERIES_CONFIGS.map((series) => series.seriesId),
    delayMs,
    saveObservations: !args.includes('--no-save-observations'),
  }
  if (from !== undefined && to !== undefined) {
    if (args.includes('--overlap-days')) {
      throw new Error('--overlap-days cannot be used with --from/--to.')
    }
    const chunkValue = optionValue(args, '--chunk-days')
    const chunkDays = chunkValue === undefined ? 7 : Number(chunkValue)
    if (!Number.isSafeInteger(chunkDays) || chunkDays < 1) {
      throw new Error('--chunk-days must be a positive integer.')
    }
    return { ...base, mode: 'reconciliation', from, to, chunkDays }
  }
  if (args.includes('--chunk-days')) {
    throw new Error('--chunk-days requires --from/--to.')
  }
  return {
    ...base,
    mode: 'overlap',
    targetDate: date ?? today,
    overlapDays,
  }
}
