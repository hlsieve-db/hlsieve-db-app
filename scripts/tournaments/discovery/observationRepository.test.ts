import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { TournamentDiscoveryObservationRepository } from './observationRepository'
import type { TournamentDiscoveryRunResult } from './types'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  )
})

function run(
  runId: string,
  attemptedAt: string,
  candidateIds: string[],
): TournamentDiscoveryRunResult {
  return {
    runId,
    startedAt: attemptedAt,
    completedAt: attemptedAt,
    mode: 'manual',
    requestedRange: { from: '2026-10-06', to: '2026-10-06' },
    queries: [
      {
        seriesId: '3463',
        date: '2026-10-06',
        attemptedAt,
        outcome: 'observed',
        observedCount: candidateIds.length,
        candidateIds,
        saturated: false,
        zeroResultObserved: candidateIds.length === 0,
      },
    ],
    candidates: [],
    summary: {
      attemptedQueries: 1,
      successfulQueries: 1,
      zeroResultQueries: candidateIds.length === 0 ? 1 : 0,
      saturatedQueries: 0,
      failedQueries: 0,
      challengeQueries: 0,
      observedCandidates: candidateIds.length,
      uniqueCandidates: candidateIds.length,
    },
  }
}

describe('Tournament Discovery observations', () => {
  it('keeps cumulative discovered IDs even when later runs omit an ID', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tournament-discovery-'))
    roots.push(root)
    const repository = new TournamentDiscoveryObservationRepository(root)

    await repository.saveRun(
      run('run-1', '2026-10-07T00:00:00.000Z', ['A', 'B']),
    )
    await repository.saveRun(
      run('run-2', '2026-10-07T03:00:00.000Z', ['A', 'B', 'C']),
    )
    await repository.saveRun(
      run('run-3', '2026-10-07T06:00:00.000Z', ['A', 'C']),
    )

    await expect(
      repository.loadObservation('3463', '2026-10-06'),
    ).resolves.toMatchObject({
      discoveredIds: ['A', 'B', 'C'],
      observedCount: 2,
      attemptCount: 3,
    })
    const lines = (await readFile(join(root, 'runs.jsonl'), 'utf8'))
      .trim()
      .split('\n')
    expect(lines.map((line) => JSON.parse(line).runId)).toEqual([
      'run-1',
      'run-2',
      'run-3',
    ])
  })
})
