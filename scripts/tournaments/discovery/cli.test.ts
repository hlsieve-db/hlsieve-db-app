import { describe, expect, it } from 'vitest'

import { parseTournamentDiscoveryCli } from './cli'

describe('Tournament Discovery CLI', () => {
  it('uses a four-day preview window configuration by default', () => {
    expect(parseTournamentDiscoveryCli([], '2026-10-07')).toMatchObject({
      mode: 'overlap',
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
      mode: 'overlap',
      targetDate: '2026-10-06',
      overlapDays: 2,
      seriesIds: ['3463', '3396'],
      delayMs: 0,
      saveObservations: false,
    })
  })

  it('rejects Queue writes during Discovery-1', () => {
    expect(() => parseTournamentDiscoveryCli(['--write'])).toThrow(
      '--write is not available for Discovery preview.',
    )
  })

  it('parses an inclusive reconciliation range', () => {
    expect(
      parseTournamentDiscoveryCli([
        '--from',
        '2026-09-19',
        '--to',
        '2026-10-07',
        '--chunk-days',
        '5',
        '--series',
        '3463',
      ]),
    ).toMatchObject({
      mode: 'reconciliation',
      from: '2026-09-19',
      to: '2026-10-07',
      chunkDays: 5,
      seriesIds: ['3463'],
    })
  })

  it('rejects ambiguous or incomplete range options', () => {
    expect(() =>
      parseTournamentDiscoveryCli([
        '--date',
        '2026-10-07',
        '--from',
        '2026-09-19',
        '--to',
        '2026-10-07',
      ]),
    ).toThrow('Choose either --date or --from/--to.')
    expect(() => parseTournamentDiscoveryCli(['--from', '2026-09-19'])).toThrow(
      '--from and --to must be provided together.',
    )
    expect(() =>
      parseTournamentDiscoveryCli([
        '--from',
        '2026-09-19',
        '--to',
        '2026-10-07',
        '--overlap-days',
        '4',
      ]),
    ).toThrow('--overlap-days cannot be used with --from/--to.')
  })
})
