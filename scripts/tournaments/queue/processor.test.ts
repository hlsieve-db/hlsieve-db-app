import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { Card, CardsDataFile } from '../../../src/domain/cards/types'
import type { TournamentImportEvent } from '../../../src/domain/tournaments/types'
import { KnownEventCollectionError } from '../collector/bushiNavi'
import { processOneTournamentQueueItem } from './processor'
import { LocalTournamentQueueRepository } from './repository'

const NOW = '2026-10-04T00:00:00.000Z'

function card(cardNumber: string, cardType: Card['cardType']): Card {
  return {
    cardNumber,
    name: cardNumber,
    cardType,
    colors: [],
    isBuzz: false,
    tags: [],
    abilities: [],
    arts: [],
    batonPass: [],
    effectTags: [],
    criticalColors: [],
    rarities: [],
    products: [],
    illustrators: [],
    qas: [],
    searchText: cardNumber,
  }
}

const cardsData: CardsDataFile = {
  dataVersion: 'test',
  cards: [
    card('OSHI-1', 'oshi'),
    card('MAIN-1', 'holomem'),
    card('CHEER-1', 'cheer'),
  ],
}

function event(mainCardNumber = 'MAIN-1'): TournamentImportEvent {
  return {
    identity: { sourceEventId: '1764903' },
    tournament: {
      type: 'selectioncup',
      round: 'bp08',
      seriesName: 'Selection Cup',
    },
    date: '2026-09-23',
    venue: { slug: 'venue-test', name: 'Test Venue' },
    participantCount: 60,
    resultCoverage: { kind: 'exact', maxRank: 1 },
    results: [
      {
        rank: 1,
        oshiCardNumber: 'OSHI-1',
        deckLogCode: 'CODE1',
        deck: {
          oshi: [{ cardNumber: 'OSHI-1', quantity: 1 }],
          main: [{ cardNumber: mainCardNumber, quantity: 50 }],
          cheer: [{ cardNumber: 'CHEER-1', quantity: 20 }],
        },
      },
    ],
    source: {
      sourceType: 'bushi-navi-public-browser-dom',
      sourceEventId: '1764903',
      sourceUrl: 'https://www.bushi-navi.com/event/result/1764903',
    },
  }
}

async function repository(): Promise<LocalTournamentQueueRepository> {
  const root = await mkdtemp(resolve(tmpdir(), 'hlsieve-processor-'))
  const path = resolve(root, '.cache/tournaments/queue/queue.json')
  await mkdir(dirname(path), { recursive: true })
  const repository = new LocalTournamentQueueRepository({ path })
  await repository.enqueue('1764903', NOW)
  return repository
}

describe('Tournament queue processor', () => {
  it('claims one Event and marks a fully valid dry-run as ready', async () => {
    const repo = await repository()
    await expect(
      processOneTournamentQueueItem({
        repository: repo,
        cardsData,
        collect: async () => event(),
        now: NOW,
        leaseDurationMs: 60_000,
      }),
    ).resolves.toEqual({ sourceEventId: '1764903', status: 'ready' })
    expect((await repo.load()).records[0]?.status).toBe('ready')
    expect((await repo.load()).records[0]).not.toHaveProperty('leaseUntil')
  })

  it('routes metadata-valid zero Results to waiting-result', async () => {
    const repo = await repository()
    const result = await processOneTournamentQueueItem({
      repository: repo,
      cardsData,
      collect: async () => {
        throw new KnownEventCollectionError(
          'result-not-published',
          'not published',
        )
      },
      now: NOW,
      leaseDurationMs: 60_000,
    })
    expect(result.status).toBe('waiting-result')
    expect((await repo.load()).records[0]).toMatchObject({
      status: 'waiting-result',
      nextAttemptAt: '2026-10-05T00:00:00.000Z',
    })
    expect((await repo.load()).records[0]).not.toHaveProperty('leaseUntil')
  })

  it('routes review errors and any validation pending record to needs-review', async () => {
    const reviewRepo = await repository()
    await processOneTournamentQueueItem({
      repository: reviewRepo,
      cardsData,
      collect: async () => {
        throw new KnownEventCollectionError('unknown-series', 'unknown')
      },
      now: NOW,
      leaseDurationMs: 60_000,
    })
    expect((await reviewRepo.load()).records[0]).toMatchObject({
      status: 'needs-review',
      lastErrorCode: 'unknown-series',
    })
    expect((await reviewRepo.load()).records[0]).not.toHaveProperty(
      'leaseUntil',
    )

    const pendingRepo = await repository()
    const result = await processOneTournamentQueueItem({
      repository: pendingRepo,
      cardsData,
      collect: async () => event('UNKNOWN'),
      now: NOW,
      leaseDurationMs: 60_000,
    })
    expect(result).toMatchObject({
      status: 'needs-review',
      errorCode: 'validation-failed',
    })
  })

  it('never classifies a generic source error as waiting-result', async () => {
    const repo = await repository()
    const result = await processOneTournamentQueueItem({
      repository: repo,
      cardsData,
      collect: async () => {
        throw new KnownEventCollectionError(
          'generic-source-error',
          'generic error',
        )
      },
      now: NOW,
      leaseDurationMs: 60_000,
    })
    expect(result).toMatchObject({
      status: 'needs-review',
      errorCode: 'generic-source-error',
    })
  })

  it.each([
    [
      'deck-navigation-failed',
      new KnownEventCollectionError('deck-navigation-failed', 'timeout'),
    ],
    [
      'deck-parse-failed',
      new KnownEventCollectionError('deck-parse-failed', 'parse'),
    ],
    ['collector-failed', new Error('unexpected')],
  ])('recovers %s without retaining the lease', async (errorCode, failure) => {
    const repo = await repository()
    const result = await processOneTournamentQueueItem({
      repository: repo,
      cardsData,
      collect: async () => {
        throw failure
      },
      now: NOW,
      leaseDurationMs: 60_000,
    })
    expect(result).toMatchObject({ status: 'needs-review', errorCode })
    expect((await repo.load()).records[0]).toMatchObject({
      status: 'needs-review',
      lastErrorCode: errorCode,
    })
    expect((await repo.load()).records[0]).not.toHaveProperty('leaseUntil')
  })

  it('classifies normalization failure without publishing', async () => {
    const repo = await repository()
    const malformed = event()
    malformed.results = undefined as unknown as TournamentImportEvent['results']
    const result = await processOneTournamentQueueItem({
      repository: repo,
      cardsData,
      collect: async () => malformed,
      now: NOW,
      leaseDurationMs: 60_000,
    })
    expect(result).toMatchObject({
      status: 'needs-review',
      errorCode: 'validation-failed',
    })
  })

  it('processes at most one claimed item per call and never publishes', async () => {
    const repo = await repository()
    await repo.enqueue('1729427', '2026-10-04T00:00:01.000Z')
    await processOneTournamentQueueItem({
      repository: repo,
      cardsData,
      collect: async () => event(),
      now: NOW,
      leaseDurationMs: 60_000,
    })
    expect(
      (await repo.load()).records.filter(
        (record) => record.status === 'queued',
      ),
    ).toHaveLength(1)
    expect(
      (await repo.load()).records.some(
        (record) => record.status === 'published',
      ),
    ).toBe(false)
  })
})
