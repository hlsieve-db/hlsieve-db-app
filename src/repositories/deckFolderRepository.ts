import { STORE_DECK_FOLDERS } from '../domain/decks/constants'
import type { LocalDataNamespace } from '../domain/storage/localDataNamespace'
import type { DeckFolder, DeckFolderId } from '../domain/deckOrganization/types'
import { isDeckFolder } from '../domain/deckOrganization/validation'
import {
  createIndexedDbStorePersistence,
  type IndexedDbStorePersistence,
} from './appDatabase'
import type { DeckOrganizationTransactions } from './deckOrganizationTransactions'

export type DeckFolderRepository = {
  listFolders: () => Promise<DeckFolder[]>
  getFolder: (id: DeckFolderId) => Promise<DeckFolder | undefined>
  saveFolder: (folder: DeckFolder) => Promise<void>
  /**
   * Removes the folder and takes it off every deck that was in it, in one
   * transaction, and reports how many decks that was. The decks themselves stay.
   *
   * There is no way to remove only the definition: a deck pointing at a folder
   * that no longer exists is a state nothing else in the app can describe.
   */
  deleteFolder: (id: DeckFolderId, updatedAt?: string) => Promise<number>
  /** Rewrites the whole order in one transaction, so no two folders swap places. */
  saveFolderOrder: (folders: readonly DeckFolder[]) => Promise<void>
}

export type DeckFolderPersistence = IndexedDbStorePersistence<DeckFolder> & {
  addMany: (values: readonly DeckFolder[]) => Promise<void>
}

function assertFolder(value: unknown): DeckFolder {
  if (!isDeckFolder(value))
    throw new Error('Stored folder has an invalid shape.')
  return value
}

export function createDeckFolderRepository(
  persistence: DeckFolderPersistence,
  transactions: Pick<
    DeckOrganizationTransactions,
    'deleteFolder' | 'saveFolderOrder'
  >,
): DeckFolderRepository {
  return {
    async listFolders() {
      return (await persistence.getAll())
        .map(assertFolder)
        .sort(
          (left, right) =>
            left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
        )
    },
    async getFolder(id) {
      const value = await persistence.get(id)
      return value === undefined ? undefined : assertFolder(value)
    },
    async saveFolder(folder) {
      if (!isDeckFolder(folder)) throw new Error('Folder has an invalid shape.')
      await persistence.put(folder)
    },
    async deleteFolder(id, updatedAt) {
      return transactions.deleteFolder(id, updatedAt)
    },
    async saveFolderOrder(folders) {
      await transactions.saveFolderOrder(folders)
    },
  }
}

export function createIndexedDbDeckFolderPersistence(
  databaseFactory?: IDBFactory,
  namespace?: LocalDataNamespace,
): DeckFolderPersistence {
  return createIndexedDbStorePersistence(
    STORE_DECK_FOLDERS,
    databaseFactory,
    namespace,
  )
}
