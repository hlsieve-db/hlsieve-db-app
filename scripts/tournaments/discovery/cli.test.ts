import { describe, expect, it } from 'vitest'

import { parseTournamentDiscoveryCli } from './cli'

describe('Tournament Discovery CLI', () => {
  it('uses a four-day preview window configuration by default', () => {
    expect(parseTournamentDiscoveryCli([], '2026-10-07')).toMatchObject({
      targetDate: '2026-10-07',
      overlapDays: 4,
      delayMs: 3_000,
      saveObservations: true,
    })
  })

  it('accepts explicit date, overlap, series, and delay options', () => {
    expect(
      parseTournamentDiscoveryCli([
        '--date',
        '2026-10-06',
        '--overlap-days',
        '2',
        '--series',
        '3463,3396',
        '--delay-ms',
        '0',
        '--no-save-observations',
      ]),
    ).toEqual({
      targetDate: '2026-10-06',
      overlapDays: 2,
      seriesIds: ['3463', '3396'],
      delayMs: 0,
      saveObservations: false,
    })
  })

  it('rejects Queue writes during Discovery-1', () => {
    expect(() => parseTournamentDiscoveryCli(['--write'])).toThrow(
      '--write is not available in Discovery-1.',
    )
  })
})
