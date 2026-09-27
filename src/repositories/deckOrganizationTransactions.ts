import {
  STORE_DECK_FOLDERS,
  STORE_DECK_ORGANIZATIONS,
  STORE_DECK_TAGS,
  STORE_DECKS,
} from '../domain/decks/constants'
import type { Deck } from '../domain/decks/types'
import type { LocalDataNamespace } from '../domain/storage/localDataNamespace'
import type {
  DeckFolder,
  DeckOrganization,
  DeckTag,
} from '../domain/deckOrganization/types'
import {
  canonicalizeTagIds,
  isDeckFolder,
  isDeckOrganization,
  isDeckTag,
} from '../domain/deckOrganization/validation'
import { isDeck } from '../domain/decks/validation'
import { openAppDatabase } from './appDatabase'

export type DeckOrganizationImport = {
  decks: readonly Deck[]
  folders: readonly DeckFolder[]
  tags: readonly DeckTag[]
  organizations: readonly DeckOrganization[]
}

export type DeckOrganizationTransactions = {
  deleteFolder: (folderId: string, updatedAt?: string) => Promise<number>
  deleteTag: (tagId: string, updatedAt?: string) => Promise<number>
  deleteDeck: (deckId: string) => Promise<void>
  saveFolderOrder: (folders: readonly DeckFolder[]) => Promise<void>
  duplicateDeck: (deck: Deck, organization?: DeckOrganization) => Promise<void>
  importAll: (values: DeckOrganizationImport) => Promise<void>
}

function completeTransaction<T>(
  transaction: IDBTransaction,
  initial: T,
  enqueue: (setResult: (value: T) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let result = initial
    const fail = () =>
      reject(transaction.error ?? new Error('Organization transaction failed.'))
    transaction.oncomplete = () => resolve(result)
    transaction.onerror = fail
    transaction.onabort = fail
    try {
      enqueue((value) => {
        result = value
      })
    } catch (error) {
      transaction.abort()
      reject(error)
    }
  })
}

function assertImport(values: DeckOrganizationImport): void {
  if (!values.decks.every(isDeck)) throw new Error('Invalid deck import.')
  if (!values.folders.every(isDeckFolder))
    throw new Error('Invalid folder import.')
  if (!values.tags.every(isDeckTag)) throw new Error('Invalid tag import.')
  if (!values.organizations.every(isDeckOrganization)) {
    throw new Error('Invalid organization import.')
  }
}

export function createIndexedDbDeckOrganizationTransactions(
  databaseFactory?: IDBFactory,
  namespace?: LocalDataNamespace,
): DeckOrganizationTransactions {
  let databasePromise: Promise<IDBDatabase> | undefined
  const database = () => {
    if (!databasePromise) {
      const factory = databaseFactory ?? globalThis.indexedDB
      if (!factory)
        return Promise.reject(new Error('IndexedDB is not available.'))
      databasePromise = openAppDatabase(factory, namespace)
      void databasePromise.catch(() => {
        databasePromise = undefined
      })
    }
    return databasePromise
  }

  return {
    async deleteFolder(folderId, updatedAt = new Date().toISOString()) {
      const transaction = (await database()).transaction(
        [STORE_DECK_FOLDERS, STORE_DECK_ORGANIZATIONS],
        'readwrite',
      )
      return completeTransaction(transaction, 0, (setResult) => {
        transaction.objectStore(STORE_DECK_FOLDERS).delete(folderId)
        const request = transaction
          .objectStore(STORE_DECK_ORGANIZATIONS)
          .getAll() as IDBRequest<unknown[]>
        request.onsuccess = () => {
          let changed = 0
          for (const value of request.result) {
            if (!isDeckOrganization(value) || value.folderId !== folderId)
              continue
            const organization = { ...value, updatedAt }
            // The folder is gone, so the deck belongs to no folder rather than
            // to a folder that no longer exists.
            delete organization.folderId
            transaction.objectStore(STORE_DECK_ORGANIZATIONS).put(organization)
            changed += 1
          }
          setResult(changed)
        }
      })
    },

    async deleteTag(tagId, updatedAt = new Date().toISOString()) {
      const transaction = (await database()).transaction(
        [STORE_DECK_TAGS, STORE_DECK_ORGANIZATIONS],
        'readwrite',
      )
      return completeTransaction(transaction, 0, (setResult) => {
        transaction.objectStore(STORE_DECK_TAGS).delete(tagId)
        const request = transaction
          .objectStore(STORE_DECK_ORGANIZATIONS)
          .getAll() as IDBRequest<unknown[]>
        request.onsuccess = () => {
          let changed = 0
          for (const value of request.result) {
            if (!isDeckOrganization(value) || !value.tagIds.includes(tagId))
              continue
            transaction.objectStore(STORE_DECK_ORGANIZATIONS).put({
              ...value,
              tagIds: canonicalizeTagIds(
                value.tagIds.filter((candidate) => candidate !== tagId),
              ),
              updatedAt,
            })
            changed += 1
          }
          setResult(changed)
        }
      })
    },

    async deleteDeck(deckId) {
      const transaction = (await database()).transaction(
        [STORE_DECKS, STORE_DECK_ORGANIZATIONS],
        'readwrite',
      )
      await completeTransaction(transaction, undefined, () => {
        transaction.objectStore(STORE_DECKS).delete(deckId)
        transaction.objectStore(STORE_DECK_ORGANIZATIONS).delete(deckId)
      })
    },

    async saveFolderOrder(folders) {
      if (!folders.every(isDeckFolder)) throw new Error('Invalid folder order.')
      const transaction = (await database()).transaction(
        STORE_DECK_FOLDERS,
        'readwrite',
      )
      await completeTransaction(transaction, undefined, () => {
        const store = transaction.objectStore(STORE_DECK_FOLDERS)
        for (const folder of folders) store.put(folder)
      })
    },

    async duplicateDeck(deck, organization) {
      if (
        !isDeck(deck) ||
        (organization && !isDeckOrganization(organization))
      ) {
        throw new Error('Invalid deck duplication.')
      }
      if (organization && organization.deckId !== deck.id) {
        throw new Error('The organization belongs to another deck.')
      }
      const transaction = (await database()).transaction(
        [STORE_DECKS, STORE_DECK_ORGANIZATIONS],
        'readwrite',
      )
      await completeTransaction(transaction, undefined, () => {
        transaction.objectStore(STORE_DECKS).add(deck)
        if (organization) {
          transaction.objectStore(STORE_DECK_ORGANIZATIONS).add(organization)
        }
      })
    },

    async importAll(values) {
      assertImport(values)
      const transaction = (await database()).transaction(
        [
          STORE_DECKS,
          STORE_DECK_FOLDERS,
          STORE_DECK_TAGS,
          STORE_DECK_ORGANIZATIONS,
        ],
        'readwrite',
      )
      await completeTransaction(transaction, undefined, () => {
        const decks = transaction.objectStore(STORE_DECKS)
        const folders = transaction.objectStore(STORE_DECK_FOLDERS)
        const tags = transaction.objectStore(STORE_DECK_TAGS)
        const organizations = transaction.objectStore(STORE_DECK_ORGANIZATIONS)
        for (const deck of values.decks) decks.add(deck)
        for (const folder of values.folders) folders.add(folder)
        for (const tag of values.tags) tags.add(tag)
        for (const organization of values.organizations) {
          organizations.add(organization)
        }
      })
    },
  }
}
