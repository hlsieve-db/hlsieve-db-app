import type { DeckId } from '../domain/decks/types'
import type {
  DeckFolder,
  DeckFolderId,
  DeckTagId,
} from '../domain/deckOrganization/types'
import type { DeckFolderRepository } from '../repositories/deckFolderRepository'
import type { DeckOrganizationRepository } from '../repositories/deckOrganizationRepository'
import type { DeckTagRepository } from '../repositories/deckTagRepository'
import type {
  CloudDeckOrganizationFailure,
  CloudDeckOrganizationRepository,
} from './cloudDeckOrganizationRepository'

/**
 * Sending folders, tags and organization to the account, around the local store.
 *
 * Local first and never rolled back, as for decks: a cloud failure costs the
 * copy rather than the edit. The send is not awaited, so organizing a deck is as
 * fast offline as on, and what could not be sent is remembered so a later
 * attempt can finish it.
 *
 * Nothing here reads from the account. Bringing another device's folders down is
 * reconciliation, which is a later phase.
 */

export type PendingOrganizationOperation = 'upsert' | 'tombstone'

export type PendingOrganizationQueue<Key extends string> = {
  record: (key: Key, operation: PendingOrganizationOperation) => void
  clear: (key: Key) => void
}

/** What a send did, for the panel and for the tests. */
export type CloudOrganizationSyncEvent = {
  kind: 'folder' | 'tag' | 'organization'
  id: string
  operation: PendingOrganizationOperation
  ok: boolean
  reason?: CloudDeckOrganizationFailure
}

export type CloudOrganizationSyncOptions = {
  /** Null when Cloud Sync is not configured, or nobody is signed in. */
  cloud: CloudDeckOrganizationRepository | null
  /**
   * Read per call rather than captured, so turning sync on takes effect without
   * rebuilding the repositories, and a stale value cannot keep sending after it
   * is turned off.
   */
  isSyncEnabled: () => boolean
  /** Observability; nothing in the app depends on the outcome. */
  onSyncResult?: (event: CloudOrganizationSyncEvent) => void
  /** Called when a change was accepted by the account. */
  onUploadSuccess?: () => void
}

export type CloudFolderSyncOptions = CloudOrganizationSyncOptions & {
  /**
   * Called with the folder id once the account has accepted it, so an
   * organization that named a folder the account had not seen yet can be sent
   * without waiting for a reload. Same race as a newly created deck.
   */
  onFolderUploaded?: (folderId: DeckFolderId) => void
}

/**
 * Remembers, for this page's lifetime, that the account has no such table yet.
 *
 * Until the migration is applied, every send would come back the same way, so
 * after the first answer the rest are not sent at all: a folder rename should
 * not fire a request that is known to 404. A reload tries again, which is what
 * makes the app start syncing on its own once the table exists.
 */
type MissingTableMemo = { missing: boolean }

function shouldSend(
  options: CloudOrganizationSyncOptions,
  memo: MissingTableMemo,
): boolean {
  return Boolean(options.cloud) && options.isSyncEnabled() && !memo.missing
}

/**
 * True when the account cannot hold this yet, so nothing is queued.
 *
 * Every other failure keeps the change queued, including one this build does not
 * recognise: an unsent write is recoverable, a lost one is not.
 */
function isMissingTable(reason: CloudDeckOrganizationFailure): boolean {
  return reason === 'missing-table'
}

function settle<Key extends string>(
  kind: CloudOrganizationSyncEvent['kind'],
  key: Key,
  operation: PendingOrganizationOperation,
  result: { ok: true } | { ok: false; reason: CloudDeckOrganizationFailure },
  {
    pending,
    options,
    memo,
  }: {
    pending: PendingOrganizationQueue<Key>
    options: CloudOrganizationSyncOptions
    memo: MissingTableMemo
  },
): void {
  if (result.ok) {
    pending.clear(key)
    options.onUploadSuccess?.()
    options.onSyncResult?.({ kind, id: key, operation, ok: true })
    return
  }
  if (isMissingTable(result.reason)) {
    memo.missing = true
    // Not queued and not clearing anything: there is nowhere for this to go
    // until the schema has the table, and the local change is already saved.
    options.onSyncResult?.({
      kind,
      id: key,
      operation,
      ok: false,
      reason: result.reason,
    })
    return
  }
  pending.record(key, operation)
  options.onSyncResult?.({
    kind,
    id: key,
    operation,
    ok: false,
    reason: result.reason,
  })
}

export type CloudSyncedDeckFolderOptions = CloudFolderSyncOptions & {
  folders: DeckFolderRepository
  pending: PendingOrganizationQueue<DeckFolderId>
  /** Shared with the tag and organization wrappers, so one 404 quiets them all. */
  missingTable?: MissingTableMemo
}

