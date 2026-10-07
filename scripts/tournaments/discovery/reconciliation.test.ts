import { describe, expect, it, vi } from 'vitest'

import { emptyTournamentQueue, enqueueTournament } from '../queue/queue'
import {
  combineTournamentDiscoveryRuns,
  createTournamentReconciliationPreview,
  runTournamentReconciliation,
} from './reconciliation'
import type { TournamentDiscoveryRunResult } from './types'

const NOW = '2026-10-07T00:00:00.000Z'

describe('Tournament reconciliation', () => {
  it('uses the Discovery Core in date chunks without gaps or duplicates', async () => {
    const queries: string[] = []
    const saveRun = vi.fn(async () => {})
    const result = await runTournamentReconciliation({
      source: {
        query: async (seriesId, date) => {
          queries.push(`${seriesId}:${date}`)
          return date === '2026-10-06' ? ['1771029', '1771029'] : []
        },
      },
      seriesIds: ['3463', '3396'],
      dates: ['2026-10-04', '2026-10-05', '2026-10-06'],
      chunkDays: 2,
      now: () => NOW,
      saveRun,
    })

    expect(queries).toEqual([
      '3463:2026-10-04',
      '3463:2026-10-05',
      '3396:2026-10-04',
      '3396:2026-10-05',
      '3463:2026-10-06',
      '3396:2026-10-06',
    ])
    expect(saveRun).toHaveBeenCalledTimes(2)
    expect(result.requestedRange).toEqual({
      from: '2026-10-04',
      to: '2026-10-06',
    })
    expect(
      result.candidates.map((candidate) => candidate.sourceEventId),
    ).toEqual(['1771029'])
  })

  it('is safely rerunnable and never consults observations to skip queries', async () => {
    const query = vi.fn(async () => ['1771029'])
    const options = {
      source: { query },
      seriesIds: ['3463'],
      dates: ['2026-10-06'],
      now: () => NOW,
    }
    await runTournamentReconciliation(options)
    await runTournamentReconciliation(options)
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('prefers a later non-saturated context across chunks', async () => {
    const query = (
      date: string,
      saturated: boolean,
    ): TournamentDiscoveryRunResult => ({
      runId: date,
      startedAt: NOW,
      completedAt: NOW,
      mode: 'reconciliation',
      requestedRange: { from: date, to: date },
      queries: [
        {
          seriesId: saturated ? '3396' : '3463',
          date,
          attemptedAt: NOW,
          outcome: saturated ? 'saturated' : 'observed',
          observedCount: saturated ? 10 : 1,
          candidateIds: ['1771029'],
          saturated,
          zeroResultObserved: false,
        },
      ],
      candidates: [
        {
          sourceEventId: '1771029',
          sourceUrl: 'https://www.bushi-navi.com/event/result/1771029',
          seriesId: saturated ? '3396' : '3463',
          observedForDate: date,
          discoveredAt: NOW,
        },
      ],
      summary: {
        attemptedQueries: 1,
        successfulQueries: 1,
        zeroResultQueries: 0,
        saturatedQueries: saturated ? 1 : 0,
        failedQueries: 0,
        challengeQueries: 0,
        observedCandidates: 1,
        uniqueCandidates: 1,
      },
    })

    const combined = combineTournamentDiscoveryRuns([
      query('2026-09-22', true),
      query('2026-10-06', false),
    ])
    expect(combined.candidates).toEqual([
      expect.objectContaining({
        sourceEventId: '1771029',
        seriesId: '3463',
        observedForDate: '2026-10-06',
      }),
    ])
  })

  it('reports new, existing, saturation, zero, failure, and challenge', () => {
    const discovery: TournamentDiscoveryRunResult = {
      runId: 'run',
      startedAt: NOW,
      completedAt: NOW,
      mode: 'reconciliation',
      requestedRange: { from: '2026-10-03', to: '2026-10-06' },
      queries: [
        {
          seriesId: '3463',
          date: '2026-10-03',
          attemptedAt: NOW,
          outcome: 'observed',
          observedCount: 0,
          candidateIds: [],
          saturated: false,
          zeroResultObserved: true,
        },
        {
          seriesId: '3463',
          date: '2026-10-04',
          attemptedAt: NOW,
          outcome: 'saturated',
          observedCount: 10,
          candidateIds: ['1', '2'],
          saturated: true,
          zeroResultObserved: false,
        },
        {
          seriesId: '3463',
          date: '2026-10-05',
          attemptedAt: NOW,
          outcome: 'failed',
          candidateIds: [],
          saturated: false,
          zeroResultObserved: false,
          errorCode: 'source-error',
        },
        {
          seriesId: '3463',
          date: '2026-10-06',
          attemptedAt: NOW,
          outcome: 'challenge',
          candidateIds: [],
          saturated: false,
          zeroResultObserved: false,
          errorCode: 'source-challenge',
        },
      ],
      candidates: [
        {
          sourceEventId: '1',
          sourceUrl: 'https://www.bushi-navi.com/event/result/1',
          seriesId: '3463',
          observedForDate: '2026-10-04',
          discoveredAt: NOW,
        },
        {
          sourceEventId: '2',
          sourceUrl: 'https://www.bushi-navi.com/event/result/2',
          seriesId: '3463',
          observedForDate: '2026-10-04',
          discoveredAt: NOW,
        },
        {
          sourceEventId: 'bad',
          sourceUrl: 'bad',
          seriesId: '3463',
          observedForDate: '2026-10-04',
          discoveredAt: NOW,
        },
      ],
      summary: {
        attemptedQueries: 4,
        successfulQueries: 2,
        zeroResultQueries: 1,
        saturatedQueries: 1,
        failedQueries: 1,
        challengeQueries: 1,
        observedCandidates: 2,
        uniqueCandidates: 3,
      },
    }
    const queue = enqueueTournament(emptyTournamentQueue(), '1', NOW)
    const snapshot = structuredClone(queue)
    const report = createTournamentReconciliationPreview(discovery, queue)

    expect(report).toMatchObject({
      bestEffort: true,
      completenessGuaranteed: false,
      summary: {
        existingEvents: 1,
        newEvents: 1,
        rejectedCandidates: 1,
      },
      existingEventIds: ['1'],
    })
    expect(report.newEvents.map((event) => event.sourceEventId)).toEqual(['2'])
    expect(report.saturatedQueries).toEqual([
      {
        seriesId: '3463',
        date: '2026-10-04',
        observedCount: 10,
        completeness: 'unknown',
      },
    ])
    expect(report.problemQueries.map((query) => query.outcome)).toEqual([
      'failed',
      'challenge',
    ])
    expect(queue).toEqual(snapshot)
  })
})
