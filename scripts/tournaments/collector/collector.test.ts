import { describe, expect, it, vi } from 'vitest'

import type { Card, CardsDataFile } from '../../../src/domain/cards/types'
import type { TournamentImportEvent } from '../../../src/domain/tournaments/types'
import { validateTournamentImportPayload } from '../../../src/domain/tournaments/validation'
import { executeCollector } from './collector'

function card(cardNumber: string, cardType: Card['cardType']): Card {
  return {
    cardNumber,
    name: cardNumber,
    imageUrl: `${cardNumber}.png`,
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
    venue: { slug: 'venue-test', name: 'Test Venue', prefecture: '愛知県' },
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

describe('executeCollector', () => {
  it('normalizes and validates without publishing during dry-run', async () => {
    const publish = vi.fn(async () => undefined)
    const result = await executeCollector({
      dryRun: true,
      collect: async () => [event()],
      cardsData,
      publish,
      now: () => '2026-10-02T00:00:00.000Z',
    })
    expect(result.validEvents).toBe(1)
    expect(result.pendingRecords).toBe(0)
    expect(result.payload.events[0]?.participantCount).toBe(60)
    expect(
      validateTournamentImportPayload(result.payload, cardsData.cards).events[0]
        ?.participantCount,
    ).toBe(60)
    expect(publish).not.toHaveBeenCalled()
  })

  it('routes unknown cards into the existing Phase 9B pending path', async () => {
    const result = await executeCollector({
      dryRun: true,
      collect: async () => [event('UNKNOWN')],
      cardsData,
      publish: async () => undefined,
    })
    expect(result.validEvents).toBe(0)
    expect(result.pendingRecords).toBe(2)
  })

  it('does not retain playerName from untrusted Collector output', async () => {
    const input = event() as TournamentImportEvent & {
      results: Array<
        TournamentImportEvent['results'][number] & { playerName: string }
      >
    }
    input.results[0]!.playerName = 'discard-me'
    const result = await executeCollector({
      dryRun: true,
      collect: async () => [input],
      cardsData,
      publish: async () => undefined,
    })
    expect(JSON.stringify(result.payload)).not.toContain('playerName')
    expect(JSON.stringify(result.payload)).not.toContain('discard-me')
  })
})
