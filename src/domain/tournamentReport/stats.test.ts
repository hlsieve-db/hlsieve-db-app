import { describe, expect, it } from 'vitest'

import type { SavedTournamentReport } from './savedReport'
import {
  aggregateTournamentStats,
  formatMatchRecord,
  formatWinRate,
  sortOshiMatchStats,
} from './stats'
import type { TournamentReport, TournamentRound } from './types'

function saved(
  id: string,
  overrides: Partial<TournamentReport> = {},
): SavedTournamentReport {
  return {
    id,
    schemaVersion: 1,
    createdAt: '2026-09-13T00:00:00.000Z',
    updatedAt: '2026-09-13T00:00:00.000Z',
    report: {
      tournamentName: `大会${id}`,
      placement: '',
      swissRounds: [],
      tournamentRounds: [],
      ...overrides,
    },
  }
}

describe('aggregateTournamentStats', () => {
  it('returns stable zero values without NaN or Infinity for no reports', () => {
    const stats = aggregateTournamentStats([])
    expect(stats.tournamentCount).toBe(0)
    expect(stats.overall).toEqual({
      matches: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      winRate: null,
    })
    expect(formatWinRate(stats.overall.winRate)).toBe('—')
    expect(JSON.stringify(stats)).not.toMatch(/NaN|Infinity/)
  })

  it('counts reports with zero rounds as tournaments but not matches', () => {
    const stats = aggregateTournamentStats([saved('1')])
    expect(stats.tournamentCount).toBe(1)
    expect(stats.overall.matches).toBe(0)
    expect(stats.overall.winRate).toBeNull()
  })

  it('aggregates WIN, DRAW and LOSE with draw included in the win-rate denominator', () => {
    const stats = aggregateTournamentStats([
      saved('1', {
        swissRounds: [
          { result: 'win' },
          { result: 'win' },
          { result: 'win' },
          { result: 'draw' },
          { result: 'loss' },
        ],
      }),
    ])
    expect(stats.overall).toEqual({
      matches: 5,
      wins: 3,
      draws: 1,
      losses: 1,
      winRate: 0.6,
    })
    expect(stats.overall.matches).toBe(
      stats.overall.wins + stats.overall.draws + stats.overall.losses,
    )
    expect(formatMatchRecord(stats.overall)).toBe('3-1-1')
    expect(formatWinRate(stats.overall.winRate)).toBe('60.0%')
  })

  it('splits Swiss, Tournament, play order and initiative while tracking unset fields', () => {
    const stats = aggregateTournamentStats([
      saved('1', {
        swissRounds: [
          {
            result: 'win',
            playOrder: 'first',
            initiativeChoiceResult: 'won_choice',
          },
          {
            result: 'draw',
            playOrder: 'second',
            initiativeChoiceResult: 'lost_choice',
          },
          { result: 'loss' },
        ],
        tournamentRounds: [
          {
            result: 'win',
            playOrder: 'first',
            initiativeChoiceResult: 'lost_choice',
          },
        ],
      }),
    ])
    expect(stats.swiss).toMatchObject({
      matches: 3,
      wins: 1,
      draws: 1,
      losses: 1,
    })
    expect(stats.tournament).toMatchObject({ matches: 1, wins: 1 })
    expect(stats.byPlayOrder.first).toMatchObject({ matches: 2, wins: 2 })
    expect(stats.byPlayOrder.second).toMatchObject({ matches: 1, draws: 1 })
    expect(stats.byInitiative.wonChoice).toMatchObject({ matches: 1, wins: 1 })
    expect(stats.byInitiative.lostChoice).toMatchObject({
      matches: 2,
      wins: 1,
      draws: 1,
    })
    expect(stats.missingCounts.playOrderMatches).toBe(1)
    expect(stats.missingCounts.initiativeMatches).toBe(1)
  })

  it('aggregates opponent and own Oshi identities across multiple reports', () => {
    const stats = aggregateTournamentStats([
      saved('1', {
        selfOshiCardNumber: 'OWN-A',
        swissRounds: [
          { result: 'win', opponentOshiCardNumber: 'OPP-A' },
          { result: 'loss', opponentOshiCardNumber: 'OPP-B' },
        ],
      }),
      saved('2', {
        selfOshiCardNumber: 'OWN-A',
        tournamentRounds: [
          { result: 'draw', opponentOshiCardNumber: 'OPP-A' },
          { result: 'win' },
        ],
      }),
      saved('3', {
        selfOshiCardNumber: 'OWN-B',
        swissRounds: [{ result: 'win', opponentOshiCardNumber: 'OPP-B' }],
      }),
      saved('4', { swissRounds: [{ result: 'loss' }] }),
    ])
    expect(stats.byOwnOshi).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cardNumber: 'OWN-A',
          tournamentCount: 2,
          matches: 4,
        }),
        expect.objectContaining({
          cardNumber: 'OWN-B',
          tournamentCount: 1,
          matches: 1,
        }),
      ]),
    )
    expect(stats.byOpponentOshi).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardNumber: 'OPP-A', matches: 2 }),
        expect.objectContaining({ cardNumber: 'OPP-B', matches: 2 }),
      ]),
    )
    expect(stats.missingCounts.ownOshiTournaments).toBe(1)
    expect(stats.missingCounts.opponentOshiMatches).toBe(2)
  })

  it('ignores unset and invalid results defensively', () => {
    const rounds = [
      {},
      { result: 'cancelled' },
      { result: 'win' },
    ] as unknown as TournamentRound[]
    expect(
      aggregateTournamentStats([saved('1', { swissRounds: rounds })]).overall,
    ).toMatchObject({ matches: 1, wins: 1 })
  })

  it('sorts by matches, win rate, then resolved display label', () => {
    const values = [
      {
        cardNumber: 'B',
        matches: 2,
        wins: 1,
        draws: 0,
        losses: 1,
        winRate: 0.5,
      },
      {
        cardNumber: 'C',
        matches: 3,
        wins: 1,
        draws: 0,
        losses: 2,
        winRate: 1 / 3,
      },
      {
        cardNumber: 'A',
        matches: 2,
        wins: 1,
        draws: 0,
        losses: 1,
        winRate: 0.5,
      },
      { cardNumber: 'D', matches: 2, wins: 2, draws: 0, losses: 0, winRate: 1 },
    ]
    const labels: Record<string, string> = {
      A: 'い',
      B: 'あ',
      C: 'う',
      D: 'え',
    }
    expect(
      sortOshiMatchStats(values, (key) => labels[key]).map(
        (value) => value.cardNumber,
      ),
    ).toEqual(['C', 'D', 'B', 'A'])
    expect(formatMatchRecord(values[0])).toBe('1-1')
  })
})
