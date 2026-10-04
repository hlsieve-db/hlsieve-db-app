import { describe, expect, it } from 'vitest'

import type { Card } from '../cards/types'
import { normalizeTournamentImportPayload } from './normalize'
import type {
  TournamentImportEvent,
  TournamentImportPayload,
  TournamentImportResult,
} from './types'
import { validateTournamentImportPayload } from './validation'

function card(
  cardNumber: string,
  cardType: Card['cardType'],
  overrides: Partial<Card> = {},
): Card {
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
    ...overrides,
  }
}

const cards = [
  card('OSHI-001', 'oshi'),
  card('MAIN-001', 'holomem'),
  card('MAIN-002', 'support'),
  card('CHEER-001', 'cheer'),
]

function result(
  overrides: Partial<TournamentImportResult> = {},
): TournamentImportResult {
  return {
    sourceResultId: 'result-1',
    rank: 1,
    oshiCardNumber: 'OSHI-001',
    deckLogCode: 'ABCDE',
    deck: {
      oshi: [{ cardNumber: 'OSHI-001', quantity: 1 }],
      main: [{ cardNumber: 'MAIN-001', quantity: 50 }],
      cheer: [{ cardNumber: 'CHEER-001', quantity: 20 }],
    },
    ...overrides,
  }
}

function event(
  overrides: Partial<TournamentImportEvent> = {},
): TournamentImportEvent {
  return {
    identity: { sourceEventId: 'event-1' },
    tournament: {
      type: 'selectioncup',
      environment: 'bp09',
      seriesName: 'Selection Cup',
    },
    date: '2026-09-19',
    venue: { slug: 'tokyo-store', name: 'Tokyo Store', prefecture: '東京都' },
    participantCount: 32,
    resultCoverage: { kind: 'exact', maxRank: 8 },
    results: [result()],
    source: {
      sourceType: 'approved-source',
      sourceEventId: 'event-1',
      sourceUrl: 'https://example.invalid/event-1',
    },
    ...overrides,
  }
}

function payload(events = [event()]): TournamentImportPayload {
  return {
    format: 'hlsieve-tournament-import',
    formatVersion: 1,
    collectedAt: '2026-09-24T00:00:00.000Z',
    collector: { type: 'fixture' },
    events,
  }
}

function validate(input = payload()) {
  return validateTournamentImportPayload(input, cards)
}

describe('normalizeTournamentImportPayload', () => {
  it('constructs only the normalized contract and drops player names', () => {
    const raw = structuredClone(payload()) as unknown as Record<string, unknown>
    raw.playerName = 'batch player'
    const rawEvent = (raw.events as Array<Record<string, unknown>>)[0]!
    rawEvent.playerName = 'event player'
    ;(rawEvent.results as Array<Record<string, unknown>>)[0]!.playerName =
      'result player'

    const normalized = normalizeTournamentImportPayload(raw)

    expect(JSON.stringify(normalized)).not.toContain('playerName')
    expect(JSON.stringify(normalized)).not.toContain('player')
    expect(normalized).toEqual(payload())
  })
})

