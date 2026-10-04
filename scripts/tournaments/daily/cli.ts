import { parseCalendarDate, yesterdayInTokyo } from './date'

export type TournamentDailyCliOptions = { targetDate: string; dryRun: boolean }

export function parseTournamentDailyCli(
  args: string[],
  now = new Date(),
): TournamentDailyCliOptions {
  const dryRun = args.includes('--dry-run')
  const filtered = args.filter((arg) => arg !== '--dry-run')
  if (filtered.length === 1 && filtered[0] === '--yesterday') {
    return { targetDate: yesterdayInTokyo(now), dryRun }
  }
  if (filtered.length === 2 && filtered[0] === '--date' && filtered[1]) {
    return { targetDate: parseCalendarDate(filtered[1]), dryRun }
  }
  throw new Error(
    'Usage: tournaments:daily -- --yesterday|--date YYYY-MM-DD [--dry-run]',
  )
}
