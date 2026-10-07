import { describe, expect, it, vi } from 'vitest'

import { runTournamentDailyDiscoveryPhase } from './discoveryPhase'
import type { TournamentDiscoveryRunResult } from '../discovery/types'

function run(
  overrides: Partial<TournamentDiscoveryRunResult['summary']> = {},
): TournamentDiscoveryRunResult {
  return {
    runId: 'run-1',
    startedAt: '2026-10-07T00:00:00.000Z',
    completedAt: '2026-10-07T00:00:01.000Z',
    mode: 'daily',
    requestedRange: { from: '2026-10-03', to: '2026-10-06' },
    queries: [],
    candidates: [],
    summary: {
      attemptedQueries: 1,
      successfulQueries: 1,
      zeroResultQueries: 1,
      saturatedQueries: 0,
      failedQueries: 0,
      challengeQueries: 0,
      observedCandidates: 0,
      uniqueCandidates: 0,
      ...overrides,
    },
  }
}

const intakeResult = {
  candidateCount: 0,
  uniqueCandidateCount: 0,
  added: [],
  existing: [],
  rejected: [],
}

describe('Tournament Daily Discovery phase', () => {
  it('reports a source failure as degraded without invoking Intake', async () => {
    const intake = vi.fn(async () => intakeResult)
    await expect(
      runTournamentDailyDiscoveryPhase({
        discover: async () => {
          throw new Error('source unavailable')
        },
        intake,
      }),
    ).resolves.toEqual({ status: 'degraded', error: 'source unavailable' })
    expect(intake).not.toHaveBeenCalled()
  })

  it.each(['saturatedQueries', 'failedQueries', 'challengeQueries'] as const)(
    'continues Intake and reports degraded when %s is nonzero',
    async (field) => {
      const discovery = run({ [field]: 1 })
      const intake = vi.fn(async () => intakeResult)
      await expect(
        runTournamentDailyDiscoveryPhase({
          discover: async () => discovery,
          intake,
        }),
      ).resolves.toMatchObject({
        status: 'degraded',
        discovery,
        intake: intakeResult,
      })
      expect(intake).toHaveBeenCalledWith(discovery.candidates)
    },
  )

  it('propagates Queue safety failures', async () => {
    await expect(
      runTournamentDailyDiscoveryPhase({
        discover: async () => run(),
        intake: async () => {
          throw new Error('queue corrupt')
        },
      }),
    ).rejects.toThrow('queue corrupt')
  })
})
