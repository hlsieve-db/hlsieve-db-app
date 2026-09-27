import {
  createSupabaseCloudDeckRepository,
  type CloudDeckRepository,
} from '../cloud/cloudDeckRepository'
import {
  withCloudDeckSync,
  type CloudSyncedDeckRepository,
} from '../cloud/cloudSyncedDeckRepository'
import {
  createSupabaseCloudDeckVersionRepository,
  type CloudDeckVersionRepository,
} from '../cloud/cloudDeckVersionRepository'
import { withCloudDeckVersionSync } from '../cloud/cloudSyncedDeckVersionRepository'
import { isCloudSyncEnabled } from '../domain/cloud/cloudSyncState'
import { recordCloudUploadSuccess } from '../domain/cloud/cloudUploadStatus'
import {
  clearPendingDeckSync,
  recordPendingDeckSync,
} from '../domain/cloud/pendingDeckSync'
import {
  clearPendingDeckVersionSync,
  clearPendingDeckVersionSyncForDeck,
  recordPendingDeckVersionSync,
} from '../domain/cloud/pendingDeckVersionSync'
import {
  ANONYMOUS_LOCAL_DATA_NAMESPACE,
  type LocalDataNamespace,
} from '../domain/storage/localDataNamespace'
import {
  createDeckRepository,
  createIndexedDbDeckPersistence,
  type DeckBackupRepository,
} from './deckRepository'
import {
  createDeckFolderRepository,
  createIndexedDbDeckFolderPersistence,
  type DeckFolderRepository,
} from './deckFolderRepository'
import {
  createDeckOrganizationRepository,
  createIndexedDbDeckOrganizationPersistence,
  type DeckOrganizationRepository,
} from './deckOrganizationRepository'
import { createIndexedDbDeckOrganizationTransactions } from './deckOrganizationTransactions'
import { withDeckOrganizationCascade } from './deckOrganizationCascade'
import {
  createDeckTagRepository,
  createIndexedDbDeckTagPersistence,
  type DeckTagRepository,
} from './deckTagRepository'
import {
  createDeckVersionRepository,
  createIndexedDbDeckVersionPersistence,
  type DeckVersionRepository,
} from './deckVersionRepository'
import { withDeckVersionCascade } from './deckVersionCascade'
import {
  createSupabaseCloudDeckOrganizationRepository,
  type CloudDeckOrganizationRepository,
} from '../cloud/cloudDeckOrganizationRepository'
import {
  createMissingTableMemo,
  withCloudDeckFolderSync,
  withCloudDeckOrganizationSync,
  withCloudDeckTagSync,
} from '../cloud/cloudSyncedDeckOrganizationRepositories'
import {
  retryPendingOrganizationForDeck,
  retryPendingOrganizationsForFolder,
  type PendingOrganizationQueueAccess,
} from '../cloud/retryPendingDeckOrganizationSync'
import {
  clearPendingDeckFolderSync,
  clearPendingDeckOrganizationSync,
  clearPendingDeckTagSync,
  readPendingDeckFolderSync,
  readPendingDeckOrganizationSync,
  readPendingDeckTagSync,
  recordPendingDeckFolderSync,
  recordPendingDeckOrganizationSync,
  recordPendingDeckTagSync,
} from '../domain/cloud/pendingDeckOrganizationSync'
import {
  createFavoriteCardRepository,
  createIndexedDbFavoriteCardPersistence,
  type FavoriteCardRepository,
} from './favoriteCardRepository'
import {
  createIndexedDbRecentlyViewedCardPersistence,
  createRecentlyViewedCardRepository,
  type RecentlyViewedCardRepository,
} from './recentlyViewedCardRepository'
import {
  createIndexedDbSavedSearchPresetPersistence,
  createSavedSearchPresetRepository,
  type SavedSearchPresetRepository,
} from './savedSearchPresetRepository'
import {
  createIndexedDbTournamentReportPersistence,
  createTournamentReportRepository,
  type TournamentReportRepository,
} from './tournamentReportRepository'

type OrganizationQueueAccess<Key extends string> =
  PendingOrganizationQueueAccess<Key>

