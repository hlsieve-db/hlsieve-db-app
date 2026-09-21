import { STORE_TOURNAMENT_REPORTS } from '../domain/decks/constants'
import {
  createSavedTournamentReport,
  isSavedTournamentReport,
  type SavedTournamentReport,
  updateSavedTournamentReport,
} from '../domain/tournamentReport/savedReport'
import type { TournamentReport } from '../domain/tournamentReport/types'
import {
  createIndexedDbStorePersistence,
  type IndexedDbStorePersistence,
} from './appDatabase'
import type { LocalDataNamespace } from '../domain/storage/localDataNamespace'

export type TournamentReportPersistenceAdapter = Omit<
  IndexedDbStorePersistence<SavedTournamentReport>,
  'addMany'
> & {
  addMany: (values: readonly SavedTournamentReport[]) => Promise<void>
}

export type TournamentReportRepository = {
  createReport: (report: TournamentReport) => Promise<SavedTournamentReport>
  getReport: (id: string) => Promise<SavedTournamentReport | undefined>
  listReports: () => Promise<SavedTournamentReport[]>
  updateReport: (
    id: string,
    report: TournamentReport,
  ) => Promise<SavedTournamentReport>
  deleteReport: (id: string) => Promise<void>
  importReports: (reports: readonly SavedTournamentReport[]) => Promise<void>
}

type RepositoryOptions = {
  id?: () => string
  now?: () => string
}

function compareReports(
  left: SavedTournamentReport,
  right: SavedTournamentReport,
): number {
  const leftDate = left.report.eventDate
  const rightDate = right.report.eventDate
  if (leftDate && rightDate && leftDate !== rightDate) {
    return rightDate.localeCompare(leftDate)
  }
  if (leftDate && !rightDate) return -1
  if (!leftDate && rightDate) return 1
  return right.updatedAt.localeCompare(left.updatedAt)
}

export function createTournamentReportRepository(
  persistence: TournamentReportPersistenceAdapter,
  options: RepositoryOptions = {},
): TournamentReportRepository {
  const repository: TournamentReportRepository = {
    async createReport(report) {
      const saved = createSavedTournamentReport(report, options)
      await persistence.put(saved)
      return saved
    },
    async getReport(id) {
      const value = await persistence.get(id)
      return isSavedTournamentReport(value) ? value : undefined
    },
    async listReports() {
      return (await persistence.getAll())
        .filter(isSavedTournamentReport)
        .sort(compareReports)
    },
    async updateReport(id, report) {
      const current = await repository.getReport(id)
      if (!current) throw new Error('Tournament report was not found.')
      const updated = updateSavedTournamentReport(current, report, options)
      await persistence.put(updated)
      return updated
    },
    async deleteReport(id) {
      await persistence.delete(id)
    },
    async importReports(reports) {
      if (!reports.every(isSavedTournamentReport)) {
        throw new Error('Invalid tournament report import.')
      }
      await persistence.addMany(reports)
    },
  }
  return repository
}

export function createIndexedDbTournamentReportPersistence(
  databaseFactory?: IDBFactory,
  namespace?: LocalDataNamespace,
): TournamentReportPersistenceAdapter {
  return createIndexedDbStorePersistence(
    STORE_TOURNAMENT_REPORTS,
    databaseFactory,
    namespace,
  )
}

export const tournamentReportRepository = createTournamentReportRepository(
  createIndexedDbTournamentReportPersistence(),
)
