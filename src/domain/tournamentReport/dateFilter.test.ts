import { describe, expect, it } from 'vitest'

import type { SavedTournamentReport } from './savedReport'
import {
  filterTournamentReportsByDate,
  localTodayDateOnly,
  type TournamentStatsDateFilter,
} from './dateFilter'

function saved(id: string, eventDate?: string): SavedTournamentReport {
  return {
    id,
    schemaVersion: 1,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2030-01-01T00:00:00.000Z',
    report: {
      tournamentName: id,
      placement: '',
      eventDate,
      swissRounds: [],
      tournamentRounds: [],
    },
  }
}

const run = (
  reports: SavedTournamentReport[],
  filter: TournamentStatsDateFilter,
  today = '2026-09-13',
) => filterTournamentReportsByDate({ reports, filter, today })

describe('filterTournamentReportsByDate', () => {
  it('returns all reports including missing and future dates', () => {
    const reports = [
      saved('missing'),
      saved('past', '2020-01-01'),
      saved('future', '2030-01-01'),
    ]
    expect(run(reports, { type: 'all' }).reports).toEqual(reports)
  })

  it('uses an inclusive 30-calendar-day range', () => {
    const result = run(
      [
        saved('today', '2026-09-13'),
        saved('oldest', '2026-08-15'),
        saved('too-old', '2026-08-14'),
        saved('future', '2026-09-14'),
      ],
      { type: 'last30' },
    )
    expect(result.reports.map(({ id }) => id)).toEqual(['today', 'oldest'])
    expect(result.label).toBe('直近30日')
  })

  it('uses an inclusive 90-calendar-day range across month boundaries', () => {
    const result = run(
      [
        saved('today', '2026-09-13'),
        saved('oldest', '2026-06-16'),
        saved('too-old', '2026-06-15'),
      ],
      { type: 'last90' },
    )
    expect(result.reports.map(({ id }) => id)).toEqual(['today', 'oldest'])
  })

  it('includes Jan 1 through today for this year and excludes past/future dates', () => {
    const result = run(
      [
        saved('jan1', '2026-01-01'),
        saved('today', '2026-09-13'),
        saved('past', '2025-12-31'),
        saved('future', '2026-09-14'),
      ],
      { type: 'thisYear' },
    )
    expect(result.reports.map(({ id }) => id)).toEqual(['jan1', 'today'])
  })

  it('excludes missing event dates from filtered periods and reports their count', () => {
    const result = run([saved('missing'), saved('dated', '2026-09-13')], {
      type: 'last30',
    })
    expect(result.reports.map(({ id }) => id)).toEqual(['dated'])
    expect(result.missingEventDateCount).toBe(1)
  })

  it('uses inclusive custom boundaries and allows an explicit future range', () => {
    const result = run(
      [
        saved('before', '2026-08-31'),
        saved('start', '2026-09-01'),
        saved('end', '2026-09-30'),
        saved('after', '2026-10-01'),
      ],
      { type: 'custom', startDate: '2026-09-01', endDate: '2026-09-30' },
    )
    expect(result.reports.map(({ id }) => id)).toEqual(['start', 'end'])
    expect(result.label).toBe('2026/09/01 ～ 2026/09/30')
  })

  it('requires both custom dates and rejects a reversed range', () => {
    expect(run([], { type: 'custom', startDate: '', endDate: '' }).error).toBe(
      '開始日と終了日を入力してください。',
    )
    expect(
      run([], {
        type: 'custom',
        startDate: '2026-09-30',
        endDate: '2026-09-01',
      }).error,
    ).toBe('開始日は終了日以前の日付を指定してください。')
  })

  it('handles leap-day, month and year boundaries as date-only values', () => {
    expect(
      run([saved('leap', '2024-02-29')], { type: 'last30' }, '2024-03-01')
        .reports,
    ).toHaveLength(1)
    expect(
      run([saved('year', '2025-12-31')], { type: 'last30' }, '2026-01-01')
        .reports,
    ).toHaveLength(1)
  })

  it('derives today from browser-local calendar fields, not UTC date text', () => {
    const date = new Date(2026, 8, 13, 0, 30)
    expect(localTodayDateOnly(date)).toBe('2026-09-13')
  })
})
