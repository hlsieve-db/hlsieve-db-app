import { describe, expect, it, vi } from 'vitest'

import { createDefaultTournamentReport } from '../domain/tournamentReport/report'
import type { SavedTournamentReport } from '../domain/tournamentReport/savedReport'
import {
  createTournamentReportRepository,
  type TournamentReportPersistenceAdapter,
} from './tournamentReportRepository'

function memoryPersistence(
  initial: unknown[] = [],
): TournamentReportPersistenceAdapter {
  const records = new Map(
    initial.map((value) => [(value as { id: string }).id, value]),
  )
  return {
    getAll: vi.fn(async () => [...records.values()]),
    get: vi.fn(async (id) => records.get(id)),
    put: vi.fn(async (value) => void records.set(value.id, value)),
    delete: vi.fn(async (id) => void records.delete(id)),
  }
}

describe('tournamentReportRepository', () => {
  it('creates, gets, updates the same ID, lists, and deletes reports', async () => {
    let time = '2026-09-12T00:00:00.000Z'
    const persistence = memoryPersistence()
    const repository = createTournamentReportRepository(persistence, {
      id: () => 'report-1',
      now: () => time,
    })
    const created = await repository.createReport({
      ...createDefaultTournamentReport(),
      tournamentName: '大会',
    })
    expect(created.id).toBe('report-1')
    expect(created.createdAt).toBe(time)
    await expect(repository.getReport('report-1')).resolves.toEqual(created)

    time = '2026-09-13T00:00:00.000Z'
    const updated = await repository.updateReport('report-1', {
      ...created.report,
      placement: '優勝',
    })
    expect(updated.id).toBe(created.id)
    expect(updated.createdAt).toBe(created.createdAt)
    expect(updated.updatedAt).toBe(time)
    expect(await repository.listReports()).toEqual([updated])

    await repository.deleteReport('report-1')
    await expect(repository.getReport('report-1')).resolves.toBeUndefined()
  })

  it('sorts dated reports first by event date, then undated reports by updatedAt', async () => {
    const make = (
      id: string,
      eventDate: string | undefined,
      updatedAt: string,
    ) =>
      ({
        id,
        schemaVersion: 1,
        report: { ...createDefaultTournamentReport(), eventDate },
        createdAt: updatedAt,
        updatedAt,
      }) satisfies SavedTournamentReport
    const repository = createTournamentReportRepository(
      memoryPersistence([
        make('undated-new', undefined, '2026-09-20T00:00:00.000Z'),
        make('dated-old', '2026-09-10', '2026-09-21T00:00:00.000Z'),
        make('dated-new', '2026-09-12', '2026-09-12T00:00:00.000Z'),
        make('undated-old', undefined, '2026-09-11T00:00:00.000Z'),
      ]),
    )
    expect((await repository.listReports()).map(({ id }) => id)).toEqual([
      'dated-new',
      'dated-old',
      'undated-new',
      'undated-old',
    ])
  })

  it('skips corrupt records and refuses to update a missing record', async () => {
    const repository = createTournamentReportRepository(
      memoryPersistence([{ id: 'broken', schemaVersion: 99 }]),
    )
    await expect(repository.listReports()).resolves.toEqual([])
    await expect(repository.getReport('broken')).resolves.toBeUndefined()
    await expect(
      repository.updateReport('broken', createDefaultTournamentReport()),
    ).rejects.toThrow('not found')
  })
})