describe('validateTournamentImportPayload', () => {
  it('publishes a valid Selection Cup event', () => {
    const checked = validate()
    expect(checked.pending).toEqual([])
    expect(checked.events).toHaveLength(1)
    expect(checked.events[0]).toMatchObject({
      tournament: { type: 'selectioncup', environment: 'bp09' },
      results: [{ rank: 1, oshiCardNumber: 'OSHI-001' }],
    })
  })

  it('accepts bloomcup and unknown future tournament types', () => {
    const checked = validate(
      payload([
        event({
          identity: { sourceEventId: 'bloom' },
          tournament: { type: 'bloomcup', seriesName: 'Bloom Cup' },
        }),
        event({
          identity: { sourceEventId: 'future' },
          tournament: { type: 'future-series', seriesName: 'Future Series' },
        }),
      ]),
    )
    expect(checked.events.map((item) => item.tournament.type)).toEqual([
      'bloomcup',
      'future-series',
    ])
  })

  it('allows missing ranks and variable coverage', () => {
    const checked = validate(
      payload([
        event({
          resultCoverage: { kind: 'variable' },
          results: [
            result({ sourceResultId: 'one', rank: 1 }),
            result({ sourceResultId: 'three', rank: 3 }),
            result({ sourceResultId: 'five', rank: 5 }),
          ],
        }),
      ]),
    )
    expect(checked.pending).toEqual([])
    expect(checked.events[0]?.results.map((item) => item.rank)).toEqual([
      1, 3, 5,
    ])
  })

  it('isolates a duplicate Event', () => {
    const checked = validate(payload([event(), event()]))
    expect(checked.events).toHaveLength(1)
    expect(
      checked.pending.some((item) =>
        item.reasonCodes.includes('duplicate-event'),
      ),
    ).toBe(true)
  })

  it('isolates every result participating in a duplicate rank', () => {
    const checked = validate(
      payload([
        event({
          results: [result(), result({ sourceResultId: 'result-2' })],
        }),
      ]),
    )
    expect(checked.events).toEqual([])
    expect(
      checked.pending.filter((item) =>
        item.reasonCodes.includes('duplicate-rank'),
      ),
    ).toHaveLength(2)
  })

  it.each([
    {
      label: 'exact coverage overflow',
      event: event({ results: [result({ rank: 9 })] }),
    },
    {
      label: 'winner-only rank 2',
      event: event({
        resultCoverage: { kind: 'winner-only' },
        results: [result({ rank: 2 })],
      }),
    },
  ])('isolates $label', ({ event: input }) => {
    const checked = validate(payload([input]))
    expect(checked.events).toEqual([])
    expect(
      checked.pending.some((item) =>
        item.reasonCodes.includes('rank-outside-coverage'),
      ),
    ).toBe(true)
  })

  it('isolates an unknown card Result without blocking a valid Result', () => {
    const checked = validate(
      payload([
        event({
          results: [
            result(),
            result({
              sourceResultId: 'unknown',
              rank: 2,
              deck: {
                ...result().deck,
                main: [{ cardNumber: 'UNKNOWN', quantity: 50 }],
              },
            }),
          ],
        }),
      ]),
    )
    expect(checked.events[0]?.results).toHaveLength(1)
    expect(
      checked.pending.some((item) => item.reasonCodes.includes('unknown-card')),
    ).toBe(true)
  })

  it('does not publish an Event when every Result is pending', () => {
    const checked = validate(
      payload([event({ results: [result({ oshiCardNumber: 'UNKNOWN' })] })]),
    )
    expect(checked.events).toEqual([])
    expect(
      checked.pending.some((item) =>
        item.reasonCodes.includes('no-valid-results'),
      ),
    ).toBe(true)
  })

  it.each([
    {
      label: 'invalid quantity',
      changed: result({
        deck: {
          ...result().deck,
          main: [{ cardNumber: 'MAIN-001', quantity: 0 }],
        },
      }),
      reason: 'invalid-quantity',
    },
    {
      label: 'duplicate Deck card',
      changed: result({
        deck: {
          ...result().deck,
          main: [
            { cardNumber: 'MAIN-001', quantity: 25 },
            { cardNumber: 'MAIN-001', quantity: 25 },
          ],
        },
      }),
      reason: 'duplicate-deck-card',
    },
    {
      label: 'wrong Deck zone',
      changed: result({
        deck: {
          ...result().deck,
          main: [{ cardNumber: 'CHEER-001', quantity: 50 }],
          cheer: [{ cardNumber: 'MAIN-001', quantity: 20 }],
        },
      }),
      reason: 'wrong-deck-zone',
    },
    {
      label: 'wrong Deck counts',
      changed: result({
        deck: {
          ...result().deck,
          main: [{ cardNumber: 'MAIN-001', quantity: 49 }],
        },
      }),
      reason: 'wrong-deck-counts',
    },
    {
      label: 'Oshi mismatch',
      changed: result({ oshiCardNumber: 'MAIN-001' }),
      reason: 'oshi-mismatch',
    },
  ])('isolates $label', ({ changed, reason }) => {
    const checked = validate(payload([event({ results: [changed] })]))
    expect(checked.events).toEqual([])
    expect(
      checked.pending.some((item) =>
        item.reasonCodes.includes(reason as never),
      ),
    ).toBe(true)
  })
})