export type AppRepositories = {
  namespace: LocalDataNamespace
  decks: CloudSyncedDeckRepository
  deckFolders: DeckFolderRepository
  deckTags: DeckTagRepository
  deckOrganizations: DeckOrganizationRepository
  favoriteCards: FavoriteCardRepository
  savedSearchPresets: SavedSearchPresetRepository
  tournamentReports: TournamentReportRepository
  recentlyViewedCards: RecentlyViewedCardRepository
  /**
   * Null unless this is an account and the deployment has Supabase configured.
   * Everything else in this bundle is browser-local and always present; this is
   * the one that may be absent, so callers treat it as optional.
   *
   * Holding it here does not sync anything. Nothing reads or writes a cloud row
   * until the account asks for it.
   */
  cloudDecks: CloudDeckRepository | null
  cloudDeckVersions: CloudDeckVersionRepository | null
  /**
   * The deck store without the cloud sync wrapper.
   *
   * Only restoring from the cloud uses it. Writing a restored deck through the
   * wrapped repository would push it straight back to the account it just came
   * from, so the one operation whose writes originate in the cloud bypasses the
   * upload. Everything else in the app should use `decks`.
   */
  localDecks: DeckBackupRepository
  localDeckVersions: DeckVersionRepository
  /**
   * The folder, tag and organization stores without their cloud wrappers, and
   * the account's cloud repository for them.
   *
   * The retry uses these: reading through a wrapped store is harmless, but
   * writing through one would make a retry trigger another send.
   */
  localDeckFolders: DeckFolderRepository
  localDeckTags: DeckTagRepository
  localDeckOrganizations: DeckOrganizationRepository
  cloudDeckOrganization: CloudDeckOrganizationRepository | null
  /**
   * Manual deck snapshots. Browser-local for now: nothing sends them anywhere,
   * so they are not part of the cloud bundle.
   */
  deckVersions: DeckVersionRepository
}

/**
 * Every browser-local store for one account, built together so a switch
 * cannot leave one of them pointing at the previous namespace.
 */
