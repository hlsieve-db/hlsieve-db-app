import { describe, expect, it } from 'vitest'

import { TOURNAMENT_DATA_START_DATE } from '../../../src/domain/tournaments/constants'
import {
  assertCollectorStartDate,
  determineCoverage,
  limitToTopEight,
  parseDeckCodeFromModalImage,
  parseParticipantCount,
  parseRankText,
  parseSourceEventId,
  planDiscoveryResult,
  resolveEventDate,
  splitDateRange,
} from './bushiNavi'

describe('Bushi Navi Collector rules', () => {
  it('limits Selection Cup source ranks 1-16 to ranks 1-8', () => {
    const results = Array.from({ length: 16 }, (_, index) => ({
      rank: index + 1,
    }))
    expect(limitToTopEight(results).map(({ rank }) => rank)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ])
  })

  it('uses exact coverage only for contiguous ranks from one', () => {
    expect(determineCoverage([{ rank: 1 }, { rank: 2 }, { rank: 3 }])).toEqual({
      kind: 'exact',
      maxRank: 3,
    })
    expect(determineCoverage([{ rank: 1 }, { rank: 2 }, { rank: 4 }])).toEqual({
      kind: 'variable',
    })
  })

  it('combines the configured year with the public month/day and checks the range', () => {
    expect(
      resolveEventDate('09月23日（水）13時00分', 2026, {
        from: '2026-09-19',
        to: '2026-09-23',
      }),
    ).toBe('2026-09-23')
    expect(() =>
      resolveEventDate('09月24日（木）13時00分', 2026, {
        from: '2026-09-19',
        to: '2026-09-23',
      }),
    ).toThrow(/outside/)
  })

  it('splits a saturated multi-day range without overlap', () => {
    expect(splitDateRange({ from: '2026-09-19', to: '2026-09-23' })).toEqual([
      { from: '2026-09-19', to: '2026-09-21' },
      { from: '2026-09-22', to: '2026-09-23' },
    ])
    expect(
      planDiscoveryResult({ from: '2026-09-19', to: '2026-09-23' }, 10),
    ).toMatchObject({ complete: false })
    expect(
      planDiscoveryResult({ from: '2026-09-19', to: '2026-09-23' }, 9),
    ).toEqual({ complete: true })
  })

  it('fails when a single day is still saturated at ten results', () => {
    expect(() =>
      planDiscoveryResult({ from: '2026-09-19', to: '2026-09-19' }, 10),
    ).toThrow(/Incomplete discovery/)
  })

  it('accepts only a public result URL as the source Event identity', () => {
    expect(
      parseSourceEventId('https://www.bushi-navi.com/event/result/1764903'),
    ).toBe('1764903')
    expect(() =>
      parseSourceEventId('https://www.bushi-navi.com/event/result/list'),
    ).toThrow(/event ID/)
  })

  it('parses participant count, rank, and the public Deck Log code', () => {
    expect(parseParticipantCount('大会結果参加者: 60人')).toBe(60)
    expect(parseRankText('8')).toBe(8)
    expect(
      parseDeckCodeFromModalImage(
        'https://decklog.bushiroad.com/deckimages/KE8C4.png',
      ),
    ).toBe('KE8C4')
  })

  it('rejects a missing rank or missing Deck Log code', () => {
    expect(() => parseRankText('')).toThrow(/rank/)
    expect(() => parseDeckCodeFromModalImage(undefined)).toThrow(/code/)
  })

  it('rejects dates before the Phase 9B start date', () => {
    expect(TOURNAMENT_DATA_START_DATE).toBe('2026-09-19')
    expect(() =>
      assertCollectorStartDate({ from: '2026-09-18', to: '2026-09-19' }),
    ).toThrow(/starts before/)
  })
})
