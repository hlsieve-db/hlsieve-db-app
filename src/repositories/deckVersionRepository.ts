import { STORE_DECK_VERSIONS } from '../domain/decks/constants'
import type { Deck, DeckId } from '../domain/decks/types'
import {
  DECK_VERSION_LABEL_MAX_LENGTH,
  isDeckVersion,
  toDeckVersionSnapshot,
  type DeckVersion,
  type DeckVersionId,
} from '../domain/deckVersions/types'
import type { LocalDataNamespace } from '../domain/storage/localDataNamespace'
import { formatDateTime } from '../utils/formatDateTime'
import {
  createIndexedDbStorePersistence,
  type IndexedDbStorePersistence,
} from './appDatabase'

/**
 * The deck snapshots this device holds.
 *
 * Kept in their own store, so saving a deck does not rewrite its history and
 * removing one snapshot does not touch the rest. Reading filters the whole
 * store by deck: there are tens of decks, not thousands, and an index would be
 * a schema change bought before it is needed.
 */

export type DeckVersionPersistenceAdapter = Omit<
  IndexedDbStorePersistence<DeckVersion>,
  'addMany'
>

export type DeckVersionRepository = {
  listVersions: (deckId: DeckId) => Promise<DeckVersion[]>
  getVersion: (id: DeckVersionId) => Promise<DeckVersion | undefined>
  createVersion: (deck: Deck, label?: string) => Promise<DeckVersion>
  deleteVersion: (id: DeckVersionId) => Promise<void>
  deleteVersionsForDeck: (deckId: DeckId) => Promise<void>
}

/** Newest first: the reason to open this list is usually the last save. */
function compareVersions(left: DeckVersion, right: DeckVersion): number {
  return (
    right.createdAt.localeCompare(left.createdAt) ||
    right.id.localeCompare(left.id, 'en')
  )
}

function resolveLabel(label: string | undefined, createdAt: string): string {
  const trimmed = (label ?? '').trim()
  // The moment it was kept is the one thing always worth saying, so an unnamed
  // snapshot is named after it rather than being called untitled.
  if (!trimmed) return formatDateTime(createdAt)
  if (trimmed.length > DECK_VERSION_LABEL_MAX_LENGTH) {
    throw new Error('Deck version label is too long.')
  }
  return trimmed
}

export function createDeckVersionRepository(
  persistence: DeckVersionPersistenceAdapter,
  options: { id?: () => string; now?: () => string } = {},
): DeckVersionRepository {
  const newId = options.id ?? (() => crypto.randomUUID())
  const now = options.now ?? (() => new Date().toISOString())

  const all = async (): Promise<DeckVersion[]> =>
    (await persistence.getAll()).filter(isDeckVersion)

  return {
    async listVersions(deckId) {
      return (await all())
        .filter((version) => version.deckId === deckId)
        .sort(compareVersions)
    },

    async getVersion(id) {
      const value = await persistence.get(id)
      return isDeckVersion(value) ? value : undefined
    },

    async createVersion(deck, label) {
      const createdAt = now()
      const version: DeckVersion = {
        id: newId(),
        deckId: deck.id,
        label: resolveLabel(label, createdAt),
        createdAt,
        snapshot: toDeckVersionSnapshot(deck),
      }
      await persistence.put(version)
      return version
    },

    async deleteVersion(id) {
      await persistence.delete(id)
    },

    async deleteVersionsForDeck(deckId) {
      // Deleting a deck takes its snapshots with it: they restore into that
      // deck and nothing else, so leaving them would leave records nobody can
      // reach. Only this deck's are touched.
      const owned = (await all()).filter((version) => version.deckId === deckId)
      for (const version of owned) await persistence.delete(version.id)
    },
  }
}

export function createIndexedDbDeckVersionPersistence(
  databaseFactory?: IDBFactory,
  namespace?: LocalDataNamespace,
): DeckVersionPersistenceAdapter {
  return createIndexedDbStorePersistence<DeckVersion>(
    STORE_DECK_VERSIONS,
    databaseFactory,
    namespace,
  )
}
