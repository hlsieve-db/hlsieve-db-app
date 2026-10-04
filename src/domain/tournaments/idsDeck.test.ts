import { describe, expect, it } from 'vitest'

import { buildDeckLogPublicUrl, DECK_LOG_PUBLIC_VIEW_BASE_URL } from './deckLog'
import { convertTournamentResultToDeck } from './deck'
import { createTournamentEventId, createTournamentResultId } from './ids'
import type {
  TournamentEvent,
  TournamentImportEvent,
  TournamentImportResult,
} from './types'

function importEvent(): TournamentImportEvent {
  return {
    identity: {
      occurrence: { kind: 'published-session', value: 'morning' },
    },
    tournament: {
      type: 'selectioncup',
      environment: 'bp09',
      seriesName: 'Selection Cup',
    },
    date: '2026-09-19',
    venue: { slug: 'venue-a', name: 'Venue A' },
    resultCoverage: { kind: 'exact', maxRank: 8 },
    results: [],
    source: { sourceType: 'fixture' },
  }
}

function importResult(): TournamentImportResult {
  return {
    rank: 1,
    oshiCardNumber: 'OSHI',
    deck: {
      oshi: [{ cardNumber: 'OSHI', quantity: 1 }],
      main: [
        { cardNumber: 'B', quantity: 25 },
        { cardNumber: 'A', quantity: 25 },
      ],
      cheer: [{ cardNumber: 'CHEER', quantity: 20 }],
    },
  }
}

describe('Tournament identity', () => {
  it('is stable and includes venue and occurrence discriminator', () => {
    const input = importEvent()
    const id = createTournamentEventId(input)
    expect(createTournamentEventId(structuredClone(input))).toBe(id)
    expect(
      createTournamentEventId({
        ...input,
        venue: { slug: 'venue-b', name: 'Venue B' },
      }),
    ).not.toBe(id)
    expect(
      createTournamentEventId({
        ...input,
        identity: {
          occurrence: { kind: 'published-session', value: 'evening' },
        },
      }),
    ).not.toBe(id)
  })

  it('refuses an ambiguous Event identity', () => {
    expect(() =>
      createTournamentEventId({ ...importEvent(), identity: {} }),
    ).toThrow('ambiguous')
  })

  it('uses sourceEventId as the canonical identity across metadata corrections', () => {
    const input = {
      ...importEvent(),
      identity: { sourceEventId: '1764903' },
      source: { sourceType: 'fixture', sourceEventId: '1764903' },
    }
    const id = createTournamentEventId(input)
    expect(
      createTournamentEventId({
        ...input,
        date: '2026-09-26',
        tournament: { ...input.tournament, environment: 'bp10' },
        venue: { slug: 'corrected-venue', name: 'Corrected Venue' },
      }),
    ).toBe(id)
  })

  it('keeps Result ID stable across rank correction and input order', () => {
    const input = importResult()
    const eventId = createTournamentEventId(importEvent())
    const id = createTournamentResultId(eventId, input)
    expect(createTournamentResultId(eventId, { ...input, rank: 4 })).toBe(id)
    expect(
      createTournamentResultId(eventId, {
        ...input,
        deck: { ...input.deck, main: [...input.deck.main].reverse() },
      }),
    ).toBe(id)
  })
})

describe('Tournament Deck integration', () => {
  it('converts a Tournament Deck to a new existing Deck shape', () => {
    const input = importEvent()
    const importedResult = importResult()
    const event: TournamentEvent = {
      ...input,
      id: createTournamentEventId(input),
      results: [],
    }
    const result = {
      ...importedResult,
      id: createTournamentResultId(event.id, importedResult),
    }
    const deck = convertTournamentResultToDeck(event, result, {
      id: () => 'new-deck',
      now: () => '2026-09-25T00:00:00.000Z',
    })
    expect(deck).toMatchObject({
      id: 'new-deck',
      name: 'Selection Cup 2026-09-19 1位',
      createdAt: '2026-09-25T00:00:00.000Z',
      updatedAt: '2026-09-25T00:00:00.000Z',
      regulationId: 'selection-cup-2026-autumn',
      entries: [
        { cardNumber: 'OSHI', quantity: 1 },
        { cardNumber: 'B', quantity: 25 },
        { cardNumber: 'A', quantity: 25 },
        { cardNumber: 'CHEER', quantity: 20 },
      ],
    })
    expect(deck.entries).not.toBe(result.deck.main)
    expect(deck.entries[0]).not.toBe(result.deck.oshi[0])
    deck.entries[0].quantity = 99
    expect(result.deck.oshi[0].quantity).toBe(1)
  })

  it('allows an unknown Tournament mapping without a regulation ID', () => {
    const input = importEvent()
    const importedResult = importResult()
    const event: TournamentEvent = {
      ...input,
      id: 'future-event',
      tournament: {
        ...input.tournament,
        type: 'future',
        environment: 'unknown',
      },
      results: [],
    }
    const deck = convertTournamentResultToDeck(
      event,
      { ...importedResult, id: 'future-result' },
      { id: () => 'future-deck', now: () => '2026-10-03T00:00:00.000Z' },
    )
    expect(deck.regulationId).toBeUndefined()
    expect(deck.id).toBe('future-deck')
  })

  it('builds the public Deck Log URL from one centralized base', () => {
    expect(buildDeckLogPublicUrl(' A B ')).toBe(
      `${DECK_LOG_PUBLIC_VIEW_BASE_URL}A%20B`,
    )
  })
})
