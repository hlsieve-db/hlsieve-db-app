import type { Card } from '../cards/types'
import { formatTournamentReportText } from './formatText'
import { formatOshiLabel } from './oshi'
import {
  formatTournamentResultSummary,
  summarizeTournamentRounds,
} from './report'
import type { TournamentReport, TournamentRound } from './types'

export const TOURNAMENT_REPORT_IMAGE_WIDTH = 1600
export const TOURNAMENT_REPORT_IMAGE_HEIGHT = 900
export const TOURNAMENT_REPORT_ROWS_PER_PAGE = 9

export type TournamentReportImageRound = {
  label: string
  opponent: string
  playOrder: string
  initiative: string
  result: string
}

export type TournamentReportImageSection = {
  kind: 'swiss' | 'tournament'
  heading: 'Swiss' | 'Tournament'
  summary?: string
  rounds: TournamentReportImageRound[]
}

export type TournamentReportImagePage = {
  pageNumber: number
  totalPages: number
  tournamentName: string
  placement?: string
  selfOshi?: string
  participantCount?: string
  eventDate?: string
  sections: TournamentReportImageSection[]
}

type IndexedRound = {
  kind: TournamentReportImageSection['kind']
  index: number
  round: TournamentRound
}

const PLAY_ORDER_LABELS = {
  first: '先攻',
  second: '後攻',
} as const

const INITIATIVE_LABELS = {
  won_choice: '⚀○',
  lost_choice: '⚀×',
} as const

const RESULT_LABELS = {
  win: '○ WIN',
  draw: '△ DRAW',
  loss: '× LOSE',
} as const

function isNonEmptyRound(round: TournamentRound): boolean {
  return Object.values(round).some((value) => value !== undefined)
}

function formatRound(
  indexedRound: IndexedRound,
  oshiCards: readonly Card[],
): TournamentReportImageRound {
  const { index, kind, round } = indexedRound
  const opponent = oshiCards.find(
    (card) => card.cardNumber === round.opponentOshiCardNumber,
  )
  return {
    label: `${kind === 'swiss' ? 'R' : 'T'}${index + 1}`,
    opponent: opponent ? formatOshiLabel(opponent, oshiCards) : '',
    playOrder: round.playOrder ? PLAY_ORDER_LABELS[round.playOrder] : '',
    initiative: round.initiativeChoiceResult
      ? INITIATIVE_LABELS[round.initiativeChoiceResult]
      : '',
    result: round.result ? RESULT_LABELS[round.result] : '',
  }
}

function sectionSummary(
  kind: TournamentReportImageSection['kind'],
  report: TournamentReport,
): string | undefined {
  const summary = summarizeTournamentRounds(
    kind === 'swiss' ? report.swissRounds : report.tournamentRounds,
  )
  return summary.completedRounds > 0
    ? formatTournamentResultSummary(summary)
    : undefined
}

function groupPageSections(
  rounds: readonly IndexedRound[],
  report: TournamentReport,
  oshiCards: readonly Card[],
): TournamentReportImageSection[] {
  return (['swiss', 'tournament'] as const).flatMap((kind) => {
    const matchingRounds = rounds.filter((round) => round.kind === kind)
    if (matchingRounds.length === 0) return []
    return [
      {
        kind,
        heading: kind === 'swiss' ? 'Swiss' : 'Tournament',
        summary: sectionSummary(kind, report),
        rounds: matchingRounds.map((round) => formatRound(round, oshiCards)),
      },
    ]
  })
}

export function buildTournamentReportImagePages(
  report: TournamentReport,
  oshiCards: readonly Card[],
): TournamentReportImagePage[] {
  if (!formatTournamentReportText(report, oshiCards)) return []

  const indexedRounds: IndexedRound[] = [
    ...report.swissRounds.map((round, index) => ({
      kind: 'swiss' as const,
      index,
      round,
    })),
    ...report.tournamentRounds.map((round, index) => ({
      kind: 'tournament' as const,
      index,
      round,
    })),
  ].filter(({ round }) => isNonEmptyRound(round))
  const chunks: IndexedRound[][] = []

  if (indexedRounds.length === 0) {
    chunks.push([])
  } else {
    for (
      let offset = 0;
      offset < indexedRounds.length;
      offset += TOURNAMENT_REPORT_ROWS_PER_PAGE
    ) {
      chunks.push(
        indexedRounds.slice(offset, offset + TOURNAMENT_REPORT_ROWS_PER_PAGE),
      )
    }
  }

  const selfOshi = oshiCards.find(
    (card) => card.cardNumber === report.selfOshiCardNumber,
  )
  return chunks.map((rounds, index) => ({
    pageNumber: index + 1,
    totalPages: chunks.length,
    tournamentName: report.tournamentName.trim() || '大会戦績レポート',
    placement: report.placement.trim() || undefined,
    selfOshi: selfOshi ? formatOshiLabel(selfOshi, oshiCards) : undefined,
    participantCount:
      report.participantCount !== undefined &&
      Number.isFinite(report.participantCount)
        ? `${report.participantCount.toLocaleString('ja-JP')}人`
        : undefined,
    eventDate: report.eventDate?.replaceAll('-', '/'),
    sections: groupPageSections(rounds, report, oshiCards),
  }))
}

export function sanitizeTournamentReportFileName(value: string): string {
  return Array.from(value)
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/[. ]+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80)
}

export function buildTournamentReportImageFileName(
  tournamentName: string,
  pageNumber: number,
  totalPages: number,
): string {
  const safeName = sanitizeTournamentReportFileName(tournamentName)
  const baseName = safeName
    ? `hlsieve-${safeName}`
    : 'hlsieve-tournament-report'
  return `${baseName}${totalPages > 1 ? `-${pageNumber}` : ''}.png`
}
