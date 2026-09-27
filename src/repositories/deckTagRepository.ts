import { STORE_DECK_TAGS } from '../domain/decks/constants'
import type { LocalDataNamespace } from '../domain/storage/localDataNamespace'
import type { DeckTag, DeckTagId } from '../domain/deckOrganization/types'
import {
  isDeckTag,
  normalizeOrganizationNameForComparison,
} from '../domain/deckOrganization/validation'
import {
  createIndexedDbStorePersistence,
  type IndexedDbStorePersistence,
} from './appDatabase'
import type { DeckOrganizationTransactions } from './deckOrganizationTransactions'

export type DeckTagRepository = {
  listTags: () => Promise<DeckTag[]>
  getTag: (id: DeckTagId) => Promise<DeckTag | undefined>
  saveTag: (tag: DeckTag) => Promise<void>
  /**
   * Removes the tag and takes it off every deck carrying it, in one
   * transaction, and reports how many decks that was. The decks themselves stay.
   *
   * There is no way to remove only the definition: a deck carrying a tag that
   * no longer exists is a state nothing else in the app can describe.
   */
  deleteTag: (id: DeckTagId, updatedAt?: string) => Promise<number>
}

export type DeckTagPersistence = IndexedDbStorePersistence<DeckTag> & {
  addMany: (values: readonly DeckTag[]) => Promise<void>
}

function assertTag(value: unknown): DeckTag {
  if (!isDeckTag(value)) throw new Error('Stored tag has an invalid shape.')
  return value
}

export function createDeckTagRepository(
  persistence: DeckTagPersistence,
  transactions: Pick<DeckOrganizationTransactions, 'deleteTag'>,
): DeckTagRepository {
  return {
    async listTags() {
      return (await persistence.getAll())
        .map(assertTag)
        .sort(
          (left, right) =>
            normalizeOrganizationNameForComparison(left.name).localeCompare(
              normalizeOrganizationNameForComparison(right.name),
            ) || left.id.localeCompare(right.id),
        )
    },
    async getTag(id) {
      const value = await persistence.get(id)
      return value === undefined ? undefined : assertTag(value)
    },
    async saveTag(tag) {
      if (!isDeckTag(tag)) throw new Error('Tag has an invalid shape.')
      await persistence.put(tag)
    },
    async deleteTag(id, updatedAt) {
      return transactions.deleteTag(id, updatedAt)
    },
  }
}

export function createIndexedDbDeckTagPersistence(
  databaseFactory?: IDBFactory,
  namespace?: LocalDataNamespace,
): DeckTagPersistence {
  return createIndexedDbStorePersistence(
    STORE_DECK_TAGS,
    databaseFactory,
    namespace,
  )
}
