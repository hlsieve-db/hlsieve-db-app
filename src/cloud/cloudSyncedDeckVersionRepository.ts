import type { DeckId } from '../domain/decks/types'
import type { DeckVersionId } from '../domain/deckVersions/types'
import type { DeckVersionRepository } from '../repositories/deckVersionRepository'
import type { CloudDeckVersionRepository } from './cloudDeckVersionRepository'

export type CloudSyncedDeckVersionRepositoryOptions = {
  versions: DeckVersionRepository
  cloudVersions: CloudDeckVersionRepository | null
  isSyncEnabled: () => boolean
  pending: {
    record: (
      versionId: DeckVersionId,
      operation: 'upload' | 'tombstone',
      deckId: DeckId,
    ) => boolean
    clear: (versionId: DeckVersionId) => void
  }
  onUploadSuccess?: () => void
}

/**
 * Adds immutable cloud behavior to the local Version store.
 *
 * Delete is deliberately write-ahead: losing the localStorage intent aborts
 * before IndexedDB is touched, so closing the browser cannot resurrect a
 * Version whose deletion was only remembered in memory.
 */
export function withCloudDeckVersionSync({
  versions,
  cloudVersions,
  isSyncEnabled,
  pending,
  onUploadSuccess,
}: CloudSyncedDeckVersionRepositoryOptions): DeckVersionRepository {
  const shouldSync = () => Boolean(cloudVersions) && isSyncEnabled()

  return {
    listAllVersions: versions.listAllVersions,
    listVersions: versions.listVersions,
    getVersion: versions.getVersion,
    saveVersion: versions.saveVersion,

    async createVersion(deck, label) {
      const version = await versions.createVersion(deck, label)
      if (!shouldSync() || !cloudVersions) return version

      const result = await cloudVersions.insert(version)
      if (!result.ok) {
        pending.record(version.id, 'upload', version.deckId)
        return version
      }

      const { record, mutated } = result.value
      if (record?.deletedAt !== null && record?.deletedAt !== undefined) {
        // A terminal tombstone wins even if this device independently created
        // the same immutable id.
        await versions.deleteVersion(version.id)
      }
      pending.clear(version.id)
      if (mutated) onUploadSuccess?.()
      return version
    },

    async deleteVersion(id) {
      const version = await versions.getVersion(id)
      if (!version || !shouldSync() || !cloudVersions) {
        await versions.deleteVersion(id)
        return
      }

      if (!pending.record(id, 'tombstone', version.deckId)) {
        throw new Error('Could not preserve the Version deletion intent.')
      }

      await versions.deleteVersion(id)
      const result = await cloudVersions.tombstone(id)
      if (!result.ok) return
      pending.clear(id)
      if (result.value.mutated) onUploadSuccess?.()
    },

    deleteVersionsForDeck: versions.deleteVersionsForDeck,
  }
}
