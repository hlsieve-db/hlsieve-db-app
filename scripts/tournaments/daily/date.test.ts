import { describe, expect, it } from 'vitest'
import { parseTournamentDailyCli } from './cli'
import { parseCalendarDate, yesterdayInTokyo } from './date'

describe('Tournament Daily date', () => {
  it('parses explicit dates and rejects invalid dates', () => {
    expect(parseCalendarDate('2026-10-04')).toBe('2026-10-04')
    expect(() => parseCalendarDate('2026-02-30')).toThrow('Invalid')
  })
  it('uses the previous Asia/Tokyo calendar day across UTC boundaries', () => {
    expect(yesterdayInTokyo(new Date('2026-10-04T15:30:00Z'))).toBe(
      '2026-10-04',
    )
    expect(yesterdayInTokyo(new Date('2026-10-04T14:30:00Z'))).toBe(
      '2026-10-03',
    )
  })
  it('parses both CLI modes and the integration dry-run flag', () => {
    expect(parseTournamentDailyCli(['--date', '2026-10-01'])).toEqual({
      targetDate: '2026-10-01',
      dryRun: false,
    })
    expect(parseTournamentDailyCli(['--date', '2026-10-04'])).toEqual({
      targetDate: '2026-10-04',
      dryRun: false,
    })
    expect(
      parseTournamentDailyCli(
        ['--yesterday', '--dry-run'],
        new Date('2026-10-05T03:00:00Z'),
      ),
    ).toEqual({ targetDate: '2026-10-04', dryRun: true })
  })
})
