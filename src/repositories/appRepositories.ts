import {
  createSupabaseCloudDeckRepository,
  type CloudDeckRepository,
} from '../cloud/cloudDeckRepository'
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
  return {
    namespace,
    // An anonymous visitor has no account to sync with, so there is nothing to
    // build even where Supabase is configured.
    cloudDecks:
      cloudDecks !== undefined
        ? cloudDecks
        : namespace.kind === 'user'
          ? createSupabaseCloudDeckRepository()
          : null,
    decks: createDeckRepository(
      createIndexedDbDeckPersistence(databaseFactory, namespace),
    ),
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
