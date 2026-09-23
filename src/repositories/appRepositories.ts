import {
  createSupabaseCloudDeckRepository,
  type CloudDeckRepository,
} from '../cloud/cloudDeckRepository'
import { withCloudDeckSync } from '../cloud/cloudSyncedDeckRepository'
import { isCloudSyncEnabled } from '../domain/cloud/cloudSyncState'
import { recordCloudUploadSuccess } from '../domain/cloud/cloudUploadStatus'
import {
  clearPendingDeckSync,
  recordPendingDeckSync,
} from '../domain/cloud/pendingDeckSync'
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

export type AppRepositories = {
  namespace: LocalDataNamespace
  decks: DeckBackupRepository
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
  /**
   * The deck store without the cloud sync wrapper.
   *
   * Only restoring from the cloud uses it. Writing a restored deck through the
   * wrapped repository would push it straight back to the account it just came
   * from, so the one operation whose writes originate in the cloud bypasses the
   * upload. Everything else in the app should use `decks`.
   */
  localDecks: DeckBackupRepository
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
): AppRepositories {
  // An anonymous visitor has no account to sync with, so there is nothing to
  // build even where Supabase is configured.
  const cloud =
    cloudDecks !== undefined
      ? cloudDecks
      : namespace.kind === 'user'
        ? createSupabaseCloudDeckRepository()
        : null

  const local = createDeckRepository(
    createIndexedDbDeckPersistence(databaseFactory, namespace),
  )

  return {
    namespace,
    cloudDecks: cloud,
    localDecks: local,
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
