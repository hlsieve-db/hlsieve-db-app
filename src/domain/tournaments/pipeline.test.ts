import { describe, expect, it } from 'vitest'
import type { Card } from '../cards/types'
import { mergeTournamentEvents } from './merge'
import { createTournamentPublishedData } from './published'
import type { TournamentEvent, TournamentResult } from './types'

function card(
  cardNumber: string,
  cardType: Card['cardType'],
  overrides: Partial<Card> = {},
): Card {
  return {
    cardNumber,
    name: cardNumber,
    imageUrl: `latest/${cardNumber}.png`,
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
    ...overrides,
  }
}

const cards = [
  card('OSHI-A', 'oshi', { representativeImageUrl: 'oldest/oshi-a.png' }),
  card('OSHI-B', 'oshi'),
  card('MAIN', 'holomem'),
  card('CHEER', 'cheer'),
]

function result(
  id: string,
  rank: number,
  oshiCardNumber = 'OSHI-A',
): TournamentResult {
  return {
    id,
    rank,
    oshiCardNumber,
    deckLogCode: `CODE-${id}`,
    deck: {
      oshi: [{ cardNumber: oshiCardNumber, quantity: 1 }],
      main: [{ cardNumber: 'MAIN', quantity: 50 }],
      cheer: [{ cardNumber: 'CHEER', quantity: 20 }],
    },
  }
}

function event(overrides: Partial<TournamentEvent> = {}): TournamentEvent {
  return {
    id: 'evt-one',
    tournament: {
      type: 'selectioncup',
      round: 'bp08',
      seriesName: 'Selection Cup',
    },
    date: '2026-09-19',
    venue: { slug: 'venue', name: 'Venue' },
    participantCount: 32,
    resultCoverage: { kind: 'exact', maxRank: 8 },
    results: [result('res-one', 1)],
    source: { sourceType: 'fixture', sourceEventId: 'source-one' },
    ...overrides,
  }
}

describe('mergeTournamentEvents', () => {
  it('is idempotent and preserves Events omitted by a partial update', () => {
    const existing = [event(), event({ id: 'evt-old', date: '2026-09-20' })]
    const first = mergeTournamentEvents(existing, [event()])
    const second = mergeTournamentEvents(first.events, [event()])
    expect(first.events).toEqual(existing.slice().reverse())
    expect(second).toEqual(first)
  })

  it('preserves participantCount when incoming omits it and adds new Results', () => {
    const incoming = event({
      participantCount: undefined,
      results: [result('res-two', 2, 'OSHI-B')],
    })
    const merged = mergeTournamentEvents([event()], [incoming])
    expect(merged.pending).toEqual([])
    expect(merged.events[0]).toMatchObject({
      participantCount: 32,
      results: [{ id: 'res-one' }, { id: 'res-two' }],
    })
  })

  it('accepts a correction only for the same stable Result identity', () => {
    const corrected = event({ results: [result('res-one', 4)] })
    const merged = mergeTournamentEvents([event()], [corrected])
    expect(merged.pending).toEqual([])
    expect(merged.events[0]?.results).toEqual([result('res-one', 4)])
  })

  it('keeps existing good data when another source conflicts', () => {
    const incoming = event({
      participantCount: 64,
      source: { sourceType: 'other-source' },
    })
    const merged = mergeTournamentEvents([event()], [incoming])
    expect(merged.events).toEqual([event()])
    expect(merged.pending[0]?.reasonCodes).toContain('source-conflict')
  })

  it('keeps existing good data when validation supplies no incoming Event', () => {
    expect(mergeTournamentEvents([event()], []).events).toEqual([event()])
  })
})

describe('Tournament static JSON generation', () => {
  it('generates index, Event details, and an Oshi-only master', () => {
    const input = event({
      results: [result('res-one', 1), result('res-two', 3, 'OSHI-B')],
    })
    const published = createTournamentPublishedData([input], cards, 'cards-v1')
    expect(published.index).toMatchObject({
      format: 'hlsieve-tournament-index',
      startDate: '2026-09-19',
      events: [
        {
          id: 'evt-one',
          tournament: { type: 'selectioncup', round: 'bp08' },
          date: '2026-09-19',
          resultCount: 2,
          results: [
            { rank: 1, oshiCardNumber: 'OSHI-A' },
            { rank: 3, oshiCardNumber: 'OSHI-B' },
          ],
        },
      ],
    })
    expect(published.events['evt-one']?.event).toEqual(input)
    expect(published.oshiMaster.cards).toEqual({
      'OSHI-A': {
        name: 'OSHI-A',
        representativeImageUrl: 'oldest/oshi-a.png',
      },
      'OSHI-B': { name: 'OSHI-B' },
    })
    expect(JSON.stringify(published.oshiMaster)).not.toContain('latest/')
  })

  it('supports Phase 10 aggregation from index alone', () => {
    const exact = event({
      id: 'exact',
      results: [result('winner', 1), result('third', 3, 'OSHI-B')],
    })
    const winnerOnly = event({
      id: 'winner-only',
      date: '2026-09-20',
      resultCoverage: { kind: 'winner-only' },
      results: [result('only-winner', 1, 'OSHI-B')],
    })
    const variable = event({
      id: 'variable',
      date: '2026-09-21',
      tournament: { type: 'bloomcup', seriesName: 'Bloom Cup' },
      resultCoverage: { kind: 'variable' },
      results: [result('fifth', 5)],
    })
    const { index } = createTournamentPublishedData(
      [exact, winnerOnly, variable],
      cards,
      'cards-v1',
    )
    const winners = index.events.flatMap((item) =>
      item.results.filter((entry) => entry.rank === 1),
    )
    const placements = index.events.flatMap((item) =>
      item.resultCoverage.kind === 'winner-only'
        ? []
        : item.results.filter((entry) => entry.rank <= 8),
    )
    expect(winners).toHaveLength(2)
    expect(placements.map((item) => item.rank)).toEqual([5, 1, 3])
    expect(
      index.events.map((item) => [
        item.date,
        item.tournament.type,
        item.tournament.round,
      ]),
    ).toEqual([
      ['2026-09-21', 'bloomcup', undefined],
      ['2026-09-20', 'selectioncup', 'bp08'],
      ['2026-09-19', 'selectioncup', 'bp08'],
    ])
  })

  it('produces the same semantic version for the same content', () => {
    const first = createTournamentPublishedData([event()], cards, 'cards-v1')
    const second = createTournamentPublishedData(
      [structuredClone(event())],
      cards,
      'cards-v1',
    )
    expect(second).toEqual(first)
  })
})
