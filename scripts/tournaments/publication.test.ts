import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { Card } from '../../src/domain/cards/types'
import { createTournamentPublishedData } from '../../src/domain/tournaments/published'
import type { TournamentEvent } from '../../src/domain/tournaments/types'
import {
  isTournamentIndexFile,
  isTournamentOshiMasterFile,
} from '../../src/repositories/loadTournamentData'
import {
  publishTournamentPublication,
  writeTournamentPublication,
} from './publication'

const cards: Card[] = [
  {
    cardNumber: 'OSHI',
    name: 'Oshi',
    cardType: 'oshi',
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
    searchText: 'oshi',
    representativeImageUrl: 'https://example.com/oshi.png',
  },
]

const secondCard: Card = {
  ...cards[0]!,
  cardNumber: 'OSHI-2',
  name: 'Oshi 2',
  searchText: 'oshi 2',
  representativeImageUrl: 'https://example.com/oshi-2.png',
}

const event: TournamentEvent = {
  id: 'evt-one',
  tournament: { type: 'bloomcup', seriesName: 'Bloom Cup' },
  date: '2026-09-19',
  venue: { slug: 'venue', name: 'Venue' },
  resultCoverage: { kind: 'winner-only' },
  results: [
    {
      id: 'res-one',
      rank: 1,
      oshiCardNumber: 'OSHI',
      deck: { oshi: [], main: [], cheer: [] },
    },
  ],
  source: { sourceType: 'fixture' },
}

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('atomic Tournament publication', () => {
  it('keeps Tournament dataset and Card catalog version semantics separate', () => {
    const publication = createTournamentPublishedData(
      [event],
      cards,
      'sha256:card-catalog-a',
    )
    expect(publication.oshiMaster.cardsDataVersion).toBe(
      'sha256:card-catalog-a',
    )
    expect(publication.index.dataVersion).not.toBe('sha256:card-catalog-a')
    expect(publication.events[event.id]?.dataVersion).toBe(
      publication.index.dataVersion,
    )
  })

  it('blocks publication when an Oshi is missing from the Card catalog', () => {
    expect(() =>
      createTournamentPublishedData([event], [], 'sha256:card-catalog-a'),
    ).toThrow('Oshi card is missing: OSHI')
  })

  it('derives an empty or expanded Oshi master from published Results', () => {
    const empty = createTournamentPublishedData([], cards, 'cards-v1')
    expect(Object.keys(empty.oshiMaster.cards)).toEqual([])

    const expandedEvent: TournamentEvent = {
      ...event,
      id: 'evt-two',
      results: [
        { ...event.results[0]!, id: 'res-two', oshiCardNumber: 'OSHI-2' },
      ],
    }
    const expanded = createTournamentPublishedData(
      [event, expandedEvent],
      [...cards, secondCard],
      'cards-v2',
    )
    expect(Object.keys(expanded.oshiMaster.cards).sort()).toEqual([
      'OSHI',
      'OSHI-2',
    ])
    expect(expanded.oshiMaster.cards).toMatchObject({
      OSHI: { representativeImageUrl: 'https://example.com/oshi.png' },
      'OSHI-2': {
        representativeImageUrl: 'https://example.com/oshi-2.png',
      },
    })
  })

  it('accepts the official Production publication without synthetic data', async () => {
    const [cardsText, indexText, oshiMasterText] = await Promise.all([
      readFile(join('public', 'cards.json'), 'utf8'),
      readFile(join('public', 'tournaments', 'index.json'), 'utf8'),
      readFile(join('public', 'tournaments', 'oshi-master.json'), 'utf8'),
    ])
    const cards = JSON.parse(cardsText) as {
      dataVersion: string
      cards: { cardNumber: string }[]
    }
    const index: unknown = JSON.parse(indexText)
    const oshiMaster: unknown = JSON.parse(oshiMasterText)

    expect(isTournamentIndexFile(index)).toBe(true)
    expect(index).toMatchObject({ startDate: '2026-09-19' })
    const summaries = (index as { events: { id: string }[] }).events
    expect(summaries.length).toBeGreaterThan(0)
    expect(isTournamentOshiMasterFile(oshiMaster)).toBe(true)
    expect(oshiMaster).toMatchObject({
      cardsDataVersion: cards.dataVersion,
    })
    const eventTexts = await Promise.all(
      summaries.map(({ id }) =>
        readFile(join('public', 'tournaments', 'events', `${id}.json`), 'utf8'),
      ),
    )
    const events = eventTexts.map((text) => JSON.parse(text)) as {
      event: {
        id: string
        source: { sourceEventId: string }
        results: {
          oshiCardNumber: string
          deck: Record<'oshi' | 'main' | 'cheer', { cardNumber: string }[]>
        }[]
      }
    }[]
    expect(new Set(events.map(({ event }) => event.id)).size).toBe(
      summaries.length,
    )
    expect(
      new Set(events.map(({ event }) => event.source.sourceEventId)).size,
    ).toBe(summaries.length)
    const cardNumbers = new Set(cards.cards.map((card) => card.cardNumber))
    const expectedOshiNumbers = [
      ...new Set(
        events.flatMap(({ event }) =>
          event.results.map((result) => result.oshiCardNumber),
        ),
      ),
    ].sort()
    const masterCards = (
      oshiMaster as {
        cards: Record<string, { name: string; representativeImageUrl?: string }>
      }
    ).cards
    const actualOshiNumbers = Object.keys(masterCards).sort()
    expect(actualOshiNumbers).toEqual(expectedOshiNumbers)
    expect(new Set(actualOshiNumbers).size).toBe(actualOshiNumbers.length)
    for (const cardNumber of actualOshiNumbers) {
      expect(cardNumbers.has(cardNumber)).toBe(true)
      expect(masterCards[cardNumber]?.name.trim()).not.toBe('')
      expect(masterCards[cardNumber]?.representativeImageUrl).toMatch(
        /^https:\/\//,
      )
    }
    for (const { event } of events) {
      for (const result of event.results) {
        expect(cardNumbers.has(result.oshiCardNumber)).toBe(true)
        expect(masterCards[result.oshiCardNumber]).toBeDefined()
        for (const zone of ['oshi', 'main', 'cheer'] as const) {
          expect(
            result.deck[zone].every(({ cardNumber }) =>
              cardNumbers.has(cardNumber),
            ),
          ).toBe(true)
        }
      }
    }
    const publicationText = [indexText, oshiMasterText, ...eventTexts].join(
      '\n',
    )
    expect(publicationText).not.toMatch(/synthetic/i)
    expect(publicationText).not.toMatch(
      /playerName|address|queue|lease|\.cache|diagnostic/i,
    )
  })

  it('leaves the existing publication untouched when staging validation fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hlsieve-tournaments-'))
    temporaryDirectories.push(root)
    const destination = join(root, 'public', 'tournaments')
    const validStaging = join(root, 'valid')
    const invalidStaging = join(root, 'invalid')
    const existing = createTournamentPublishedData([event], cards, 'cards-v1')
    await writeTournamentPublication(existing, validStaging)
    await publishTournamentPublication(validStaging, destination)
    const before = await readFile(join(destination, 'index.json'), 'utf8')

    await writeTournamentPublication(existing, invalidStaging)
    await rm(join(invalidStaging, 'events', 'evt-one.json'))

    await expect(
      publishTournamentPublication(invalidStaging, destination),
    ).rejects.toThrow('do not match')
    expect(await readFile(join(destination, 'index.json'), 'utf8')).toBe(before)
    expect(
      await readFile(join(destination, 'events', 'evt-one.json'), 'utf8'),
    ).toContain('evt-one')
  })
})
