import { describe, expect, it } from 'vitest'

import { createDefaultTournamentReport } from './report'
import {
  createSavedTournamentReport,
  isSavedTournamentReport,
  TOURNAMENT_REPORT_SCHEMA_VERSION,
  updateSavedTournamentReport,
} from './savedReport'

describe('saved tournament report', () => {
  const now = () => '2026-09-12T01:00:00.000Z'

  it('creates a versioned record with stable identity and timestamps', () => {
    const report = createDefaultTournamentReport()
    const saved = createSavedTournamentReport(report, {
      id: () => 'report-1',
      now,
    })
    expect(saved).toEqual({
      id: 'report-1',
      schemaVersion: TOURNAMENT_REPORT_SCHEMA_VERSION,
      report,
      createdAt: now(),
      updatedAt: now(),
    })
    expect(saved.report).not.toBe(report)
  })

  it('updates report data and updatedAt while preserving id and createdAt', () => {
    const saved = createSavedTournamentReport(createDefaultTournamentReport(), {
      id: () => 'report-1',
      now,
    })
    const updated = updateSavedTournamentReport(
      saved,
      {
        ...saved.report,
        tournamentName: '更新大会',
        swissRounds: [
          {
            result: 'draw',
            playOrder: 'second',
            initiativeChoiceResult: 'lost_choice',
          },
        ],
      },
      { now: () => '2026-09-13T02:00:00.000Z' },
    )
    expect(updated.id).toBe(saved.id)
    expect(updated.createdAt).toBe(saved.createdAt)
    expect(updated.updatedAt).toBe('2026-09-13T02:00:00.000Z')
    expect(updated.report.swissRounds[0]).toMatchObject({ result: 'draw' })
  })

  it.each([
    { schemaVersion: 2 },
    {
      report: {
        ...createDefaultTournamentReport(),
        swissRounds: Array(11).fill({}),
      },
    },
    {
      report: {
        ...createDefaultTournamentReport(),
        tournamentRounds: Array(5).fill({}),
      },
    },
    {
      report: {
        ...createDefaultTournamentReport(),
        swissRounds: [{ result: 'unknown' }],
      },
    },
  ])('rejects corrupted persisted data %#', (override) => {
    const valid = createSavedTournamentReport(createDefaultTournamentReport(), {
      id: () => 'valid',
      now,
    })
    expect(isSavedTournamentReport({ ...valid, ...override })).toBe(false)
  })
})
