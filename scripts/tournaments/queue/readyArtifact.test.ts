import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { Card, CardsDataFile } from '../../../src/domain/cards/types'
import type { TournamentImportPayload } from '../../../src/domain/tournaments/types'
import { createTournamentPublishedData } from '../../../src/domain/tournaments/published'
import {
  publishTournamentPublication,
  writeTournamentPublication,
} from '../publication'
import { publishReadyTournamentEvent } from './publishReady'
import { LocalTournamentQueueRepository } from './repository'
import { TournamentReadyArtifactRepository } from './readyArtifact'

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
    representativeImageUrl: `https://example.test/${cardNumber}.png`,
  }
}

const cardsData: CardsDataFile = {
  dataVersion: 'test',
  cards: [
    card('OSHI', 'oshi'),
    card('MAIN', 'holomem'),
    card('CHEER', 'cheer'),
  ],
}

const payload: TournamentImportPayload = {
  format: 'hlsieve-tournament-import',
  formatVersion: 1,
  collectedAt: '2026-10-04T00:00:00.000Z',
  collector: { type: 'test' },
  events: [
    {
      identity: { sourceEventId: '1764903' },
      tournament: {
        type: 'selectioncup',
        round: 'bp08',
        seriesName: 'Selection Cup',
      },
      date: '2026-09-23',
      venue: { slug: 'venue', name: 'Venue' },
      resultCoverage: { kind: 'exact', maxRank: 1 },
      results: [
        {
          rank: 1,
          oshiCardNumber: 'OSHI',
          deckLogCode: 'CODE',
          deck: {
            oshi: [{ cardNumber: 'OSHI', quantity: 1 }],
            main: [{ cardNumber: 'MAIN', quantity: 50 }],
            cheer: [{ cardNumber: 'CHEER', quantity: 20 }],
          },
        },
      ],
      source: { sourceType: 'test', sourceEventId: '1764903' },
    },
  ],
}

describe('Tournament ready artifact', () => {
  it('atomically writes and revalidates a normalized artifact', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'hlsieve-ready-'))
    const repository = new TournamentReadyArtifactRepository(root)
    const saved = await repository.save('1764903', payload, cardsData)
    expect(saved.event.source.sourceEventId).toBe('1764903')
    expect(saved.semanticHash).toMatch(/^[a-f0-9]{64}$/)
    expect(await repository.load('1764903', cardsData)).toEqual(saved)
    expect(await readFile(repository.path('1764903'), 'utf8')).not.toMatch(
      /playerName|queue|lease/i,
    )
  })

  it('rejects missing, corrupt, mismatched, and tampered artifacts', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'hlsieve-ready-'))
    const repository = new TournamentReadyArtifactRepository(root)
    await expect(repository.load('1764903', cardsData)).rejects.toThrow(
      /missing or corrupt/,
    )
    await repository.save('1764903', payload, cardsData)
    const path = repository.path('1764903')
    const artifact = JSON.parse(await readFile(path, 'utf8')) as Record<
      string,
      unknown
    >
    await writeFile(path, '{broken', 'utf8')
    await expect(repository.load('1764903', cardsData)).rejects.toThrow(
      /missing or corrupt/,
    )
    artifact.sourceEventId = '1'
    await writeFile(path, JSON.stringify(artifact), 'utf8')
    await expect(repository.load('1764903', cardsData)).rejects.toThrow(
      /metadata/,
    )
    artifact.sourceEventId = '1764903'
    artifact.semanticHash = '0'.repeat(64)
    await writeFile(path, JSON.stringify(artifact), 'utf8')
    await expect(repository.load('1764903', cardsData)).rejects.toThrow(
      /integrity/,
    )
  })

  it('dry-runs then atomically writes publication while leaving queue ready', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'hlsieve-ready-publish-'))
    const artifacts = new TournamentReadyArtifactRepository(
      resolve(root, 'ready'),
    )
    const queue = new LocalTournamentQueueRepository({
      path: resolve(root, 'queue.json'),
    })
    await queue.enqueue('1764903', payload.collectedAt)
    await queue.claimDue(payload.collectedAt, 60_000)
    await queue.transition('1764903', 'ready')
    await artifacts.save('1764903', payload, cardsData)
    const publicDirectory = resolve(root, 'public')
    const seed = resolve(root, 'seed')
    await writeTournamentPublication(
      createTournamentPublishedData([], cardsData.cards, cardsData.dataVersion),
      seed,
    )
    await publishTournamentPublication(seed, publicDirectory)

    const dryRun = await publishReadyTournamentEvent({
      sourceEventId: '1764903',
      write: false,
      queue,
      artifacts,
      cardsData,
      publicDirectory,
      stagingDirectory: resolve(root, 'preview'),
    })
    expect(dryRun).toMatchObject({
      eventAdded: 1,
      resultAdded: 1,
      pending: 0,
      indexEvents: 1,
      indexResults: 1,
    })
    expect(
      JSON.parse(
        await readFile(resolve(publicDirectory, 'index.json'), 'utf8'),
      ),
    ).toMatchObject({ events: [] })

    const written = await publishReadyTournamentEvent({
      sourceEventId: '1764903',
      write: true,
      queue,
      artifacts,
      cardsData,
      publicDirectory,
      stagingDirectory: resolve(root, 'write'),
    })
    expect(
      written.generatedFiles.some((file) =>
        file.startsWith('public/tournaments/events/evt_'),
      ),
    ).toBe(true)
    expect(
      JSON.parse(
        await readFile(resolve(publicDirectory, 'index.json'), 'utf8'),
      ),
    ).toMatchObject({ events: [{ resultCount: 1 }] })
    const eventFile = written.generatedFiles
      .find((file) => file.includes('/events/'))!
      .split('/')
      .at(-1)!
    const publishedText = await readFile(
      resolve(publicDirectory, 'events', eventFile),
      'utf8',
    )
    expect(publishedText).not.toMatch(
      /playerName|submitter|queue|lease|local path|diagnostic|synthetic/i,
    )
    expect(
      JSON.parse(
        await readFile(resolve(publicDirectory, 'oshi-master.json'), 'utf8'),
      ),
    ).toMatchObject({
      cards: {
        OSHI: {
          representativeImageUrl: 'https://example.test/OSHI.png',
        },
      },
    })
    expect((await queue.load()).records[0]?.status).toBe('ready')

    const conflictingPayload = structuredClone(payload)
    conflictingPayload.events[0]!.date = '2026-09-24'
    await artifacts.save('1764903', conflictingPayload, cardsData)
    await expect(
      publishReadyTournamentEvent({
        sourceEventId: '1764903',
        write: true,
        queue,
        artifacts,
        cardsData,
        publicDirectory,
        stagingDirectory: resolve(root, 'conflict'),
      }),
    ).rejects.toThrow(/pending conflicts/)
    expect((await queue.load()).records[0]?.status).toBe('ready')
  })
})