export function createAppRepositories(
  namespace: LocalDataNamespace = ANONYMOUS_LOCAL_DATA_NAMESPACE,
  databaseFactory?: IDBFactory,
  /** Supplied by tests; production resolves the Supabase repository itself. */
  cloudDecks?: CloudDeckRepository | null,
  /** Supplied by tests; production resolves the Supabase repository itself. */
  cloudDeckVersions?: CloudDeckVersionRepository | null,
  /** Supplied by tests; production resolves the Supabase repository itself. */
  cloudDeckOrganization?: CloudDeckOrganizationRepository | null,
): AppRepositories {
  // An anonymous visitor has no account to sync with, so there is nothing to
  // build even where Supabase is configured.
  const cloud =
    cloudDecks !== undefined
      ? cloudDecks
      : namespace.kind === 'user'
        ? createSupabaseCloudDeckRepository()
        : null

  const cloudVersions =
    cloudDeckVersions !== undefined
      ? cloudDeckVersions
      : namespace.kind === 'user'
        ? createSupabaseCloudDeckVersionRepository()
        : null

  const cloudOrganization =
    cloudDeckOrganization !== undefined
      ? cloudDeckOrganization
      : namespace.kind === 'user'
        ? createSupabaseCloudDeckOrganizationRepository()
        : null

  const rawDecks = createDeckRepository(
    createIndexedDbDeckPersistence(databaseFactory, namespace),
  )
  const organizationTransactions = createIndexedDbDeckOrganizationTransactions(
    databaseFactory,
    namespace,
  )
  const organizationAwareDecks = withDeckOrganizationCascade(
    rawDecks,
    organizationTransactions,
  )
  const localVersions = createDeckVersionRepository(
    createIndexedDbDeckVersionPersistence(databaseFactory, namespace),
  )
  const local = withDeckVersionCascade(organizationAwareDecks, localVersions)

  const folderQueue: OrganizationQueueAccess<string> = {
    read: () => readPendingDeckFolderSync(undefined, namespace),
    record: (folderId, operation) =>
      recordPendingDeckFolderSync(folderId, operation, undefined, namespace),
    clear: (folderId) =>
      clearPendingDeckFolderSync(folderId, undefined, namespace),
  }
  const tagQueue: OrganizationQueueAccess<string> = {
    read: () => readPendingDeckTagSync(undefined, namespace),
    record: (tagId, operation) =>
      recordPendingDeckTagSync(tagId, operation, undefined, namespace),
    clear: (tagId) => clearPendingDeckTagSync(tagId, undefined, namespace),
  }
  const organizationQueue: OrganizationQueueAccess<string> = {
    read: () => readPendingDeckOrganizationSync(undefined, namespace),
    record: (deckId, operation) =>
      recordPendingDeckOrganizationSync(
        deckId,
        operation,
        undefined,
        namespace,
      ),
    clear: (deckId) =>
      clearPendingDeckOrganizationSync(deckId, undefined, namespace),
  }

  // Shared by the three wrappers: once the account answers that it has no such
  // table, none of them keeps asking until the page is loaded again.
  const missingTable = createMissingTableMemo()
  const syncEnabled = () => isCloudSyncEnabled(namespace)
  const noteUpload = () =>
    recordCloudUploadSuccess(undefined, undefined, namespace)

  const localFolders = createDeckFolderRepository(
    createIndexedDbDeckFolderPersistence(databaseFactory, namespace),
    organizationTransactions,
  )
  const localTags = createDeckTagRepository(
    createIndexedDbDeckTagPersistence(databaseFactory, namespace),
    organizationTransactions,
  )
  const localOrganizations = createDeckOrganizationRepository(
    createIndexedDbDeckOrganizationPersistence(databaseFactory, namespace),
  )

  return {
    namespace,
    cloudDecks: cloud,
    cloudDeckVersions: cloudVersions,
    localDecks: local,
    localDeckVersions: localVersions,
    localDeckFolders: localFolders,
    localDeckTags: localTags,
    localDeckOrganizations: localOrganizations,
    cloudDeckOrganization: cloudOrganization,
    /**
     * Wrapped like the decks are: written locally first, sent to the account
     * afterwards, and remembered when the send fails. Folders and tags are sent
     * through a function that refuses to revive one the account has deleted.
     */
    deckFolders: withCloudDeckFolderSync({
      folders: localFolders,
      cloud: cloudOrganization,
      isSyncEnabled: syncEnabled,
      pending: folderQueue,
      missingTable,
      onUploadSuccess: noteUpload,
      // A deck put into a brand new folder can have its organization refused
      // because the folder had not arrived yet. Now it has.
      onFolderUploaded: (folderId) =>
        void retryPendingOrganizationsForFolder({
          folderId,
          organizations: localOrganizations,
          cloud: cloudOrganization,
          isSyncEnabled: syncEnabled,
          pending: organizationQueue,
          onUploadSuccess: noteUpload,
        }),
    }),
    deckTags: withCloudDeckTagSync({
      tags: localTags,
      cloud: cloudOrganization,
      isSyncEnabled: syncEnabled,
      pending: tagQueue,
      missingTable,
      onUploadSuccess: noteUpload,
    }),
    deckOrganizations: withCloudDeckOrganizationSync({
      organizations: localOrganizations,
      cloud: cloudOrganization,
      isSyncEnabled: syncEnabled,
      pending: organizationQueue,
      missingTable,
      onUploadSuccess: noteUpload,
    }),
    /**
     * Wrapped so every save and delete reaches the account, wherever it comes
     * from. The wrapper writes locally first and never rolls that back, so a
     * cloud failure costs the copy rather than the edit.
     *
     * The setting is read on each call rather than captured, so enabling sync
     * takes effect immediately and disabling it stops the next write, without
     * the bundle being rebuilt.
     */
    decks: withCloudDeckSync({
      decks: local,
      // Copying a deck and importing a backup write a deck and its
      // organization together, and go out to the account like any other save.
      organization: organizationTransactions,
      cloudDecks: cloud,
      isSyncEnabled: () => isCloudSyncEnabled(namespace),
      // Namespaced, so one account's unsent changes are never retried for
      // another and never while signed out.
      pending: {
        record: (deckId, operation) =>
          recordPendingDeckSync(deckId, operation, undefined, namespace),
        clear: (deckId) => clearPendingDeckSync(deckId, undefined, namespace),
      },
      // Recorded per account too, so the panel shows this account's last
      // successful send and never another's.
      onUploadSuccess: noteUpload,
      // Organizing a deck the moment it is created sends both without waiting,
      // and the organization can lose the race. The deck is there now, so the
      // one entry it was waiting on is sent rather than left until a reload.
      onDeckUploaded: (deckId) =>
        void retryPendingOrganizationForDeck({
          deckId,
          organizations: localOrganizations,
          cloud: cloudOrganization,
          isSyncEnabled: syncEnabled,
          pending: organizationQueue,
          onUploadSuccess: noteUpload,
        }),
      versionPending: {
        prepareParentDelete: (deckId) =>
          clearPendingDeckVersionSyncForDeck(
            deckId,
            { includeTombstones: false },
            undefined,
            namespace,
          ),
        clearParent: (deckId) => {
          clearPendingDeckVersionSyncForDeck(
            deckId,
            { includeTombstones: true },
            undefined,
            namespace,
          )
        },
      },
    }),
    deckVersions: withCloudDeckVersionSync({
      versions: localVersions,
      cloudVersions,
      isSyncEnabled: () => isCloudSyncEnabled(namespace),
      pending: {
        record: (versionId, operation, deckId) =>
          recordPendingDeckVersionSync(
            versionId,
            { operation, deckId },
            undefined,
            namespace,
          ),
        clear: (versionId) => {
          clearPendingDeckVersionSync(versionId, undefined, namespace)
        },
      },
      onUploadSuccess: () =>
        recordCloudUploadSuccess(undefined, undefined, namespace),
    }),
    favoriteCards: createFavoriteCardRepository(
      createIndexedDbFavoriteCardPersistence(databaseFactory, namespace),
    ),
    savedSearchPresets: createSavedSearchPresetRepository(
      createIndexedDbSavedSearchPresetPersistence(databaseFactory, namespace),
    ),
    tournamentReports: createTournamentReportRepository(
      createIndexedDbTournamentReportPersistence(databaseFactory, namespace),
    ),
    recentlyViewedCards: createRecentlyViewedCardRepository(
      createIndexedDbRecentlyViewedCardPersistence(databaseFactory, namespace),
    ),
  }
}
