import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Card, CardsDataFile } from '../../../src/domain/cards/types'
import type { TournamentImportEvent } from '../../../src/domain/tournaments/types'
import { createTournamentPublishedData } from '../../../src/domain/tournaments/published'
import { runTournamentDiscovery } from '../discovery/core'
import { writeTournamentPublication } from '../publication'
import { processOneTournamentQueueItem } from '../queue/processor'
import { publishReadyTournamentEvents } from '../queue/publishReady'
import { LocalTournamentQueueRepository } from '../queue/repository'
import { TournamentReadyArtifactRepository } from '../queue/readyArtifact'
import { selectDueTournamentEventsForDate } from './dateSelection'
import { runDailyWorkflow } from './workflow'

const NOW = '2026-10-07T00:00:00.000Z'
const roots: string[] = []

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  )
})

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
  dataVersion: 'test-cards',
  cards: [
    card('OSHI-1', 'oshi'),
    card('MAIN-1', 'holomem'),
    card('CHEER-1', 'cheer'),
  ],
}

function collectedEvent(): TournamentImportEvent {
  return {
    identity: { sourceEventId: '1771029' },
    tournament: {
      type: 'selectioncup',
      environment: 'bp09',
      seriesName: 'Selection Cup',
    },
    date: '2026-10-06',
    venue: { slug: 'venue', name: 'Venue' },
    participantCount: 19,
    resultCoverage: { kind: 'exact', maxRank: 1 },
    results: [
      {
        rank: 1,
        oshiCardNumber: 'OSHI-1',
        deckLogCode: 'CODE',
        deck: {
          oshi: [{ cardNumber: 'OSHI-1', quantity: 1 }],
          main: [{ cardNumber: 'MAIN-1', quantity: 50 }],
          cheer: [{ cardNumber: 'CHEER-1', quantity: 20 }],
        },
      },
    ],
    source: {
      sourceType: 'fixture',
      sourceEventId: '1771029',
      sourceUrl: 'https://www.bushi-navi.com/event/result/1771029',
    },
  }
}

describe('Tournament Daily full-chain integration', () => {
  it.each([false, true])(
    'runs Discovery through published with degraded=%s',
    async (degraded) => {
      const root = await mkdtemp(resolve(tmpdir(), 'daily-full-chain-'))
      roots.push(root)
      const queue = new LocalTournamentQueueRepository({
        path: resolve(root, 'queue.json'),
      })
      const artifacts = new TournamentReadyArtifactRepository(
        resolve(root, 'ready'),
      )
      const publicDirectory = resolve(root, 'public')
      const stagingDirectory = resolve(root, 'staging')
      await writeTournamentPublication(
        createTournamentPublishedData(
          [],
          cardsData.cards,
          cardsData.dataVersion,
        ),
        publicDirectory,
      )
      const production = vi.fn(async (version: string, eventIds: string[]) => {
        const index = JSON.parse(
          await readFile(resolve(publicDirectory, 'index.json'), 'utf8'),
        )
        expect(index.dataVersion).toBe(version)
        expect(index.events.map((event: { id: string }) => event.id)).toEqual(
          eventIds,
        )
      })
      const result = await runDailyWorkflow(
        { targetDate: '2026-10-06', dryRun: false },
        {
          assertGitStart: async () => 'synced',
          processDue: async () => {
            const discovery = await runTournamentDiscovery({
              source: {
                query: async (_seriesId, date) => {
                  if (degraded && date === '2026-10-05') {
                    throw new Error('source unavailable')
                  }
                  return date === '2026-10-06' ? ['1771029'] : []
                },
              },
              seriesIds: ['3463'],
              dates: degraded ? ['2026-10-05', '2026-10-06'] : ['2026-10-06'],
              now: () => NOW,
            })
            const intake = await queue.automatedIntake(
              discovery.candidates,
              NOW,
            )
            const selection = await selectDueTournamentEventsForDate({
              records: (await queue.load()).records,
              targetDate: '2026-10-06',
              now: NOW,
              probe: async (sourceEventId) => ({
                sourceEventId,
                eventDate: '2026-10-06',
              }),
              persist: (sourceEventId, eventDate) =>
                queue
                  .setOfficialEventDate(sourceEventId, eventDate)
                  .then(() => {}),
            })
            for (const sourceEventId of selection.selected) {
              await processOneTournamentQueueItem({
                repository: queue,
                cardsData,
                now: NOW,
                leaseDurationMs: 60_000,
                readyArtifacts: artifacts,
                sourceEventId,
                collect: async () => collectedEvent(),
              })
            }
            return {
              selected: selection.selected,
              processed: selection.selected,
              discovery: {
                status: degraded ? ('degraded' as const) : ('ok' as const),
                attempted: discovery.summary.attemptedQueries,
                observed:
                  discovery.summary.successfulQueries -
                  discovery.summary.saturatedQueries,
                zero: discovery.summary.zeroResultQueries,
                saturated: discovery.summary.saturatedQueries,
                failed: discovery.summary.failedQueries,
                challenge: discovery.summary.challengeQueries,
                added: intake.added.length,
                existing: intake.existing.length,
              },
            }
          },
          loadQueue: () => queue.load(),
          loadArtifact: (id) => artifacts.load(id, cardsData),
          publish: (ids, write) =>
            publishReadyTournamentEvents({
              sourceEventIds: ids,
              write,
              queue,
              artifacts,
              cardsData,
              publicDirectory,
              stagingDirectory,
            }),
          recoverWritten: () => {
            throw new Error('not used')
          },
          fetchAndAssertSync: async () => {},
          publicationDiff: async () => ['public/tournaments/index.json'],
          commit: async () => 'commit-sha',
          push: async () => {},
          production,
          transitionPublished: (sourceEventId, publishedEventId) =>
            queue.transition(sourceEventId, 'published', { publishedEventId }),
        },
      )
      expect(result).toMatchObject({
        runStatus: degraded ? 'degraded' : 'success',
        exitCode: 0,
        published: ['1771029'],
        publication: { attempted: true, skipped: false },
      })
      expect((await queue.load()).records[0]).toMatchObject({
        sourceEventId: '1771029',
        status: 'published',
      })
      expect(production).toHaveBeenCalledTimes(1)
    },
  )
})
