import type { Card } from '../cards/types'
import { SITE_NAME, SITE_ORIGIN } from '../site/constants'
import { formatOshiLabel } from './oshi'
import {
  formatTournamentResultSummary,
  summarizeTournamentRounds,
} from './report'
import type { TournamentReport } from './types'
import type { TournamentReportImageFile } from './renderImage'

export const TOURNAMENT_REPORT_SHARE_URL = `${SITE_ORIGIN}/tournament-report`
export const X_TWEET_INTENT_URL = 'https://twitter.com/intent/tweet'

const SHARE_TITLE_MAX_LENGTH = 80
const SHARE_FIELD_MAX_LENGTH = 100

export type TournamentShareData = {
  title: string
  text: string
  url: string
  files?: File[]
}

export type TournamentShareNavigator = {
  share?: (data: TournamentShareData) => Promise<void>
  canShare?: (data: Pick<TournamentShareData, 'files'>) => boolean
}

export type TournamentShareResult =
  | { status: 'shared'; includedImages: boolean; imageFallback: boolean }
  | { status: 'unsupported' }
  | { status: 'cancelled' }
  | { status: 'error'; error: unknown }

export type ShareTournamentReportOptions = {
  navigator: TournamentShareNavigator
  title: string
  text: string
  url?: string
  images?: readonly TournamentReportImageFile[]
  createFile?: (
    parts: BlobPart[],
    fileName: string,
    options: FilePropertyBag,
  ) => File
}

function truncate(value: string, maximumLength: number): string {
  const normalized = value.trim()
  return normalized.length <= maximumLength
    ? normalized
    : `${normalized.slice(0, maximumLength - 1)}…`
}

function defaultCreateFile(
  parts: BlobPart[],
  fileName: string,
  options: FilePropertyBag,
): File {
  return new File(parts, fileName, options)
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      error.name === 'AbortError')
  )
}

export function buildTournamentShareTitle(report: TournamentReport): string {
  const tournamentName = truncate(
    report.tournamentName,
    SHARE_TITLE_MAX_LENGTH - ` | ${SITE_NAME}`.length,
  )
  return `${tournamentName || '大会戦績'} | ${SITE_NAME}`
}

export function buildTournamentShareText(
  report: TournamentReport,
  oshiCards: readonly Card[],
): string {
  const tournamentName = truncate(report.tournamentName, SHARE_FIELD_MAX_LENGTH)
  const placement = truncate(report.placement, SHARE_FIELD_MAX_LENGTH)
  const heading = [tournamentName, placement].filter(Boolean).join(' ')
  const selfOshi = oshiCards.find(
    (card) => card.cardNumber === report.selfOshiCardNumber,
  )
  const swissSummary = summarizeTournamentRounds(report.swissRounds)
  const tournamentSummary = summarizeTournamentRounds(report.tournamentRounds)

  return [
    heading || undefined,
    selfOshi ? `使用推し：${formatOshiLabel(selfOshi, oshiCards)}` : undefined,
    swissSummary.completedRounds > 0
      ? `Swiss ${formatTournamentResultSummary(swissSummary)}`
      : undefined,
    tournamentSummary.completedRounds > 0
      ? `Tournament ${formatTournamentResultSummary(tournamentSummary)}`
      : undefined,
    SITE_NAME,
    '#ホロカ #HLSieveDB',
  ]
    .filter((value): value is string => value !== undefined)
    .join('\n')
}

export function buildTournamentXIntentUrl(
  text: string,
  url = TOURNAMENT_REPORT_SHARE_URL,
): string {
  const params = new URLSearchParams({ text, url })
  return `${X_TWEET_INTENT_URL}?${params.toString()}`
}

export function buildTournamentShareFiles(
  images: readonly TournamentReportImageFile[],
  createFile = defaultCreateFile,
): File[] {
  return images.map((image) =>
    createFile([image.blob], image.fileName, { type: 'image/png' }),
  )
}

export async function shareTournamentReport({
  navigator: shareNavigator,
  title,
  text,
  url = TOURNAMENT_REPORT_SHARE_URL,
  images = [],
  createFile = defaultCreateFile,
}: ShareTournamentReportOptions): Promise<TournamentShareResult> {
  if (!shareNavigator.share) return { status: 'unsupported' }

  let files: File[]
  let imageFallback = images.length > 0
  try {
    const candidateFiles = buildTournamentShareFiles(images, createFile)
    if (
      candidateFiles.length > 0 &&
      shareNavigator.canShare?.({ files: candidateFiles }) === true
    ) {
      files = candidateFiles
      imageFallback = false
    } else {
      files = []
    }
  } catch {
    files = []
  }

  try {
    await shareNavigator.share({
      title,
      text,
      url,
      ...(files.length > 0 ? { files } : {}),
    })
    return {
      status: 'shared',
      includedImages: files.length > 0,
      imageFallback,
    }
  } catch (error) {
    return isAbortError(error)
      ? { status: 'cancelled' }
      : { status: 'error', error }
  }
}
