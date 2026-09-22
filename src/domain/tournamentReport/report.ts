import type {
  TournamentReport,
  TournamentResultSummary,
  TournamentRound,
} from './types'

export const MAX_SWISS_REPORT_ROUNDS = 10
export const MAX_TOURNAMENT_REPORT_ROUNDS = 4
export const MAX_TOURNAMENT_NAME_LENGTH = 100
export const MAX_PLACEMENT_LENGTH = 50
export const MAX_OSHI_NAME_LENGTH = 50
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

function validateRound(round: TournamentRound, label: string): string[] {
  const errors: string[] = []
  // The opponent oshi is free text, so there is nothing to validate it
  // against. A card number may still be attached when the text named one, and
  // an older report may carry one on its own; neither has to resolve, because
  // a card can leave the data without invalidating a report already written.
  if (
    round.opponentOshiName !== undefined &&
    round.opponentOshiName.trim().length === 0
  ) {
    errors.push(`${label}の対戦相手の推しを入力してください。`)
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

/**
 * The oshi is free text, so there is no card list to validate against and none
 * is taken. A report stays valid when a card leaves the data.
 */
export function validateTournamentReport(report: TournamentReport): string[] {
  const errors: string[] = []

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
  // Still required, but any non-empty text satisfies it now. An older report
  // carrying only a card number counts as filled in, so reports that were
  // valid before stay valid.
  if (!report.selfOshiName?.trim() && !report.selfOshiCardNumber) {
    errors.push('自分の推しホロメンを入力してください。')
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
    errors.push(...validateRound(round, `R${index + 1}`))
  })
  report.tournamentRounds.forEach((round, index) => {
    errors.push(...validateRound(round, `T${index + 1}`))
  })

  return errors
}
