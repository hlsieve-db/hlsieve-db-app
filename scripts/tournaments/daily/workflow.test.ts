import { describe, expect, it, vi } from 'vitest'
import type { TournamentEvent } from '../../../src/domain/tournaments/types'
import type { TournamentQueueFile } from '../queue/queue'
import type { TournamentReadyArtifact } from '../queue/readyArtifact'
import { runDailyWorkflow, type DailyDependencies } from './workflow'

function event(sourceEventId: string, date: string): TournamentEvent {
  return {
    id: `evt_${sourceEventId}`,
    tournament: { type: 'bloomcup', seriesName: 'Bloom' },
    date,
    venue: { slug: 'venue', name: 'Venue' },
    resultCoverage: { kind: 'exact', maxRank: 8 },
    results: [
      {
        id: `res_${sourceEventId}`,
        rank: 1,
        oshiCardNumber: 'OSHI',
        deck: { oshi: [], main: [], cheer: [] },
      },
    ],
    source: { sourceType: 'test', sourceEventId },
  }
}
function queue(
  statuses: Array<
    [string, 'ready' | 'waiting-result' | 'needs-review' | 'published']
  >,
): TournamentQueueFile {
  return {
    format: 'hlsieve-tournament-queue',
    formatVersion: 1,
    records: statuses.map(([sourceEventId, status]) => ({
      sourceEventId,
      status,
      firstSubmittedAt: '2026-10-01T00:00:00.000Z',
      lastSubmittedAt: '2026-10-01T00:00:00.000Z',
      attemptCount: 1,
      ...(status === 'published'
        ? { publishedEventId: `evt_${sourceEventId}` }
        : {}),
    })),
  }
}
function artifact(
  sourceEventId: string,
  date: string,
): TournamentReadyArtifact {
  const value = event(sourceEventId, date)
  return {
    format: 'hlsieve-tournament-ready-artifact',
    formatVersion: 1,
    validatorVersion: 1,
    sourceEventId,
    collectedAt: '2026-10-05T00:00:00.000Z',
    semanticHash: 'hash',
    payload: {
      format: 'hlsieve-tournament-import',
      formatVersion: 1,
      collectedAt: '2026-10-05T00:00:00.000Z',
      collector: { type: 'test' },
      events: [],
    },
    event: value,
  }
}
function dependencies(q: TournamentQueueFile): DailyDependencies {
  return {
    assertGitStart: vi.fn(async () => 'synced'),
    processDue: vi.fn(async () => ['1']),
    loadQueue: vi.fn(async () => q),
    loadArtifact: vi.fn(async (id) =>
      artifact(id, id === '1' ? '2026-10-04' : '2026-10-03'),
    ),
    publish: vi.fn(async (ids, write) => ({
      sourceEventId: ids.join(','),
      write,
      eventAdded: ids.length,
      resultAdded: ids.length,
      pending: 0,
      indexEvents: ids.length,
      indexResults: ids.length,
      oshiMasterCards: 1,
      generatedFiles: [],
      publishedEventIds: Object.fromEntries(ids.map((id) => [id, `evt_${id}`])),
      datasetVersion: 'version',
    })),
    fetchAndAssertSync: vi.fn(),
    publicationDiff: vi.fn(async () => ['public/tournaments/index.json']),
    commit: vi.fn(async () => 'sha'),
    push: vi.fn(),
    production: vi.fn(),
    transitionPublished: vi.fn(),
  }
}

describe('Tournament Daily workflow', () => {
  it('publishes only target-date ready Events and leaves waiting/review unchanged', async () => {
    const deps = dependencies(
      queue([
        ['1', 'ready'],
        ['2', 'ready'],
        ['3', 'waiting-result'],
        ['4', 'needs-review'],
        ['5', 'published'],
      ]),
    )
    const result = await runDailyWorkflow(
      { targetDate: '2026-10-04', dryRun: false },
      deps,
    )
    expect(result).toMatchObject({
      ready: ['1'],
      waiting: ['3'],
      review: ['4'],
      published: ['1'],
      exitCode: 2,
      production: 'ok',
    })
    expect(deps.publish).toHaveBeenNthCalledWith(1, ['1'], false)
    expect(deps.publish).toHaveBeenNthCalledWith(2, ['1'], true)
    expect(deps.transitionPublished).toHaveBeenCalledWith('1', 'evt_1')
    expect(deps.production).toHaveBeenCalledTimes(1)
  })
  it('never writes, commits, pushes, or transitions during a dry-run', async () => {
    const deps = dependencies(queue([['1', 'ready']]))
    await runDailyWorkflow({ targetDate: '2026-10-04', dryRun: true }, deps)
    expect(deps.publish).toHaveBeenCalledTimes(1)
    expect(deps.commit).not.toHaveBeenCalled()
    expect(deps.push).not.toHaveBeenCalled()
    expect(deps.transitionPublished).not.toHaveBeenCalled()
  })
  it('does not mark published when push or Production verification fails', async () => {
    for (const stage of ['push', 'production'] as const) {
      const deps = dependencies(queue([['1', 'ready']]))
      vi.mocked(deps[stage]).mockRejectedValue(new Error(stage))
      await expect(
        runDailyWorkflow({ targetDate: '2026-10-04', dryRun: false }, deps),
      ).rejects.toThrow(stage)
      expect(deps.transitionPublished).not.toHaveBeenCalled()
    }
  })
  it('does not write or transition when publication validation fails', async () => {
    const deps = dependencies(queue([['1', 'ready']]))
    vi.mocked(deps.publish).mockRejectedValueOnce(new Error('validation'))
    await expect(
      runDailyWorkflow({ targetDate: '2026-10-04', dryRun: false }, deps),
    ).rejects.toThrow('validation')
    expect(deps.publish).toHaveBeenCalledTimes(1)
    expect(deps.commit).not.toHaveBeenCalled()
    expect(deps.transitionPublished).not.toHaveBeenCalled()
  })
  it('is a no-op when the target date has no ready Event', async () => {
    const deps = dependencies(
      queue([
        ['2', 'ready'],
        ['5', 'published'],
      ]),
    )
    const result = await runDailyWorkflow(
      { targetDate: '2026-10-04', dryRun: false },
      deps,
    )
    expect(result.published).toEqual([])
    expect(deps.publish).not.toHaveBeenCalled()
    expect(deps.push).not.toHaveBeenCalled()
  })
  it('never recollects or republishes an already published Event', async () => {
    const deps = dependencies(queue([['5', 'published']]))
    const result = await runDailyWorkflow(
      { targetDate: '2026-10-04', dryRun: false },
      deps,
    )
    expect(result.published).toEqual([])
    expect(deps.loadArtifact).not.toHaveBeenCalled()
    expect(deps.publish).not.toHaveBeenCalled()
  })
  it('resumes the existing same-day commit without creating a duplicate commit', async () => {
    const deps = dependencies(queue([['1', 'ready']]))
    vi.mocked(deps.assertGitStart).mockResolvedValue('commit-pending-push')
    vi.mocked(deps.publicationDiff).mockResolvedValue([])
    vi.mocked(deps.commit).mockResolvedValue(undefined)
    await runDailyWorkflow({ targetDate: '2026-10-04', dryRun: false }, deps)
    expect(deps.commit).toHaveBeenCalledWith([])
    expect(deps.push).toHaveBeenCalledTimes(1)
  })
})
