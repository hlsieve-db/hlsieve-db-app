import { describe, expect, it } from 'vitest'

import type { SavedTournamentReport } from './savedReport'
import {
  createTournamentBackup,
  createTournamentBackupFilename,
  hasSameTournamentReportContent,
  parseTournamentBackup,
  planTournamentBackupImport,
  serializeTournamentBackup,
  TOURNAMENT_BACKUP_FORMAT,
  TOURNAMENT_BACKUP_VERSION,
} from './backup'

function saved(
  id: string,
  name = `大会${id}`,
  overrides: Partial<SavedTournamentReport> = {},
): SavedTournamentReport {
  return {
    id,
    schemaVersion: 1,
    createdAt: '2026-09-12T00:00:00.000Z',
    updatedAt: '2026-09-13T00:00:00.000Z',
    report: {
      tournamentName: name,
      placement: '優勝',
      participantCount: 32,
      eventDate: '2026-09-12',
      selfOshiCardNumber: 'UNKNOWN-OSHI',
      swissRounds: [
        {
          opponentOshiCardNumber: 'UNKNOWN-OPPONENT',
          playOrder: 'first',
          initiativeChoiceResult: 'won_choice',
          result: 'win',
        },
      ],
      tournamentRounds: [],
    },
    ...overrides,
  }
}

function json(value: unknown): string {
  return JSON.stringify(value)
}

describe('tournament backup export', () => {
  it('creates a versioned, readable backup with stable ordering and preserved records', () => {
    const first = saved('b', '日本語大会')
    const older = saved('a', '先の大会', {
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
    })
    const backup = createTournamentBackup(
      [first, older],
      '2026-09-13T00:00:00.000Z',
    )
    expect(backup).toMatchObject({
      format: TOURNAMENT_BACKUP_FORMAT,
      version: TOURNAMENT_BACKUP_VERSION,
      exportedAt: '2026-09-13T00:00:00.000Z',
    })
    expect(backup.reports.map(({ id }) => id)).toEqual(['a', 'b'])
    expect(backup.reports[1]).toEqual(first)
    expect(serializeTournamentBackup(backup)).toContain('\n  "reports"')
    expect(serializeTournamentBackup(backup)).toContain('日本語大会')
  })

  it('uses a filesystem-safe local-date filename', () => {
    expect(createTournamentBackupFilename(new Date(2026, 8, 13))).toBe(
      'hlsieve-tournament-backup-2026-09-13.json',
    )
  })
})

describe('tournament backup parsing and atomic validation', () => {
  const valid = () =>
    createTournamentBackup([saved('one')], '2026-09-13T00:00:00.000Z')

  it('accepts valid reports with unknown Oshi card numbers', () => {
    const result = parseTournamentBackup(json(valid()))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.backup.reports[0].report.selfOshiCardNumber).toBe(
        'UNKNOWN-OSHI',
      )
    }
  })

  it.each([
    ['invalid JSON', '{', '読み込めません'],
    ['wrong format', json({ ...valid(), format: 'other' }), '対応していません'],
    ['future version', json({ ...valid(), version: 2 }), '対応していません'],
    [
      'invalid exportedAt',
      json({ ...valid(), exportedAt: 'today' }),
      '内容が不正',
    ],
    ['reports not array', json({ ...valid(), reports: {} }), '内容が不正'],
  ])('rejects %s without returning partial data', (_, input, message) => {
    expect(parseTournamentBackup(input)).toEqual({
      ok: false,
      message: expect.stringContaining(message),
    })
  })

  it.each([
    [
      'empty name',
      (value: SavedTournamentReport) => (value.report.tournamentName = ' '),
    ],
    [
      'invalid round enum',
      (value: SavedTournamentReport) =>
        (value.report.swissRounds[0].result = 'other' as 'win'),
    ],
    [
      'too many Swiss rounds',
      (value: SavedTournamentReport) =>
        (value.report.swissRounds = Array.from({ length: 11 }, () => ({}))),
    ],
    [
      'too many Tournament rounds',
      (value: SavedTournamentReport) =>
        (value.report.tournamentRounds = Array.from({ length: 5 }, () => ({}))),
    ],
    [
      'invalid timestamp',
      (value: SavedTournamentReport) => (value.updatedAt = '2026-09-13'),
    ],
  ])('rejects an invalid report: %s', (_, mutate) => {
    const bad = saved('bad')
    mutate(bad)
    const result = parseTournamentBackup(
      json({ ...valid(), reports: [saved('good'), bad] }),
    )
    expect(result).toEqual({
      ok: false,
      message: '2件目の大会戦績が不正なため、読み込みを中止しました。',
    })
  })
})

describe('tournament backup conflict handling', () => {
  it('defines equality independently of property insertion order and ID', () => {
    const left = saved('left')
    const right = { ...saved('right'), report: { ...left.report } }
    expect(hasSameTournamentReportContent(left, right)).toBe(true)
  })

  it('preserves new IDs and skips identical existing records', () => {
    const same = saved('same')
    const fresh = saved('fresh')
    expect(planTournamentBackupImport([same, fresh], [same])).toEqual({
      records: [fresh],
      newCount: 1,
      identicalCount: 1,
      conflictCount: 0,
    })
  })

  it('protects a conflicting record and assigns a unique generated ID', () => {
    const existing = saved('same', '既存')
    const incoming = saved('same', '復元')
    const ids = ['same', 'generated']
    const plan = planTournamentBackupImport(
      [incoming],
      [existing],
      () => ids.shift() ?? 'unused',
    )
    expect(plan).toEqual({
      records: [{ ...incoming, id: 'generated' }],
      newCount: 0,
      identicalCount: 0,
      conflictCount: 1,
    })
    expect(existing.report.tournamentName).toBe('既存')
  })

  it('keeps normal and conflict imports idempotent on re-import', () => {
    const local = saved('same', '既存')
    const incoming = saved('same', '復元')
    const first = planTournamentBackupImport(
      [incoming],
      [local],
      () => 'generated',
    )
    const second = planTournamentBackupImport(
      [incoming],
      [local, ...first.records],
      () => 'another',
    )
    expect(second).toEqual({
      records: [],
      newCount: 0,
      identicalCount: 1,
      conflictCount: 0,
    })
  })

  it('generates distinct IDs for multiple conflicts', () => {
    const existing = [saved('a', 'existing-a'), saved('b', 'existing-b')]
    const ids = ['new-a', 'new-b']
    const plan = planTournamentBackupImport(
      [saved('a', 'incoming-a'), saved('b', 'incoming-b')],
      existing,
      () => ids.shift() ?? 'unused',
    )
    expect(plan.records.map(({ id }) => id)).toEqual(['new-a', 'new-b'])
    expect(plan.conflictCount).toBe(2)
  })
})
