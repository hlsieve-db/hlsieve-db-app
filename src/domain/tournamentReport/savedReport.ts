import {
  MAX_REPORT_PARTICIPANTS,
  MAX_PLACEMENT_LENGTH,
  MAX_SWISS_REPORT_ROUNDS,
  MAX_TOURNAMENT_NAME_LENGTH,
  MAX_TOURNAMENT_REPORT_ROUNDS,
} from './report'
import type { TournamentReport, TournamentRound } from './types'

export const TOURNAMENT_REPORT_SCHEMA_VERSION = 1 as const

export type SavedTournamentReport = {
  id: string
  schemaVersion: typeof TOURNAMENT_REPORT_SCHEMA_VERSION
  report: TournamentReport
  createdAt: string
  updatedAt: string
}

type SavedReportOptions = {
  id?: () => string
  now?: () => string
}

const MATCH_RESULTS = new Set(['win', 'loss', 'draw'])
const PLAY_ORDERS = new Set(['first', 'second'])
const INITIATIVE_RESULTS = new Set(['won_choice', 'lost_choice'])

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

function isRound(value: unknown): value is TournamentRound {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const round = value as Record<string, unknown>
  return (
    isOptionalString(round.opponentOshiCardNumber) &&
    (round.opponentOshiCardNumber === undefined ||
      round.opponentOshiCardNumber.trim().length > 0) &&
    (round.playOrder === undefined ||
      PLAY_ORDERS.has(String(round.playOrder))) &&
    (round.initiativeChoiceResult === undefined ||
      INITIATIVE_RESULTS.has(String(round.initiativeChoiceResult))) &&
    (round.result === undefined || MATCH_RESULTS.has(String(round.result)))
  )
}

function isReport(value: unknown): value is TournamentReport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const report = value as Record<string, unknown>
  return (
    typeof report.tournamentName === 'string' &&
    report.tournamentName.length <= MAX_TOURNAMENT_NAME_LENGTH &&
    typeof report.placement === 'string' &&
    report.placement.length <= MAX_PLACEMENT_LENGTH &&
    (report.participantCount === undefined ||
      (Number.isSafeInteger(report.participantCount) &&
        Number(report.participantCount) >= 1 &&
        Number(report.participantCount) <= MAX_REPORT_PARTICIPANTS)) &&
    (report.eventDate === undefined || isEventDate(report.eventDate)) &&
    isOptionalString(report.selfOshiCardNumber) &&
    (report.selfOshiCardNumber === undefined ||
      report.selfOshiCardNumber.trim().length > 0) &&
    Array.isArray(report.swissRounds) &&
    report.swissRounds.length <= MAX_SWISS_REPORT_ROUNDS &&
    report.swissRounds.every(isRound) &&
    Array.isArray(report.tournamentRounds) &&
    report.tournamentRounds.length <= MAX_TOURNAMENT_REPORT_ROUNDS &&
    report.tournamentRounds.every(isRound)
  )
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  )
}

function isEventDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export function isSavedTournamentReport(
  value: unknown,
): value is SavedTournamentReport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const saved = value as Record<string, unknown>
  return (
    typeof saved.id === 'string' &&
    saved.id.trim().length > 0 &&
    saved.schemaVersion === TOURNAMENT_REPORT_SCHEMA_VERSION &&
    isReport(saved.report) &&
    isIsoTimestamp(saved.createdAt) &&
    isIsoTimestamp(saved.updatedAt)
  )
}

export function cloneTournamentReport(
  report: TournamentReport,
): TournamentReport {
  return {
    ...report,
    swissRounds: report.swissRounds.map((round) => ({ ...round })),
    tournamentRounds: report.tournamentRounds.map((round) => ({ ...round })),
  }
}

export function createSavedTournamentReport(
  report: TournamentReport,
  options: SavedReportOptions = {},
): SavedTournamentReport {
  const timestamp = (options.now ?? (() => new Date().toISOString()))()
  const saved: SavedTournamentReport = {
    id: (options.id ?? (() => crypto.randomUUID()))(),
    schemaVersion: TOURNAMENT_REPORT_SCHEMA_VERSION,
    report: cloneTournamentReport(report),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  if (!isSavedTournamentReport(saved))
    throw new Error('Invalid tournament report.')
  return saved
}

export function updateSavedTournamentReport(
  saved: SavedTournamentReport,
  report: TournamentReport,
  options: Pick<SavedReportOptions, 'now'> = {},
): SavedTournamentReport {
  const updated = {
    ...saved,
    report: cloneTournamentReport(report),
    updatedAt: (options.now ?? (() => new Date().toISOString()))(),
  }
  if (!isSavedTournamentReport(updated))
    throw new Error('Invalid tournament report.')
  return updated
}
