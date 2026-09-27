import type { DeckId } from '../domain/decks/types'
import type { DeckFolderId, DeckTagId } from '../domain/deckOrganization/types'
import type { DeckFolderRepository } from '../repositories/deckFolderRepository'
import type { DeckOrganizationRepository } from '../repositories/deckOrganizationRepository'
import type { DeckTagRepository } from '../repositories/deckTagRepository'
import type {
  CloudDeckOrganizationFailure,
  CloudDeckOrganizationRepository,
} from './cloudDeckOrganizationRepository'
import type {
  PendingOrganizationOperation,
  PendingOrganizationQueue,
} from './cloudSyncedDeckOrganizationRepositories'

/**
 * Sending the folder, tag and organization changes that could not reach the
 * account when they were made.
 *
 * Definitions go first and organization last, because an organization row names
 * a folder the account has to know about already: the table has a foreign key to
 * it, and to the deck. Sending them the other way round would be refused for a
 * reason the reporter cannot act on.
 *
 * This is not a sync. It never reads the account looking for differences and
 * never touches anything the reporter did not change, so signing in on a new
 * device cannot cause an upload.
 */

export type PendingOrganizationRetryResult = {
  ok: boolean
  completed: number
  remaining: number
  reason?: CloudDeckOrganizationFailure
  /**
   * True when the account has no such table yet. Not a failure: there is
   * nothing to send until the migration is applied, and the caller carries on
   * with the next kind rather than stopping.
   */
  missingTable?: boolean
}

export type PendingOrganizationQueueAccess<Key extends string> =
  PendingOrganizationQueue<Key> & {
    read: () => Record<Key, PendingOrganizationOperation>
  }

export type PendingDeckOrganizationRetryOptions = {
  /**
   * The unwrapped local stores. Reading is all that happens here, but going
   * through the wrapped ones would risk a retry triggering another send.
   */
  folders: Pick<DeckFolderRepository, 'getFolder'>
  tags: Pick<DeckTagRepository, 'getTag'>
  organizations: Pick<DeckOrganizationRepository, 'getOrganization'>
  cloud: CloudDeckOrganizationRepository | null
  /**
   * Read at the moment of the retry. An account that never turned sync on has
   * nothing to send, and one that turned it off should stop.
   */
  isSyncEnabled: () => boolean
  pending: {
    folders: PendingOrganizationQueueAccess<DeckFolderId>
    tags: PendingOrganizationQueueAccess<DeckTagId>
    organizations: PendingOrganizationQueueAccess<DeckId>
  }
  /**
   * Called each time an entry actually reached the account, so a run that sends
   * some entries and then fails still records that this device got something up.
   * Not called for an entry resolved without sending: a tombstone the account
   * never had, an upsert whose subject is gone, or a definition the account
   * holds as a tombstone.
   */
  onUploadSuccess?: () => void
  /**
   * Which queues this run is for.
   *
   * The definitions and the decks have no order between them, so a caller runs
   * them independently and neither one's failure holds the other up. Only the
   * organization rows have to wait, because each names a folder and a deck the
   * account must already hold.
   */
  only?: 'definitions' | 'organizations'
}

const nothingToDo: PendingOrganizationRetryResult = {
  ok: true,
  completed: 0,
  remaining: 0,
}

type Settled = 'sent' | 'resolved' | { failure: CloudDeckOrganizationFailure }

