import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  queue: {
    format: 'hlsieve-tournament-queue' as const,
    formatVersion: 1 as const,
    records: [
      {
        sourceEventId: 'existing-review',
        status: 'needs-review' as const,
        firstSubmittedAt: '2026-10-01T00:00:00.000Z',
        lastSubmittedAt: '2026-10-01T00:00:00.000Z',
        attemptCount: 1,
        lastErrorCode: 'duplicate-rank',
      },
    ],
  },
  queueAfter: undefined as
    | undefined
    | {
        format: 'hlsieve-tournament-queue'
        formatVersion: 1
        records: Array<{
          sourceEventId: string
          status: 'needs-review'
          firstSubmittedAt: string
          lastSubmittedAt: string
          attemptCount: number
          lastErrorCode: string
        }>
      },
  loadCount: 0,
  degraded: true,
  selectionError: undefined as Error | undefined,
  logs: [] as string[],
  errors: [] as string[],
}))

const NOW = '2026-10-07T00:00:00.000Z'

vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn(async () => ({
      newContext: vi.fn(async () => ({ newPage: vi.fn(async () => ({})) })),
      close: vi.fn(),
    })),
  },
}))

vi.mock('./git', () => ({
  assertDailyGitStart: vi.fn(async () => 'synced'),
  assertDailyRecoveryCommit: vi.fn(),
  fetchAndAssertNotBehind: vi.fn(),
  publicationDiff: vi.fn(async () => []),
  commitDailyPublication: vi.fn(),
  pushDailyCommit: vi.fn(),
}))

vi.mock('./lock', () => ({ acquireDailyLock: vi.fn(async () => vi.fn()) }))
vi.mock('./checkpoint', () => ({
  readDailyCheckpoint: vi.fn(async () => undefined),
  writeDailyCheckpoint: vi.fn(),
}))
vi.mock('./dateSelection', () => ({
  selectDueTournamentEventsForDate: vi.fn(async () => {
    if (state.selectionError) throw state.selectionError
    return { selected: [], unselected: [], probed: [] }
  }),
  processSelectedTournamentEvents: vi.fn(),
}))
vi.mock('../discovery/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../discovery/core')>()),
  runTournamentDiscovery: vi.fn(async () => ({
    runId: 'run-live-regression',
    startedAt: '2026-10-07T00:00:00.000Z',
    completedAt: '2026-10-07T00:00:01.000Z',
    mode: 'daily',
    requestedRange: { from: '2026-10-03', to: '2026-10-06' },
    queries: [],
    candidates: [],
    summary: {
      attemptedQueries: 2,
      successfulQueries: 1,
      zeroResultQueries: 1,
      saturatedQueries: 0,
      failedQueries: state.degraded ? 1 : 0,
      challengeQueries: 0,
      observedCandidates: 0,
      uniqueCandidates: 0,
    },
  })),
}))
vi.mock('../discovery/bushiNaviSource', () => ({
  createBushiNaviDiscoverySource: vi.fn(() => ({ query: vi.fn() })),
}))
vi.mock('../discovery/observationRepository', () => ({
  TournamentDiscoveryObservationRepository: class {
    saveRun = vi.fn()
  },
}))
vi.mock('../queue/repository', () => ({
  LocalTournamentQueueRepository: class {
    load = vi.fn(async () => {
      state.loadCount += 1
      const queue =
        state.queueAfter && state.loadCount >= 3
          ? state.queueAfter
          : state.queue
      return structuredClone(queue)
    })
    automatedIntake = vi.fn(async () => ({
      candidateCount: 0,
      uniqueCandidateCount: 0,
      added: [],
      existing: [],
      rejected: [],
    }))
    setOfficialEventDate = vi.fn()
    transition = vi.fn()
  },
}))
vi.mock('../queue/readyArtifact', () => ({
  TournamentReadyArtifactRepository: class {
    load = vi.fn()
  },
}))
vi.mock('../queue/publishReady', () => ({
  publishReadyTournamentEvents: vi.fn(),
}))
vi.mock('./production', () => ({
  waitForProductionPublication: vi.fn(),
  smokeProductionUi: vi.fn(),
}))
vi.mock('./childProcess', () => ({ runNpmScript: vi.fn() }))
vi.mock('../collector/bushiNavi', () => ({
  probeKnownTournamentEventMetadata: vi.fn(),
}))

