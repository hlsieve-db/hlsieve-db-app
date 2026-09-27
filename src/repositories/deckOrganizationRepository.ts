import { STORE_DECK_ORGANIZATIONS } from '../domain/decks/constants'
import type { DeckId } from '../domain/decks/types'
import type { LocalDataNamespace } from '../domain/storage/localDataNamespace'
import type { DeckOrganization } from '../domain/deckOrganization/types'
import { isDeckOrganization } from '../domain/deckOrganization/validation'
import {
  createIndexedDbStorePersistence,
  type IndexedDbStorePersistence,
} from './appDatabase'

export type DeckOrganizationRepository = {
  listOrganizations: () => Promise<DeckOrganization[]>
  getOrganization: (deckId: DeckId) => Promise<DeckOrganization | undefined>
  saveOrganization: (organization: DeckOrganization) => Promise<void>
  deleteOrganization: (deckId: DeckId) => Promise<void>
}

export type DeckOrganizationPersistence =
  IndexedDbStorePersistence<DeckOrganization> & {
    addMany: (values: readonly DeckOrganization[]) => Promise<void>
  }

function assertOrganization(value: unknown): DeckOrganization {
  if (!isDeckOrganization(value)) {
    throw new Error('Stored deck organization has an invalid shape.')
  }
  return value
}

export function createDeckOrganizationRepository(
  persistence: DeckOrganizationPersistence,
): DeckOrganizationRepository {
  return {
    async listOrganizations() {
      return (await persistence.getAll())
        .map(assertOrganization)
        .sort((left, right) => left.deckId.localeCompare(right.deckId))
    },
    async getOrganization(deckId) {
      const value = await persistence.get(deckId)
      return value === undefined ? undefined : assertOrganization(value)
    },
    async saveOrganization(organization) {
      if (!isDeckOrganization(organization)) {
        throw new Error('Deck organization has an invalid shape.')
      }
      await persistence.put(organization)
    },
    async deleteOrganization(deckId) {
      await persistence.delete(deckId)
    },
  }
}

export function createIndexedDbDeckOrganizationPersistence(
  databaseFactory?: IDBFactory,
  namespace?: LocalDataNamespace,
): DeckOrganizationPersistence {
  return createIndexedDbStorePersistence(
    STORE_DECK_ORGANIZATIONS,
    databaseFactory,
    namespace,
  )
}