async function drain<Key extends string>(
  queue: PendingOrganizationQueueAccess<Key>,
  send: (key: Key, operation: PendingOrganizationOperation) => Promise<Settled>,
  onUploadSuccess?: () => void,
): Promise<PendingOrganizationRetryResult> {
  const entries = Object.entries(queue.read()) as [
    Key,
    PendingOrganizationOperation,
  ][]
  if (entries.length === 0) return nothingToDo

  let completed = 0
  for (const [key, operation] of entries) {
    const settled = await send(key, operation)
    if (typeof settled !== 'string') {
      if (settled.failure === 'missing-table') {
        // Nothing in this queue can be sent until the table exists. The entries
        // stay, and the caller moves on to the next kind rather than treating
        // the whole attempt as failed.
        return {
          ok: true,
          completed,
          remaining: entries.length - completed,
          missingTable: true,
        }
      }
      // Stopping rather than carrying on, as the deck retry does: the usual
      // causes are being offline or holding a stale session, which affect every
      // entry, so continuing would fire the rest at a server that has just
      // refused.
      return {
        ok: false,
        reason: settled.failure,
        completed,
        remaining: entries.length - completed,
      }
    }
    if (settled === 'sent') onUploadSuccess?.()
    queue.clear(key)
    completed += 1
  }
  return { ok: true, completed, remaining: 0 }
}

export async function retryPendingDeckOrganizationSync({
  folders,
  tags,
  organizations,
  cloud,
  isSyncEnabled,
  pending,
  onUploadSuccess,
  only,
}: PendingDeckOrganizationRetryOptions): Promise<PendingOrganizationRetryResult> {
  if (!cloud || !isSyncEnabled()) return nothingToDo

  if (only === 'organizations') {
    return drain(
      pending.organizations,
      async (deckId, operation) =>
        sendOrganization({ deckId, operation }, { cloud, organizations }),
      onUploadSuccess,
    )
  }

  const folderResult = await drain(
    pending.folders,
    async (folderId, operation) => {
      if (operation === 'tombstone') {
        const result = await cloud.tombstoneFolder(folderId)
        // Nothing matching means the account does not hold the folder, which is
        // the state the tombstone was asking for.
        if (!result.ok && result.reason !== 'not-found') {
          return { failure: result.reason }
        }
        return result.ok ? 'sent' : 'resolved'
      }
      const folder = await folders.getFolder(folderId)
      // An upsert is pending for a folder this device no longer has. It is not
      // turned into a tombstone: that would delete from the account on a guess.
      if (!folder) return 'resolved'
      const result = await cloud.upsertFolder(folder)
      if (!result.ok) return { failure: result.reason }
      // A deleted definition stays deleted, so this entry is settled rather
      // than retried for as long as the account keeps the tombstone.
      return result.value.written ? 'sent' : 'resolved'
    },
    onUploadSuccess,
  )
  if (!folderResult.ok) return folderResult

  const tagResult = await drain(
    pending.tags,
    async (tagId, operation) => {
      if (operation === 'tombstone') {
        const result = await cloud.tombstoneTag(tagId)
        if (!result.ok && result.reason !== 'not-found') {
          return { failure: result.reason }
        }
        return result.ok ? 'sent' : 'resolved'
      }
      const tag = await tags.getTag(tagId)
      if (!tag) return 'resolved'
      const result = await cloud.upsertTag(tag)
      if (!result.ok) return { failure: result.reason }
      return result.value.written ? 'sent' : 'resolved'
    },
    onUploadSuccess,
  )
  if (!tagResult.ok) return tagResult

  if (only === 'definitions') {
    return {
      ok: true,
      completed: folderResult.completed + tagResult.completed,
      remaining: folderResult.remaining + tagResult.remaining,
      ...(folderResult.missingTable || tagResult.missingTable
        ? { missingTable: true }
        : {}),
    }
  }

  const organizationResult = await drain(
    pending.organizations,
    async (deckId, operation) =>
      sendOrganization({ deckId, operation }, { cloud, organizations }),
    onUploadSuccess,
  )

  const completed =
    folderResult.completed + tagResult.completed + organizationResult.completed
  const remaining =
    folderResult.remaining + tagResult.remaining + organizationResult.remaining
  return {
    ok: organizationResult.ok,
    completed,
    remaining,
    ...(organizationResult.reason ? { reason: organizationResult.reason } : {}),
    ...(folderResult.missingTable ||
    tagResult.missingTable ||
    organizationResult.missingTable
      ? { missingTable: true }
      : {}),
  }
}

