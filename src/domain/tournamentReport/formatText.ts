import type { Card } from '../cards/types'
import { formatOshiLabel } from './oshi'
import {
  formatTournamentResultSummary,
  summarizeTournamentRounds,
} from './report'
import type { TournamentReport, TournamentRound } from './types'

const PLAY_ORDER_TEXT = {
  first: '先攻',
  second: '後攻',
} as const

const INITIATIVE_TEXT = {
  won_choice: '⚀○',
  lost_choice: '⚀×',
} as const

const RESULT_TEXT = {
  win: 'WIN',
  draw: 'DRAW',
  loss: 'LOSE',
} as const

function isNonEmptyRound(round: TournamentRound): boolean {
  return Object.values(round).some((value) => value !== undefined)
}

function formatEventDate(eventDate: string): string {
  return eventDate.replaceAll('-', '/')
}

function formatRoundLine(
  label: string,
  round: TournamentRound,
  oshiCards: readonly Card[],
): string {
  const opponent = oshiCards.find(
    (card) => card.cardNumber === round.opponentOshiCardNumber,
  )
  return [
    label,
    opponent ? formatOshiLabel(opponent, oshiCards) : undefined,
    round.playOrder ? PLAY_ORDER_TEXT[round.playOrder] : undefined,
    round.initiativeChoiceResult
      ? INITIATIVE_TEXT[round.initiativeChoiceResult]
      : undefined,
    round.result ? RESULT_TEXT[round.result] : undefined,
  ]
    .filter((value): value is string => value !== undefined)
    .join(' ')
}

function formatRoundSection(
  heading: 'Swiss' | 'Tournament',
  prefix: 'R' | 'T',
  rounds: readonly TournamentRound[],
  oshiCards: readonly Card[],
): string | undefined {
  const populatedRounds = rounds
    .map((round, index) => ({ round, index }))
    .filter(({ round }) => isNonEmptyRound(round))
  if (populatedRounds.length === 0) return undefined

  const summary = summarizeTournamentRounds(rounds)
  const summaryText =
    summary.completedRounds > 0
      ? ` ${formatTournamentResultSummary(summary)}`
      : ''
  return [
    `${heading}${summaryText}`,
    ...populatedRounds.map(({ round, index }) =>
      formatRoundLine(`${prefix}${index + 1}`, round, oshiCards),
    ),
  ].join('\n')
}

export function hasTournamentReportTextContent(
  report: TournamentReport,
): boolean {
  return Boolean(
    report.tournamentName.trim() ||
    report.placement.trim() ||
    report.participantCount !== undefined ||
    report.eventDate ||
    report.selfOshiCardNumber ||
    report.swissRounds.some(isNonEmptyRound) ||
    report.tournamentRounds.some(isNonEmptyRound),
  )
}

export function formatTournamentReportText(
  report: TournamentReport,
  oshiCards: readonly Card[],
): string {
  if (!hasTournamentReportTextContent(report)) return ''

  const basicLines = [
    report.tournamentName.trim() || undefined,
    report.placement.trim() || undefined,
    report.participantCount !== undefined &&
    Number.isFinite(report.participantCount)
      ? `参加人数：${report.participantCount.toLocaleString('ja-JP')}人`
      : undefined,
    report.eventDate
      ? `開催日：${formatEventDate(report.eventDate)}`
      : undefined,
  ].filter((value): value is string => value !== undefined)
  const selfOshi = oshiCards.find(
    (card) => card.cardNumber === report.selfOshiCardNumber,
  )
  const identitySection = selfOshi
    ? `使用推し：${formatOshiLabel(selfOshi, oshiCards)}`
    : undefined
  const swissSection = formatRoundSection(
    'Swiss',
    'R',
    report.swissRounds,
    oshiCards,
  )
  const tournamentSection = formatRoundSection(
    'Tournament',
    'T',
    report.tournamentRounds,
    oshiCards,
  )

  return [
    basicLines.length > 0 ? basicLines.join('\n') : undefined,
    identitySection,
    swissSection,
    tournamentSection,
    'HLSieve DB',
  ]
    .filter((value): value is string => value !== undefined)
    .join('\n\n')
}
