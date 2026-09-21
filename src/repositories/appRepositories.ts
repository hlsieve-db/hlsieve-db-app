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
}

/**
 * Every browser-local store for one account, built together so a switch
 * cannot leave one of them pointing at the previous namespace.
 */
export function createAppRepositories(
  namespace: LocalDataNamespace = ANONYMOUS_LOCAL_DATA_NAMESPACE,
  databaseFactory?: IDBFactory,
): AppRepositories {
  return {
    namespace,
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