async function sendOrganization(
  {
    deckId,
    operation,
  }: { deckId: DeckId; operation: PendingOrganizationOperation },
  {
    cloud,
    organizations,
  }: {
    cloud: CloudDeckOrganizationRepository
    organizations: Pick<DeckOrganizationRepository, 'getOrganization'>
  },
): Promise<Settled> {
  if (operation === 'tombstone') {
    const result = await cloud.tombstoneOrganization(deckId)
    if (!result.ok && result.reason !== 'not-found') {
      return { failure: result.reason }
    }
    return result.ok ? 'sent' : 'resolved'
  }
  const organization = await organizations.getOrganization(deckId)
  if (!organization) return 'resolved'
  const result = await cloud.upsertOrganization(organization)
  return result.ok ? 'sent' : { failure: result.reason }
}

export type RetryOrganizationForDeckOptions = {
  deckId: DeckId
  organizations: Pick<DeckOrganizationRepository, 'getOrganization'>
  cloud: CloudDeckOrganizationRepository | null
  isSyncEnabled: () => boolean
  pending: PendingOrganizationQueueAccess<DeckId>
  onUploadSuccess?: () => void
}

/**
 * Sends one deck's organization again, right after that deck reached the account.
 *
 * Organizing a deck the moment it is created loses a race: both writes go out
 * without waiting, and the organization can arrive before the deck it points at,
 * which the foreign key refuses. Waiting for the deck would mean awaiting a send
 * the app deliberately does not await, so the failure is expected and this is
 * what clears it — a single attempt at the one entry the deck just unblocked,
 * rather than leaving it until the next reload or the browser coming back online.
 */
export async function retryPendingOrganizationForDeck({
  deckId,
  organizations,
  cloud,
  isSyncEnabled,
  pending,
  onUploadSuccess,
}: RetryOrganizationForDeckOptions): Promise<void> {
  if (!cloud || !isSyncEnabled()) return
  const operation = pending.read()[deckId]
  if (!operation) return
  const settled = await sendOrganization(
    { deckId, operation },
    { cloud, organizations },
  )
  if (typeof settled !== 'string') return
  if (settled === 'sent') onUploadSuccess?.()
  pending.clear(deckId)
}

export type RetryOrganizationsForFolderOptions = {
  folderId: DeckFolderId
  /** Listing is needed to find which decks name this folder. */
  organizations: Pick<
    DeckOrganizationRepository,
    'getOrganization' | 'listOrganizations'
  >
  cloud: CloudDeckOrganizationRepository | null
  isSyncEnabled: () => boolean
  pending: PendingOrganizationQueueAccess<DeckId>
  onUploadSuccess?: () => void
}

/**
 * The same idea for a folder: a deck put into a brand new folder can have its
 * organization refused because the folder had not arrived yet, so once the
 * folder is accepted the entries that named it are tried once more.
 *
 * Only entries that are actually queued are touched, and only those whose local
 * row names this folder, so an unrelated outstanding change is left for the
 * ordinary retry.
 */
export async function retryPendingOrganizationsForFolder({
  folderId,
  organizations,
  cloud,
  isSyncEnabled,
  pending,
  onUploadSuccess,
}: RetryOrganizationsForFolderOptions): Promise<void> {
  if (!cloud || !isSyncEnabled()) return
  const queued = pending.read()
  if (Object.keys(queued).length === 0) return

  const local = await organizations.listOrganizations()
  const naming = local
    .filter((organization) => organization.folderId === folderId)
    .map((organization) => organization.deckId)

  for (const deckId of naming) {
    const operation = queued[deckId]
    if (operation !== 'upsert') continue
    const settled = await sendOrganization(
      { deckId, operation },
      { cloud, organizations },
    )
    if (typeof settled !== 'string') return
    if (settled === 'sent') onUploadSuccess?.()
    pending.clear(deckId)
  }
}
