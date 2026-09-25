export const DEFAULT_DECK_NAME = '無題のデッキ'
export const DECK_NAME_MAX_LENGTH = 100

export const LOCAL_STORAGE_SETTINGS_KEY = 'holocard:settings'

export const DB_NAME = 'holocard-db'
export const DB_VERSION = 6
export const STORE_DECKS = 'decks'
export const STORE_TOURNAMENT_REPORTS = 'tournament-reports'
export const STORE_FAVORITE_CARDS = 'favorite-cards'
export const STORE_SAVED_SEARCH_PRESETS = 'saved-search-presets'
export const STORE_RECENTLY_VIEWED_CARDS = 'recently-viewed-cards'
/**
 * Manual deck snapshots, kept beside the decks rather than inside them.
 *
 * No index on the deck id: a device holds tens of decks, reading the store
 * and filtering costs nothing at that size, and an index is a schema change
 * that can be added later if the scale ever changes.
 */
export const STORE_DECK_VERSIONS = 'deck-versions'
