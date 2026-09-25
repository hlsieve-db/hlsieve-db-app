import { deckContentEquals } from '../domain/decks/deckContent'
import {
  clearPendingDeckVersionSync,
  readPendingDeckVersionSync,
} from '../domain/cloud/pendingDeckVersionSync'
import type { LocalDataNamespace } from '../domain/storage/localDataNamespace'
import type { DeckBackupRepository } from '../repositories/deckRepository'
import type { DeckVersionRepository } from '../repositories/deckVersionRepository'
import type { CloudDeckRepository } from './cloudDeckRepository'
import type {
  CloudDeckVersionFailure,
  CloudDeckVersionRepository,
} from './cloudDeckVersionRepository'

export type PendingDeckVersionSyncRetryResult =
  | { ok: true; completed: number; remaining: number }
  | {
      ok: false
      reason: CloudDeckVersionFailure
      completed: number
      remaining: number
    }

export type PendingDeckVersionSyncRetryOptions = {
  decks: Pick<DeckBackupRepository, 'getDeck'>
  versions: Pick<DeckVersionRepository, 'getVersion' | 'deleteVersion'>
  cloudDecks: CloudDeckRepository | null
  cloudVersions: CloudDeckVersionRepository | null
  isSyncEnabled: () => boolean
  namespace?: LocalDataNamespace
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  onUploadSuccess?: () => void
}

export async function retryPendingDeckVersionSync({
  decks,
  versions,
  cloudDecks,
  cloudVersions,
  isSyncEnabled,
  namespace,
  storage,
  onUploadSuccess,
}: PendingDeckVersionSyncRetryOptions): Promise<PendingDeckVersionSyncRetryResult> {
  if (!cloudDecks || !cloudVersions || !isSyncEnabled()) {
    return { ok: true, completed: 0, remaining: 0 }
  }

  const store = storage ?? window.localStorage
  const queue = readPendingDeckVersionSync(store, namespace)
  const entries = Object.entries(queue).sort(
    ([leftId, left], [rightId, right]) => {
      if (left.operation !== right.operation) {
        return left.operation === 'tombstone' ? -1 : 1
      }
      return leftId.localeCompare(rightId, 'en')
    },
  )
  let completed = 0

  for (const [versionId, entry] of entries) {
    if (entry.operation !== 'tombstone') continue
    const result = await cloudVersions.tombstone(versionId)
    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason,
        completed,
        remaining: entries.length - completed,
      }
    }
    clearPendingDeckVersionSync(versionId, store, namespace)
    if (result.value.mutated) onUploadSuccess?.()
    completed += 1
  }

  const uploads = entries.filter(([, entry]) => entry.operation === 'upload')
  if (uploads.length === 0) return { ok: true, completed, remaining: 0 }

  const cloudParents = await cloudDecks.listAll()
  if (!cloudParents.ok) {
    return {
      ok: false,
      reason: cloudParents.reason,
      completed,
      remaining: entries.length - completed,
    }
  }
  const parentById = new Map(cloudParents.value.map((row) => [row.id, row]))

  for (const [versionId, entry] of uploads) {
    const version = await versions.getVersion(versionId)
    if (!version) {
      clearPendingDeckVersionSync(versionId, store, namespace)
      completed += 1
      continue
    }
    const localParent = await decks.getDeck(entry.deckId)
    if (!localParent) {
      clearPendingDeckVersionSync(versionId, store, namespace)
      completed += 1
      continue
    }
    const cloudParent = parentById.get(entry.deckId)
    if (
      !cloudParent ||
      cloudParent.deletedAt !== null ||
      !deckContentEquals(localParent, cloudParent.deck)
    ) {
      // Parent missing, deleted or conflicting: keep the intent, but never send
      // the child before the parent is resolved.
      continue
    }

    const result = await cloudVersions.insert(version)
    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason,
        completed,
        remaining: entries.length - completed,
      }
    }
    clearPendingDeckVersionSync(versionId, store, namespace)
    if (result.value.record?.deletedAt) {
      await versions.deleteVersion(versionId)
    }
    if (result.value.mutated) onUploadSuccess?.()
    completed += 1
  }

  return { ok: true, completed, remaining: entries.length - completed }
}