describe('Tournament Daily executable integration', () => {
  const originalArgv = process.argv
  const originalExitCode = process.exitCode

  beforeEach(() => {
    vi.resetModules()
    state.logs.length = 0
    state.errors.length = 0
    state.loadCount = 0
    state.queueAfter = undefined
    state.queue.records = [
      {
        sourceEventId: 'existing-review',
        status: 'needs-review',
        firstSubmittedAt: '2026-10-01T00:00:00.000Z',
        lastSubmittedAt: '2026-10-01T00:00:00.000Z',
        attemptCount: 1,
        lastErrorCode: 'duplicate-rank',
      },
    ]
    state.degraded = true
    state.selectionError = undefined
    process.argv = ['node', 'runDaily.ts', '--date', '2026-10-06']
    process.exitCode = undefined
    vi.spyOn(console, 'log').mockImplementation((value) => {
      state.logs.push(String(value))
    })
    vi.spyOn(console, 'error').mockImplementation((value) => {
      state.errors.push(String(value))
    })
  })

  afterEach(() => {
    process.argv = originalArgv
    process.exitCode = originalExitCode
    vi.restoreAllMocks()
  })

  it('completes a degraded no-op without leaking block-scoped selection', async () => {
    await expect(import('./runDaily')).resolves.toBeDefined()
    const summaryLine = state.logs.find((line) => line.includes('dailySummary'))
    expect(summaryLine).toBeDefined()
    expect(JSON.parse(summaryLine!).dailySummary).toMatchObject({
      runStatus: 'degraded',
      exitReason: 'discovery-incomplete',
      exitCode: 0,
      processing: {
        selected: [],
        processed: [],
        newNeedsReviewThisRun: [],
      },
      queue: {
        existingNeedsReview: ['existing-review'],
        newNeedsReviewThisRun: [],
      },
    })
    expect(process.exitCode).toBe(0)
  })

  it('reports success with exit 0 on a clean no-op run', async () => {
    state.degraded = false
    state.queue.records = []
    await expect(import('./runDaily')).resolves.toBeDefined()
    const summaryLine = state.logs.find((line) => line.includes('dailySummary'))
    expect(JSON.parse(summaryLine!).dailySummary).toMatchObject({
      runStatus: 'success',
      exitReason: 'completed',
      exitCode: 0,
    })
    expect(process.exitCode).toBe(0)
  })

  it('reports action-required only for a review added during this run', async () => {
    state.degraded = false
    state.queue.records = []
    state.queueAfter = {
      format: 'hlsieve-tournament-queue',
      formatVersion: 1,
      records: [
        {
          sourceEventId: 'new-review',
          status: 'needs-review',
          firstSubmittedAt: NOW,
          lastSubmittedAt: NOW,
          attemptCount: 1,
          lastErrorCode: 'unknown-card',
        },
      ],
    }
    await expect(import('./runDaily')).resolves.toBeDefined()
    const summaryLine = state.logs.find((line) => line.includes('dailySummary'))
    expect(JSON.parse(summaryLine!).dailySummary).toMatchObject({
      runStatus: 'action-required',
      exitReason: 'new-needs-review',
      exitCode: 2,
      queue: {
        existingNeedsReview: [],
        newNeedsReviewThisRun: ['new-review'],
      },
    })
    expect(process.exitCode).toBe(2)
  })

  it('reports fatal with exit 1 when date selection cannot continue safely', async () => {
    state.selectionError = new Error('selection failed')
    await expect(import('./runDaily')).resolves.toBeDefined()
    const summaryLine = state.errors.find((line) =>
      line.includes('dailySummary'),
    )
    expect(JSON.parse(summaryLine!).dailySummary).toEqual({
      runStatus: 'fatal',
      exitReason: 'selection failed',
    })
    expect(process.exitCode).toBe(1)
  })
})
