import { parseCalendarDate, yesterdayInTokyo } from './date'

export type TournamentDailyCliOptions = {
  targetDate: string
  dryRun: boolean
  lookbackDays: 4 | 7
}

export function parseTournamentDailyCli(
  args: string[],
  now = new Date(),
): TournamentDailyCliOptions {
  const dryRun = args.includes('--dry-run')
  const lookbackIndex = args.indexOf('--lookback-days')
  const lookbackDays =
    lookbackIndex === -1 ? 4 : Number(args[lookbackIndex + 1])
  if (lookbackDays !== 4 && lookbackDays !== 7) {
    throw new Error('Tournament lookback must be 4 or 7 days.')
  }
  const filtered = args.filter(
    (arg, index) =>
      arg !== '--dry-run' &&
      (lookbackIndex === -1 ||
        (index !== lookbackIndex && index !== lookbackIndex + 1)),
  )
  if (filtered.length === 1 && filtered[0] === '--yesterday') {
    return { targetDate: yesterdayInTokyo(now), dryRun, lookbackDays }
  }
  if (filtered.length === 2 && filtered[0] === '--date' && filtered[1]) {
    return {
      targetDate: parseCalendarDate(filtered[1]),
      dryRun,
      lookbackDays,
    }
  }
  throw new Error(
    'Usage: tournaments:daily -- --yesterday|--date YYYY-MM-DD [--lookback-days 7] [--dry-run]',
  )
}
