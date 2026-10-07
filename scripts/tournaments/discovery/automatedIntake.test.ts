import { describe, expect, it } from 'vitest'

import {
  planAutomatedTournamentIntake,
  type TournamentAutomatedIntakeResult,
} from './automatedIntake'
import type { TournamentDiscoveryCandidate } from './types'
import type { TournamentQueueFile, TournamentQueueStatus } from '../queue/queue'

const NOW = '2026-10-07T00:00:00.000Z'

function candidate(sourceEventId: string): TournamentDiscoveryCandidate {
  return {
    sourceEventId,
    sourceUrl: `https://www.bushi-navi.com/event/result/${sourceEventId}`,
    seriesId: '3463',
    observedForDate: '2026-10-06',
    discoveredAt: NOW,
  }
}

function queue(
  statuses: readonly TournamentQueueStatus[],
): TournamentQueueFile {
  return {
    format: 'hlsieve-tournament-queue',
    formatVersion: 1,
    records: statuses.map((status, index) => ({
      sourceEventId: String(index + 1),
      status,
      firstSubmittedAt: '2026-10-01T00:00:00.000Z',
      lastSubmittedAt: '2026-10-02T00:00:00.000Z',
      attemptCount: index,
      ...(status === 'collecting'
        ? { leaseUntil: '2026-10-07T01:00:00.000Z' }
        : {}),
      ...(status === 'waiting-result'
        ? {
            nextAttemptAt: '2026-10-08T00:00:00.000Z',
            lastErrorCode: 'result-not-published',
          }
        : {}),
      ...(status === 'published'
        ? { publishedEventId: `evt_${index + 1}` }
        : {}),
      ...(status === 'needs-review'
        ? { lastErrorCode: 'review-required' }
        : {}),
    })),
  }
}

describe('Automated Tournament Intake', () => {
  it('adds only new candidates and deduplicates a run', () => {
    const current = queue(['queued'])
    const plan = planAutomatedTournamentIntake(
      current,
      [candidate('1771029'), candidate('1771029')],
      NOW,
    )

    expect(plan.result).toEqual<TournamentAutomatedIntakeResult>({
      candidateCount: 2,
      uniqueCandidateCount: 1,
      added: ['1771029'],
      existing: [],
      rejected: [],
    })
    expect(plan.queue.records.at(-1)).toEqual({
      sourceEventId: '1771029',
      status: 'queued',
      firstSubmittedAt: NOW,
      lastSubmittedAt: NOW,
      attemptCount: 0,
    })
  })

  it.each([
    'queued',
    'collecting',
    'waiting-result',
    'ready',
    'published',
    'needs-review',
  ] as const)('leaves an existing %s record completely unchanged', (status) => {
    const current = queue([status])
    const snapshot = structuredClone(current)
    const plan = planAutomatedTournamentIntake(current, [candidate('1')], NOW)

    expect(plan.result).toMatchObject({ added: [], existing: ['1'] })
    expect(plan.queue).toBe(current)
    expect(plan.queue).toEqual(snapshot)
  })

  it('rejects malformed candidates without changing the queue', () => {
    const current = queue([])
    const invalid = {
      ...candidate('1771029'),
      sourceUrl: 'https://example.com/event/1771029',
    }
    const plan = planAutomatedTournamentIntake(current, [invalid], NOW)

    expect(plan.queue).toBe(current)
    expect(plan.result.rejected).toEqual([
      {
        sourceEventId: '1771029',
        reason: 'Candidate source URL is not canonical.',
      },
    ])
  })
})
