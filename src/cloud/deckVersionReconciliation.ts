import { deckContentEquals } from '../domain/decks/deckContent'
import type { Deck } from '../domain/decks/types'
import { deckVersionContentEquals } from '../domain/deckVersions/equality'
import type { DeckVersion } from '../domain/deckVersions/types'
import type { DeckBackupRepository } from '../repositories/deckRepository'
import type { DeckVersionRepository } from '../repositories/deckVersionRepository'
import type {
  CloudDeckFailure,
  CloudDeckRecord,
  CloudDeckRepository,
} from './cloudDeckRepository'
import type {
  CloudDeckVersionFailure,
  CloudDeckVersionRecord,
  CloudDeckVersionRepository,
} from './cloudDeckVersionRepository'

export type DeckVersionReconciliationFailure =
  CloudDeckFailure | CloudDeckVersionFailure | 'unavailable'

export type DeckVersionReconciliationResult =
  | {
      ok: true
      uploaded: number
      restored: number
      removed: number
      deferred: number
    }
  | {
      ok: false
      reason: DeckVersionReconciliationFailure
      uploaded: number
      restored: number
      removed: number
      deferred: number
    }

export type DeckVersionReconciliationOptions = {
  decks: Pick<DeckBackupRepository, 'listDecks'>
  versions: Pick<
    DeckVersionRepository,
    'listAllVersions' | 'saveVersion' | 'deleteVersion'
  >
  cloudDecks: CloudDeckRepository | null
  cloudVersions: CloudDeckVersionRepository | null
  pending?: {
    isTombstone: (versionId: string) => boolean
    recordUpload: (version: DeckVersion) => void
    clear: (versionId: string) => void
  }
  onUploadSuccess?: () => void
}

function resolvedParents(
  localDecks: readonly Deck[],
  cloudRows: readonly CloudDeckRecord[],
): Set<string> {
  const local = new Map(localDecks.map((deck) => [deck.id, deck]))
  const resolved = new Set<string>()
  for (const row of cloudRows) {
    const localDeck = local.get(row.id)
    if (
      row.deletedAt === null &&
      localDeck &&
      deckContentEquals(localDeck, row.deck)
    ) {
      resolved.add(row.id)
    }
  }
  return resolved
}

/** Reconciles immutable Versions only after their parent Deck is settled. */
export async function reconcileDeckVersions({
  decks,
  versions,
  cloudDecks,
  cloudVersions,
  pending,
  onUploadSuccess,
}: DeckVersionReconciliationOptions): Promise<DeckVersionReconciliationResult> {
  const empty = { uploaded: 0, restored: 0, removed: 0, deferred: 0 }
  if (!cloudDecks || !cloudVersions) {
    return { ok: false, reason: 'unavailable', ...empty }
  }

  // Read and validate every input before the first write. A malformed cloud
  // row therefore cannot cause a partially-applied local reconciliation.
  const [cloudDeckResult, cloudVersionResult] = await Promise.all([
    cloudDecks.listAll(),
    cloudVersions.listAll(),
  ])
  if (!cloudDeckResult.ok) {
    return { ok: false, reason: cloudDeckResult.reason, ...empty }
  }
  if (!cloudVersionResult.ok) {
    return { ok: false, reason: cloudVersionResult.reason, ...empty }
  }

  let localDecks: Deck[]
  let localVersions: DeckVersion[]
  try {
    ;[localDecks, localVersions] = await Promise.all([
      decks.listDecks(),
      versions.listAllVersions(),
    ])
  } catch {
    return { ok: false, reason: 'failed', ...empty }
  }

  const parents = resolvedParents(localDecks, cloudDeckResult.value)
  const localById = new Map(
    localVersions.map((version) => [version.id, version]),
  )
  const cloudById = new Map(
    cloudVersionResult.value.map((record) => [record.version.id, record]),
  )

  // Immutable same-id disagreement is an integrity failure. Detect every one
  // before applying other actions so neither side is partially advanced.
  for (const local of localVersions) {
    const cloud = cloudById.get(local.id)
    if (
      cloud?.deletedAt === null &&
      !deckVersionContentEquals(local, cloud.version)
    ) {
      return { ok: false, reason: 'integrity-conflict', ...empty }
    }
  }

  const tombstones: CloudDeckVersionRecord[] = []
  const restores: DeckVersion[] = []
  const uploads: DeckVersion[] = []
  let deferred = 0

  for (const record of [...cloudVersionResult.value].sort((a, b) =>
    a.version.id.localeCompare(b.version.id, 'en'),
  )) {
    const local = localById.get(record.version.id)
    if (record.deletedAt !== null) {
      if (local) tombstones.push(record)
      continue
    }
    if (local) continue
    if (pending?.isTombstone(record.version.id)) continue
    if (parents.has(record.version.deckId)) restores.push(record.version)
    else deferred += 1
  }

  for (const local of [...localVersions].sort((a, b) =>
    a.id.localeCompare(b.id, 'en'),
  )) {
    if (cloudById.has(local.id) || pending?.isTombstone(local.id)) continue
    if (parents.has(local.deckId)) uploads.push(local)
    else deferred += 1
  }

  let uploaded = 0
  let restored = 0
  let removed = 0
  try {
    for (const record of tombstones) {
      await versions.deleteVersion(record.version.id)
      pending?.clear(record.version.id)
      removed += 1
    }
    for (const version of restores) {
      await versions.saveVersion(version)
      pending?.clear(version.id)
      restored += 1
    }
  } catch {
    return {
      ok: false,
      reason: 'failed',
      uploaded,
      restored,
      removed,
      deferred,
    }
  }

  for (const version of uploads) {
    const result = await cloudVersions.insert(version)
    if (!result.ok) {
      pending?.recordUpload(version)
      return {
        ok: false,
        reason: result.reason,
        uploaded,
        restored,
        removed,
        deferred,
      }
    }
    pending?.clear(version.id)
    if (result.value.record && result.value.record.deletedAt !== null) {
      try {
        await versions.deleteVersion(version.id)
        removed += 1
      } catch {
        return {
          ok: false,
          reason: 'failed',
          uploaded,
          restored,
          removed,
          deferred,
        }
      }
      continue
    }
    if (result.value.mutated) {
      uploaded += 1
      onUploadSuccess?.()
    }
  }

  return { ok: true, uploaded, restored, removed, deferred }
}
