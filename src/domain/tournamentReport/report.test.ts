import { describe, expect, it } from 'vitest'

import type { Card } from '../cards/types'
import {
  createDefaultTournamentReport,
  createTournamentRound,
  formatTournamentResultSummary,
  summarizeTournamentRounds,
  validateTournamentReport,
} from './report'
import type { TournamentReport } from './types'

const oshi = {
  cardNumber: 'OSHI-001',
  name: 'テスト推し',
  cardType: 'oshi',
  colors: ['red'],
} as Card

function validReport(
  overrides: Partial<TournamentReport> = {},
): TournamentReport {
  return {
    ...createDefaultTournamentReport(),
    tournamentName: 'テスト大会',
    selfOshiCardNumber: oshi.cardNumber,
    ...overrides,
  }
}

describe('tournament report domain', () => {
  it('creates an empty, non-persistent report state', () => {
    expect(createDefaultTournamentReport()).toEqual({
      tournamentName: '',
      placement: '',
      swissRounds: [],
      tournamentRounds: [],
    })
    expect(createTournamentRound()).toEqual({})
  })

  it('summarizes completed wins and losses while ignoring missing results', () => {
    expect(
      summarizeTournamentRounds([
        { result: 'win' },
        {},
        { result: 'loss', initiativeChoiceResult: 'won_choice' },
        { result: 'win', initiativeChoiceResult: 'lost_choice' },
        { result: 'draw' },
      ]),
    ).toEqual({ wins: 2, losses: 1, draws: 1, completedRounds: 4 })
  })

  it('formats summaries with draws only when present', () => {
    expect(
      formatTournamentResultSummary({
        wins: 4,
        losses: 1,
        draws: 0,
        completedRounds: 5,
      }),
    ).toBe('4-1')
    expect(
      formatTournamentResultSummary({
        wins: 3,
        losses: 1,
        draws: 1,
        completedRounds: 5,
      }),
    ).toBe('3-1-1')
  })

  it('accepts optional initiative and other incomplete round fields', () => {
    expect(
      validateTournamentReport(
        validReport({
          swissRounds: [{}, { initiativeChoiceResult: 'won_choice' }],
        }),
        [oshi],
      ),
    ).toEqual([])
  })

  it('enforces Swiss max 10 and tournament max 4', () => {
    expect(
      validateTournamentReport(
        validReport({ swissRounds: Array.from({ length: 11 }, () => ({})) }),
        [oshi],
      ),
    ).toContain('Swissは最大10回戦です。')
    expect(
      validateTournamentReport(
        validReport({
          tournamentRounds: Array.from({ length: 5 }, () => ({})),
        }),
        [oshi],
      ),
    ).toContain('決勝トーナメントは最大4回戦です。')
  })

  it('validates basic data, Oshi identity, dates, participants, and enum values', () => {
    const report = validReport({
      tournamentName: '',
      placement: 'x'.repeat(51),
      participantCount: 0,
      eventDate: '2026-02-30',
      selfOshiCardNumber: 'UNKNOWN',
      swissRounds: [
        {
          opponentOshiCardNumber: 'UNKNOWN',
          playOrder: 'third' as never,
          initiativeChoiceResult: 'dice' as never,
          result: 'invalid' as never,
        },
      ],
    })
    const errors = validateTournamentReport(report, [oshi])

    expect(errors).toContain('大会名を入力してください。')
    expect(errors).toContain('順位は50文字以内で入力してください。')
    expect(errors).toContain('参加人数は1〜100,000の整数で入力してください。')
    expect(errors).toContain('開催日を正しい日付で入力してください。')
    expect(errors).toContain('自分の推しホロメンが無効です。')
    expect(errors).toContain('R1の対戦相手の推しが無効です。')
    expect(errors).toContain('R1の先攻・後攻が無効です。')
    expect(errors).toContain('R1の手番選択権が無効です。')
    expect(errors).toContain('R1の勝敗が無効です。')
  })
})
