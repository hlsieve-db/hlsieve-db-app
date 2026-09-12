import type { Card } from '../cards/types'
import type {
  TournamentReport,
  TournamentResultSummary,
  TournamentRound,
} from './types'

export const MAX_SWISS_REPORT_ROUNDS = 10
export const MAX_TOURNAMENT_REPORT_ROUNDS = 4
export const MAX_TOURNAMENT_NAME_LENGTH = 100
export const MAX_PLACEMENT_LENGTH = 50
export const MAX_REPORT_PARTICIPANTS = 100_000

const PLAY_ORDERS = new Set(['first', 'second'])
const INITIATIVE_RESULTS = new Set(['won_choice', 'lost_choice'])
const MATCH_RESULTS = new Set(['win', 'loss', 'draw'])

export function createDefaultTournamentReport(): TournamentReport {
  return {
    tournamentName: '',
    placement: '',
    swissRounds: [],
    tournamentRounds: [],
  }
}

export function createTournamentRound(): TournamentRound {
  return {}
}

export function summarizeTournamentRounds(
  rounds: readonly TournamentRound[],
): TournamentResultSummary {
  return rounds.reduce<TournamentResultSummary>(
    (summary, round) => {
      if (round.result === 'win') {
        summary.wins += 1
        summary.completedRounds += 1
      } else if (round.result === 'loss') {
        summary.losses += 1
        summary.completedRounds += 1
      } else if (round.result === 'draw') {
        summary.draws += 1
        summary.completedRounds += 1
      }
      return summary
    },
    { wins: 0, losses: 0, draws: 0, completedRounds: 0 },
  )
}

export function formatTournamentResultSummary(
  summary: TournamentResultSummary,
): string {
  return summary.draws === 0
    ? `${summary.wins}-${summary.losses}`
    : `${summary.wins}-${summary.losses}-${summary.draws}`
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function validateRound(
  round: TournamentRound,
  label: string,
  validOshiCardNumbers: ReadonlySet<string>,
): string[] {
  const errors: string[] = []
  if (
    round.opponentOshiCardNumber !== undefined &&
    !validOshiCardNumbers.has(round.opponentOshiCardNumber)
  ) {
    errors.push(`${label}の対戦相手の推しが無効です。`)
  }
  if (round.playOrder !== undefined && !PLAY_ORDERS.has(round.playOrder)) {
    errors.push(`${label}の先攻・後攻が無効です。`)
  }
  if (
    round.initiativeChoiceResult !== undefined &&
    !INITIATIVE_RESULTS.has(round.initiativeChoiceResult)
  ) {
    errors.push(`${label}の手番選択権が無効です。`)
  }
  if (round.result !== undefined && !MATCH_RESULTS.has(round.result)) {
    errors.push(`${label}の勝敗が無効です。`)
  }
  return errors
}

export function validateTournamentReport(
  report: TournamentReport,
  oshiCards: readonly Card[],
): string[] {
  const errors: string[] = []
  const validOshiCardNumbers = new Set(
    oshiCards
      .filter((card) => card.cardType === 'oshi')
      .map((card) => card.cardNumber),
  )

  if (report.tournamentName.trim().length === 0) {
    errors.push('大会名を入力してください。')
  } else if (report.tournamentName.length > MAX_TOURNAMENT_NAME_LENGTH) {
    errors.push(
      `大会名は${MAX_TOURNAMENT_NAME_LENGTH}文字以内で入力してください。`,
    )
  }
  if (report.placement.length > MAX_PLACEMENT_LENGTH) {
    errors.push(`順位は${MAX_PLACEMENT_LENGTH}文字以内で入力してください。`)
  }
  if (
    report.participantCount !== undefined &&
    (!Number.isInteger(report.participantCount) ||
      report.participantCount < 1 ||
      report.participantCount > MAX_REPORT_PARTICIPANTS)
  ) {
    errors.push(
      `参加人数は1〜${MAX_REPORT_PARTICIPANTS.toLocaleString('ja-JP')}の整数で入力してください。`,
    )
  }
  if (report.eventDate !== undefined && !isValidIsoDate(report.eventDate)) {
    errors.push('開催日を正しい日付で入力してください。')
  }
  if (!report.selfOshiCardNumber) {
    errors.push('自分の推しホロメンを選択してください。')
  } else if (!validOshiCardNumbers.has(report.selfOshiCardNumber)) {
    errors.push('自分の推しホロメンが無効です。')
  }
  if (report.swissRounds.length > MAX_SWISS_REPORT_ROUNDS) {
    errors.push(`Swissは最大${MAX_SWISS_REPORT_ROUNDS}回戦です。`)
  }
  if (report.tournamentRounds.length > MAX_TOURNAMENT_REPORT_ROUNDS) {
    errors.push(
      `決勝トーナメントは最大${MAX_TOURNAMENT_REPORT_ROUNDS}回戦です。`,
    )
  }

  report.swissRounds.forEach((round, index) => {
    errors.push(...validateRound(round, `R${index + 1}`, validOshiCardNumbers))
  })
  report.tournamentRounds.forEach((round, index) => {
    errors.push(...validateRound(round, `T${index + 1}`, validOshiCardNumbers))
  })

  return errors
}