export function withCloudDeckFolderSync({
  folders,
  pending,
  missingTable = { missing: false },
  onFolderUploaded,
  ...options
}: CloudSyncedDeckFolderOptions): DeckFolderRepository {
  const cloud = options.cloud

  const push = async (folder: DeckFolder) => {
    if (!cloud) return
    const result = await cloud.upsertFolder(folder)
    if (result.ok && result.value.skippedTombstone) {
      // The account deleted this folder. The device is told nothing: 7B-3C is
      // where the two sides are reconciled. What matters here is that the write
      // is settled rather than retried forever.
      pending.clear(folder.id)
      options.onSyncResult?.({
        kind: 'folder',
        id: folder.id,
        operation: 'upsert',
        ok: true,
      })
      return
    }
    settle('folder', folder.id, 'upsert', result, {
      pending,
      options,
      memo: missingTable,
    })
    if (result.ok) onFolderUploaded?.(folder.id)
  }

  return {
    listFolders: folders.listFolders,
    getFolder: folders.getFolder,

    async saveFolder(folder) {
      await folders.saveFolder(folder)
      if (shouldSend(options, missingTable)) void push(folder)
    },

    async deleteFolder(id, updatedAt) {
      const changed = await folders.deleteFolder(id, updatedAt)
      // The folder is gone locally, so an unsent write for it is no longer an
      // intent the reporter holds: leaving it queued would try to create the
      // folder the account is being told to delete.
      pending.clear(id)
      if (shouldSend(options, missingTable)) {
        void (async () => {
          const result = await cloud?.tombstoneFolder(id)
          if (!result) return
          settle(
            'folder',
            id,
            'tombstone',
            // Nothing matching means the account does not hold the folder,
            // which is the state the tombstone was asking for.
            result.ok || result.reason === 'not-found' ? { ok: true } : result,
            { pending, options, memo: missingTable },
          )
        })()
      }
      return changed
    },

    async saveFolderOrder(order) {
      await folders.saveFolderOrder(order)
      if (!shouldSend(options, missingTable)) return
      // One local transaction, but the account takes them one at a time, so
      // each folder is its own queue entry and one failing does not lose the
      // others.
      void (async () => {
        for (const folder of order) await push(folder)
      })()
    },
  }
}

export type CloudSyncedDeckTagOptions = CloudOrganizationSyncOptions & {
  tags: DeckTagRepository
  pending: PendingOrganizationQueue<DeckTagId>
  missingTable?: MissingTableMemo
}

export function withCloudDeckTagSync({
  tags,
  pending,
  missingTable = { missing: false },
  ...options
}: CloudSyncedDeckTagOptions): DeckTagRepository {
  const cloud = options.cloud

  return {
    listTags: tags.listTags,
    getTag: tags.getTag,

    async saveTag(tag) {
      await tags.saveTag(tag)
      if (!shouldSend(options, missingTable)) return
      void (async () => {
        const result = await cloud?.upsertTag(tag)
        if (!result) return
        if (result.ok && result.value.skippedTombstone) {
          pending.clear(tag.id)
          options.onSyncResult?.({
            kind: 'tag',
            id: tag.id,
            operation: 'upsert',
            ok: true,
          })
          return
        }
        settle('tag', tag.id, 'upsert', result, {
          pending,
          options,
          memo: missingTable,
        })
      })()
    },

    async deleteTag(id, updatedAt) {
      const changed = await tags.deleteTag(id, updatedAt)
      pending.clear(id)
      if (shouldSend(options, missingTable)) {
        void (async () => {
          const result = await cloud?.tombstoneTag(id)
          if (!result) return
          settle(
            'tag',
            id,
            'tombstone',
            result.ok || result.reason === 'not-found' ? { ok: true } : result,
            { pending, options, memo: missingTable },
          )
        })()
      }
      return changed
    },
  }
}

export type CloudSyncedDeckOrganizationOptions =
  CloudOrganizationSyncOptions & {
    organizations: DeckOrganizationRepository
    pending: PendingOrganizationQueue<DeckId>
    missingTable?: MissingTableMemo
  }

export function withCloudDeckOrganizationSync({
  organizations,
  pending,
  missingTable = { missing: false },
  ...options
}: CloudSyncedDeckOrganizationOptions): DeckOrganizationRepository {
  const cloud = options.cloud

  return {
    listOrganizations: organizations.listOrganizations,
    getOrganization: organizations.getOrganization,

    async saveOrganization(organization) {
      await organizations.saveOrganization(organization)
      if (!shouldSend(options, missingTable)) return
      void (async () => {
        const result = await cloud?.upsertOrganization(organization)
        if (!result) return
        settle(
          'organization',
          organization.deckId,
          'upsert',
          result.ok ? { ok: true } : result,
          { pending, options, memo: missingTable },
        )
      })()
    },

    async deleteOrganization(deckId) {
      await organizations.deleteOrganization(deckId)
      pending.clear(deckId)
      if (!shouldSend(options, missingTable)) return
      void (async () => {
        const result = await cloud?.tombstoneOrganization(deckId)
        if (!result) return
        settle(
          'organization',
          deckId,
          'tombstone',
          result.ok || result.reason === 'not-found' ? { ok: true } : result,
          { pending, options, memo: missingTable },
        )
      })()
    },
  }
}

/** Shared between the three wrappers so one answer quiets all of them. */
export function createMissingTableMemo(): MissingTableMemo {
  return { missing: false }
}
