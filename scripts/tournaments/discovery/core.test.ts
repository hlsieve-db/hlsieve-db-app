import { describe, expect, it } from 'vitest'

import {
  createInclusiveDateRange,
  createOverlapDates,
  runTournamentDiscovery,
  type TournamentDiscoverySource,
} from './core'

const TIMES = [
  '2026-10-07T00:00:00.000Z',
  '2026-10-07T00:00:01.000Z',
  '2026-10-07T00:00:02.000Z',
  '2026-10-07T00:00:03.000Z',
]

function clock(): () => string {
  let index = 0
  return () => TIMES[index++] ?? TIMES.at(-1)!
}

describe('Tournament Discovery core', () => {
  it('discovers the 1771029 fixture as a candidate without Queue state', async () => {
    const source: TournamentDiscoverySource = {
      query: async () => ['1771029'],
    }
    const result = await runTournamentDiscovery({
      source,
      seriesIds: ['3463'],
      dates: ['2026-10-06'],
      now: clock(),
      createRunId: () => 'run-1',
    })

    expect(result.candidates).toEqual([
      {
        sourceEventId: '1771029',
        sourceUrl: 'https://www.bushi-navi.com/event/result/1771029',
        seriesId: '3463',
        observedForDate: '2026-10-06',
        discoveredAt: '2026-10-07T00:00:01.000Z',
      },
    ])
    expect(result.candidates[0]).not.toHaveProperty('status')
    expect(result.candidates[0]).not.toHaveProperty('results')
    expect(result.queries[0]).toMatchObject({
      outcome: 'observed',
      observedCount: 1,
      candidateIds: ['1771029'],
      saturated: false,
      zeroResultObserved: false,
    })
  })

  it('deduplicates candidates while retaining per-query observations', async () => {
    const source: TournamentDiscoverySource = {
      query: async (_seriesId, date) =>
        date === '2026-10-05' ? ['1', '2', '2'] : ['2', '3'],
    }
    const result = await runTournamentDiscovery({
      source,
      seriesIds: ['3463'],
      dates: ['2026-10-05', '2026-10-06'],
      now: clock(),
      createRunId: () => 'run-1',
    })

    expect(result.queries.map((query) => query.candidateIds)).toEqual([
      ['1', '2'],
      ['2', '3'],
    ])
    expect(
      result.candidates.map((candidate) => candidate.sourceEventId),
    ).toEqual(['1', '2', '3'])
    expect(result.summary.observedCandidates).toBe(4)
    expect(result.summary.uniqueCandidates).toBe(3)
  })

  it('prefers a non-saturated observation when an Event appears in conflicting queries', async () => {
    const source: TournamentDiscoverySource = {
      query: async (_seriesId, date) =>
        date === '2026-09-22'
          ? [
              '1771029',
              ...Array.from({ length: 9 }, (_, index) => String(index + 1)),
            ]
          : ['1771029'],
    }
    const result = await runTournamentDiscovery({
      source,
      seriesIds: ['3463'],
      dates: ['2026-09-22', '2026-10-06'],
      now: clock(),
      createRunId: () => 'run-1',
    })

    expect(
      result.candidates.find(
        (candidate) => candidate.sourceEventId === '1771029',
      ),
    ).toMatchObject({ observedForDate: '2026-10-06' })
    expect(result.queries[0]?.saturated).toBe(true)
  })

  it('distinguishes zero, saturation, failure, and challenge', async () => {
    const responses: Array<readonly string[] | Error> = [
      [],
      Array.from({ length: 10 }, (_, index) => String(index + 1)),
      new Error('temporary source error'),
      new Error('CloudFront 403 challenge'),
    ]
    const source: TournamentDiscoverySource = {
      query: async () => {
        const response = responses.shift()!
        if (response instanceof Error) throw response
        return response
      },
    }
    const result = await runTournamentDiscovery({
      source,
      seriesIds: ['3463'],
      dates: ['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06'],
      now: clock(),
      createRunId: () => 'run-1',
    })

    expect(result.queries.map((query) => query.outcome)).toEqual([
      'observed',
      'saturated',
      'failed',
      'challenge',
    ])
    expect(result.queries[0]).toMatchObject({
      observedCount: 0,
      zeroResultObserved: true,
    })
    expect(result.queries[1]).toMatchObject({
      observedCount: 10,
      saturated: true,
    })
    expect(result.queries[2]?.observedCount).toBeUndefined()
    expect(result.queries[3]?.errorCode).toBe('source-challenge')
  })

  it('retries only transient result-count changes up to the configured bound', async () => {
    let attempts = 0
    const source: TournamentDiscoverySource = {
      query: async () => {
        attempts += 1
        if (attempts < 3) {
          throw new Error('Bushi Navi result count changed during discovery.')
        }
        return ['1771029']
      },
    }
    const result = await runTournamentDiscovery({
      source,
      seriesIds: ['3463'],
      dates: ['2026-10-06'],
      resultCountChangedRetries: 2,
      now: clock(),
      createRunId: () => 'run-retry',
    })
    expect(attempts).toBe(3)
    expect(result.queries[0]).toMatchObject({
      outcome: 'observed',
      candidateIds: ['1771029'],
    })
  })

  it('records a failed query after bounded result-count retries are exhausted', async () => {
    let attempts = 0
    const result = await runTournamentDiscovery({
      source: {
        query: async () => {
          attempts += 1
          throw new Error('Bushi Navi result count changed during discovery.')
        },
      },
      seriesIds: ['3463'],
      dates: ['2026-10-06'],
      resultCountChangedRetries: 2,
      now: clock(),
      createRunId: () => 'run-retry-failed',
    })
    expect(attempts).toBe(3)
    expect(result.queries[0]).toMatchObject({
      outcome: 'failed',
      errorCode: 'source-error',
    })
  })

  it('does not retry challenges or unrelated source failures', async () => {
    for (const error of [
      new Error('CloudFront 403 challenge'),
      new Error('other source error'),
    ]) {
      let attempts = 0
      await runTournamentDiscovery({
        source: {
          query: async () => {
            attempts += 1
            throw error
          },
        },
        seriesIds: ['3463'],
        dates: ['2026-10-06'],
        resultCountChangedRetries: 2,
        now: clock(),
      })
      expect(attempts).toBe(1)
    }
  })

  it('builds a configurable inclusive overlap window', () => {
    expect(createOverlapDates('2026-10-06')).toEqual([
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
    ])
    expect(createOverlapDates('2026-03-01', 2)).toEqual([
      '2026-02-28',
      '2026-03-01',
    ])
  })

  it('builds an inclusive range without gaps or duplicates', () => {
    expect(createInclusiveDateRange('2026-09-19', '2026-09-22')).toEqual([
      '2026-09-19',
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
    ])
    expect(() => createInclusiveDateRange('2026-09-20', '2026-09-19')).toThrow(
      'must not be after',
    )
  })
})
