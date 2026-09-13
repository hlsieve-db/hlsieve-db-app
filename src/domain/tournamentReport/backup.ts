import {
  isSavedTournamentReport,
  type SavedTournamentReport,
} from './savedReport'

export const TOURNAMENT_BACKUP_FORMAT = 'hlsieve-tournament-backup' as const
export const TOURNAMENT_BACKUP_VERSION = 1 as const
export const MAX_TOURNAMENT_BACKUP_FILE_SIZE = 5 * 1024 * 1024

export type TournamentBackup = {
  format: typeof TOURNAMENT_BACKUP_FORMAT
  version: typeof TOURNAMENT_BACKUP_VERSION
  exportedAt: string
  reports: SavedTournamentReport[]
}

export type TournamentImportPlan = {
  records: SavedTournamentReport[]
  newCount: number
  identicalCount: number
  conflictCount: number
}

export type TournamentBackupParseResult =
  { ok: true; backup: TournamentBackup } | { ok: false; message: string }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  )
}

function isValidBackupReport(value: unknown): value is SavedTournamentReport {
  return (
    isPlainObject(value) &&
    isSavedTournamentReport(value) &&
    value.report.tournamentName.trim().length > 0
  )
}

export function createTournamentBackup(
  reports: readonly SavedTournamentReport[],
  exportedAt = new Date().toISOString(),
): TournamentBackup {
  if (!isIsoTimestamp(exportedAt)) throw new Error('Invalid export timestamp.')
  const invalidIndex = reports.findIndex(
    (report) => !isValidBackupReport(report),
  )
  if (invalidIndex >= 0) {
    throw new Error(`${invalidIndex + 1}件目の大会戦績が不正です。`)
  }
  return {
    format: TOURNAMENT_BACKUP_FORMAT,
    version: TOURNAMENT_BACKUP_VERSION,
    exportedAt,
    reports: [...reports].sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id),
    ),
  }
}

export function serializeTournamentBackup(backup: TournamentBackup): string {
  return JSON.stringify(backup, null, 2)
}

export function createTournamentBackupFilename(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `hlsieve-tournament-backup-${year}-${month}-${day}.json`
}

export function parseTournamentBackup(
  text: string,
): TournamentBackupParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return {
      ok: false,
      message: 'バックアップファイルを読み込めませんでした。',
    }
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, message: 'このバックアップ形式には対応していません。' }
  }
  if (
    parsed.format !== TOURNAMENT_BACKUP_FORMAT ||
    parsed.version !== TOURNAMENT_BACKUP_VERSION
  ) {
    return { ok: false, message: 'このバックアップ形式には対応していません。' }
  }
  if (!isIsoTimestamp(parsed.exportedAt) || !Array.isArray(parsed.reports)) {
    return { ok: false, message: 'バックアップファイルの内容が不正です。' }
  }
  const invalidIndex = parsed.reports.findIndex(
    (report) => !isValidBackupReport(report),
  )
  if (invalidIndex >= 0) {
    return {
      ok: false,
      message: `${invalidIndex + 1}件目の大会戦績が不正なため、読み込みを中止しました。`,
    }
  }
  return {
    ok: true,
    backup: {
      format: TOURNAMENT_BACKUP_FORMAT,
      version: TOURNAMENT_BACKUP_VERSION,
      exportedAt: parsed.exportedAt,
      reports: parsed.reports as SavedTournamentReport[],
    },
  }
}

function sameRound(
  left: SavedTournamentReport['report']['swissRounds'][number],
  right: SavedTournamentReport['report']['swissRounds'][number],
): boolean {
  return (
    left.opponentOshiCardNumber === right.opponentOshiCardNumber &&
    left.playOrder === right.playOrder &&
    left.initiativeChoiceResult === right.initiativeChoiceResult &&
    left.result === right.result
  )
}

function sameRounds(
  left: SavedTournamentReport['report']['swissRounds'],
  right: SavedTournamentReport['report']['swissRounds'],
): boolean {
  return (
    left.length === right.length &&
    left.every((round, index) => sameRound(round, right[index]))
  )
}

export function hasSameTournamentReportContent(
  left: SavedTournamentReport,
  right: SavedTournamentReport,
): boolean {
  const a = left.report
  const b = right.report
  return (
    left.schemaVersion === right.schemaVersion &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    a.tournamentName === b.tournamentName &&
    a.placement === b.placement &&
    a.participantCount === b.participantCount &&
    a.eventDate === b.eventDate &&
    a.selfOshiCardNumber === b.selfOshiCardNumber &&
    sameRounds(a.swissRounds, b.swissRounds) &&
    sameRounds(a.tournamentRounds, b.tournamentRounds)
  )
}

export function planTournamentBackupImport(
  imported: readonly SavedTournamentReport[],
  existing: readonly SavedTournamentReport[],
  createId: () => string = () => crypto.randomUUID(),
): TournamentImportPlan {
  const occupied = new Map(existing.map((report) => [report.id, report]))
  const reservedIds = new Set([
    ...existing.map(({ id }) => id),
    ...imported.map(({ id }) => id),
  ])
  const known = [...existing]
  const records: SavedTournamentReport[] = []
  let newCount = 0
  let identicalCount = 0
  let conflictCount = 0

  for (const report of imported) {
    const sameId = occupied.get(report.id)
    if (!sameId) {
      records.push(report)
      occupied.set(report.id, report)
      known.push(report)
      newCount += 1
      continue
    }
    if (
      hasSameTournamentReportContent(sameId, report) ||
      known.some(
        (candidate) =>
          candidate.id !== report.id &&
          hasSameTournamentReportContent(candidate, report),
      )
    ) {
      identicalCount += 1
      continue
    }

    let generatedId = createId()
    while (!generatedId.trim() || reservedIds.has(generatedId)) {
      generatedId = createId()
    }
    const renamed = { ...report, id: generatedId }
    records.push(renamed)
    occupied.set(generatedId, renamed)
    reservedIds.add(generatedId)
    known.push(renamed)
    conflictCount += 1
  }

  return { records, newCount, identicalCount, conflictCount }
}
