import type { DeckId } from '../domain/decks/types'
import type {
  DeckFolder,
  DeckFolderId,
  DeckOrganization,
  DeckTag,
  DeckTagId,
} from '../domain/deckOrganization/types'
import {
  canonicalizeTagIds,
  normalizeOrganizationNameForComparison,
} from '../domain/deckOrganization/validation'
import type { DeckFolderRepository } from '../repositories/deckFolderRepository'
import type { DeckOrganizationRepository } from '../repositories/deckOrganizationRepository'
import type { DeckTagRepository } from '../repositories/deckTagRepository'
import type {
  CloudDeckFolderRecord,
  CloudDeckOrganizationFailure,
  CloudDeckOrganizationRecord,
  CloudDeckOrganizationRepository,
  CloudDeckTagRecord,
} from './cloudDeckOrganizationRepository'

/**
 * Working out where this device and the account disagree about folders, tags and
 * what each deck is organized by, and doing what the reporter decides about it.
 *
 * The rules that carry over from the deck reconciliation: the account not
 * holding something is not the account saying it was deleted, so nothing
 * local-only is ever removed; and nothing is settled automatically where the
 * two sides genuinely disagree.
 *
 * Two rules are specific to these three tables:
 *
 *   * Timestamps are never compared. The tables keep one pair of columns for the
 *     row's sync times and the app's own, so a round trip replaces them, and
 *     comparing whole objects would report every row as a conflict the first
 *     time a second device syncs. A folder and a tag are compared by name, an
 *     organization by the folder it names and the tags it carries.
 *   * A deleted folder or tag stays deleted, so its tombstone is applied rather
 *     than offered as a choice. An organization behaves like a deck: its
 *     tombstone is a real disagreement with a device that still holds one.
 */

export type DeckOrganizationConflict =
  | {
      kind: 'folder-name'
      id: DeckFolderId
      localFolder: DeckFolder
      cloudFolder: DeckFolder
      /** How many local and cloud decks are in this folder, for the chooser. */
      localDeckCount: number
      cloudDeckCount: number
    }
  | {
      kind: 'tag-name'
      id: DeckTagId
      localTag: DeckTag
      cloudTag: DeckTag
      localDeckCount: number
      cloudDeckCount: number
    }
  | {
      /** Folder and tags together: choosing them apart offers no useful answer. */
      kind: 'organization-assignment'
      id: DeckId
      localOrganization: DeckOrganization
      cloudOrganization: DeckOrganization
    }
  | {
      /** The account says the deck's organization was deleted; this device has one. */
      kind: 'organization-tombstone'
      id: DeckId
      localOrganization: DeckOrganization
    }

/** One reference that was dropped while taking an organization from the account. */
export type DeckOrganizationNormalization = {
  deckId: DeckId
  droppedFolderId?: DeckFolderId
  droppedTagIds: DeckTagId[]
}

export type DeckOrganizationReconciliationPlan = {
  folders: {
    /** Only this device has them. Never removed here. */
    localOnly: DeckFolder[]
    /** Only the account has them, so this device gains them. */
    cloudOnly: DeckFolder[]
    /** Same name on both sides: nothing to do or ask. */
    identical: DeckFolder[]
    /**
     * Same name, different place in the order. Not a conflict: reordering
     * rewrites every folder, so one folder's position says nothing on its own.
     */
    reordered: DeckFolder[]
    /** Deleted by the account, so removed here too. Never offered as a choice. */
    tombstoned: DeckFolderId[]
  }
  tags: {
    localOnly: DeckTag[]
    cloudOnly: DeckTag[]
    identical: DeckTag[]
    tombstoned: DeckTagId[]
  }
  organizations: {
    localOnly: DeckOrganization[]
    /** Already normalised against the folders and tags that will exist. */
    cloudOnly: DeckOrganization[]
    identical: DeckOrganization[]
    tombstoned: DeckId[]
    /**
     * Rows for a deck this device does not have, or whose deck the account has
     * deleted. Not taken: an organization describes a deck, and one without a
     * deck is not something the app can show or clear.
     */
    orphaned: DeckId[]
    /** What was dropped to keep every reference resolvable. */
    normalizations: DeckOrganizationNormalization[]
  }
  conflicts: DeckOrganizationConflict[]
  /**
   * Every row the account holds, tombstones included, as the deck plan carries
   * it: it says whether the account has ever synced this, which is not the same
   * question as how much it holds now.
   */
  cloudRowCount: number
}

export type DeckOrganizationConflictChoice = 'local' | 'cloud'

/**
 * How one conflict is named in the reporter's answers.
 *
 * The kind is part of it because the ids of two kinds can coincide: an
 * organization is keyed by its deck, and nothing stops a folder from carrying an
 * id that reads the same.
 */
export function deckOrganizationConflictKey(
  conflict: Pick<DeckOrganizationConflict, 'kind' | 'id'>,
): string {
  return `${conflict.kind}:${conflict.id}`
}

export type DeckOrganizationResolutions = Readonly<
  Record<string, DeckOrganizationConflictChoice>
>

function sameName(left: string, right: string): boolean {
  return (
    normalizeOrganizationNameForComparison(left) ===
    normalizeOrganizationNameForComparison(right)
  )
}

function sameAssignment(
  left: DeckOrganization,
  right: DeckOrganization,
): boolean {
  if (left.folderId !== right.folderId) return false
  // Both sides are already in the app's canonical tag order: the local store
  // refuses anything else, and a row from the account is normalised before it
  // reaches here. Ordering them again would hide where that is decided.
  const { tagIds: leftTags } = left
  const { tagIds: rightTags } = right
  return (
    leftTags.length === rightTags.length &&
    leftTags.every((id, index) => id === rightTags[index])
  )
}

function countDecksInFolder(
  organizations: readonly DeckOrganization[],
  folderId: DeckFolderId,
): number {
  return organizations.filter((value) => value.folderId === folderId).length
}

function countDecksWithTag(
  organizations: readonly DeckOrganization[],
  tagId: DeckTagId,
): number {
  return organizations.filter((value) => value.tagIds.includes(tagId)).length
}

export type DeckOrganizationReconciliationInput = {
  local: {
    folders: readonly DeckFolder[]
    tags: readonly DeckTag[]
    organizations: readonly DeckOrganization[]
  }
  cloud: {
    folders: readonly CloudDeckFolderRecord[]
    tags: readonly CloudDeckTagRecord[]
    organizations: readonly CloudDeckOrganizationRecord[]
  }
  /**
   * The decks this device holds once the deck reconciliation has been applied.
   * An organization for anything else has nothing to describe.
   */
  localDeckIds: ReadonlySet<DeckId>
  /**
   * Whether this device still has folder changes it could not send.
   *
   * It decides whose order wins, and it is the only honest signal available: the
   * row's own timestamps come from the server's clock while the local ones come
   * from the device's, so comparing them would turn a wrong clock into a wrong
   * answer. An unsent change means the account has not seen this device's order
   * yet, so the device keeps it; otherwise the account's order is the newer of
   * the two by construction.
   */
  hasUnsentFolderChanges: boolean
}

/**
 * Pure, so what would happen can be shown before anything happens, and so the
 * same two sides always produce the same plan.
 */
export function planDeckOrganizationReconciliation({
  local,
  cloud,
  localDeckIds,
  hasUnsentFolderChanges,
}: DeckOrganizationReconciliationInput): DeckOrganizationReconciliationPlan {
  const conflicts: DeckOrganizationConflict[] = []

  const localFolders = new Map(local.folders.map((value) => [value.id, value]))
  const localTags = new Map(local.tags.map((value) => [value.id, value]))
  const localOrganizations = new Map(
    local.organizations.map((value) => [value.deckId, value]),
  )

  const folderPlan: DeckOrganizationReconciliationPlan['folders'] = {
    localOnly: [],
    cloudOnly: [],
    identical: [],
    reordered: [],
    tombstoned: [],
  }
  const cloudFolderIds = new Set<DeckFolderId>()
  const cloudOrganizations = cloud.organizations
    .filter((row) => row.deletedAt === null)
    .map((row) => row.organization)

  for (const row of cloud.folders) {
    cloudFolderIds.add(row.folder.id)
    const mine = localFolders.get(row.folder.id)
    if (row.deletedAt !== null) {
      // A deleted definition stays deleted. Offering a choice here would let an
      // offline device resurrect a folder for every other device.
      if (mine) folderPlan.tombstoned.push(row.folder.id)
      continue
    }
    if (!mine) {
      folderPlan.cloudOnly.push(row.folder)
      continue
    }
    if (!sameName(mine.name, row.folder.name)) {
      conflicts.push({
        kind: 'folder-name',
        id: row.folder.id,
        localFolder: mine,
        cloudFolder: row.folder,
        localDeckCount: countDecksInFolder(local.organizations, row.folder.id),
        cloudDeckCount: countDecksInFolder(cloudOrganizations, row.folder.id),
      })
      continue
    }
    // Same name. Whose order applies is not a question about this folder.
    if (!hasUnsentFolderChanges && mine.sortOrder !== row.folder.sortOrder) {
      folderPlan.reordered.push(row.folder)
    } else {
      folderPlan.identical.push(mine)
    }
  }
  for (const folder of local.folders) {
    if (!cloudFolderIds.has(folder.id)) folderPlan.localOnly.push(folder)
  }

  const tagPlan: DeckOrganizationReconciliationPlan['tags'] = {
    localOnly: [],
    cloudOnly: [],
    identical: [],
    tombstoned: [],
  }
  const cloudTagIds = new Set<DeckTagId>()
  for (const row of cloud.tags) {
    cloudTagIds.add(row.tag.id)
    const mine = localTags.get(row.tag.id)
    if (row.deletedAt !== null) {
      if (mine) tagPlan.tombstoned.push(row.tag.id)
      continue
    }
    if (!mine) {
      tagPlan.cloudOnly.push(row.tag)
      continue
    }
    if (!sameName(mine.name, row.tag.name)) {
      conflicts.push({
        kind: 'tag-name',
        id: row.tag.id,
        localTag: mine,
        cloudTag: row.tag,
        localDeckCount: countDecksWithTag(local.organizations, row.tag.id),
        cloudDeckCount: countDecksWithTag(cloudOrganizations, row.tag.id),
      })
      continue
    }
    tagPlan.identical.push(mine)
  }
  for (const tag of local.tags) {
    if (!cloudTagIds.has(tag.id)) tagPlan.localOnly.push(tag)
  }

  /**
   * What a reference may point at once the plan is applied: everything either
   * side keeps, minus what the account deleted. Computed before any organization
   * is taken, so a row is never stored pointing at something that will not be
   * there.
   */
  const removedFolders = new Set(folderPlan.tombstoned)
  const resolvableFolders = new Set(
    [
      ...local.folders.map((value) => value.id),
      ...folderPlan.cloudOnly.map((value) => value.id),
    ].filter((id) => !removedFolders.has(id)),
  )
  const removedTags = new Set(tagPlan.tombstoned)
  const resolvableTags = new Set(
    [
      ...local.tags.map((value) => value.id),
      ...tagPlan.cloudOnly.map((value) => value.id),
    ].filter((id) => !removedTags.has(id)),
  )

  const organizationPlan: DeckOrganizationReconciliationPlan['organizations'] =
    {
      localOnly: [],
      cloudOnly: [],
      identical: [],
      tombstoned: [],
      orphaned: [],
      normalizations: [],
    }
  const cloudOrganizationIds = new Set<DeckId>()

  for (const row of cloud.organizations) {
    const deckId = row.organization.deckId
    cloudOrganizationIds.add(deckId)
    const mine = localOrganizations.get(deckId)

    // An organization describes a deck. Without the deck there is nothing for
    // it to describe, and nothing the app could show or clear.
    if (!localDeckIds.has(deckId)) {
      organizationPlan.orphaned.push(deckId)
      continue
    }
    if (row.deletedAt !== null) {
      // Like a deck: the account saying it was deleted is a real disagreement
      // with a device that still holds one.
      if (mine) {
        conflicts.push({
          kind: 'organization-tombstone',
          id: deckId,
          localOrganization: mine,
        })
      } else {
        organizationPlan.tombstoned.push(deckId)
      }
      continue
    }

    const { organization: normalized, normalization } = normalizeAgainst(
      row.organization,
      { folders: resolvableFolders, tags: resolvableTags },
    )
    if (normalization) organizationPlan.normalizations.push(normalization)

    if (!mine) {
      organizationPlan.cloudOnly.push(normalized)
      continue
    }
    if (sameAssignment(mine, normalized)) {
      organizationPlan.identical.push(mine)
      continue
    }
    conflicts.push({
      kind: 'organization-assignment',
      id: deckId,
      localOrganization: mine,
      cloudOrganization: normalized,
    })
  }
  for (const organization of local.organizations) {
    if (!cloudOrganizationIds.has(organization.deckId)) {
      organizationPlan.localOnly.push(organization)
    }
  }

  return {
    folders: folderPlan,
    tags: tagPlan,
    organizations: organizationPlan,
    conflicts,
    cloudRowCount:
      cloud.folders.length + cloud.tags.length + cloud.organizations.length,
  }
}

/**
 * Drops what an organization names and cannot find.
 *
 * The app's local rule is that every reference resolves, so a row taken from the
 * account is trimmed before it is stored rather than being stored broken and
 * hidden at display time. What the screen hides is a different matter: a folder
 * that vanished under an open page is shown as "no folder" without the stored
 * row being touched.
 */
function normalizeAgainst(
  organization: DeckOrganization,
  resolvable: {
    folders: ReadonlySet<DeckFolderId>
    tags: ReadonlySet<DeckTagId>
  },
): {
  organization: DeckOrganization
  normalization?: DeckOrganizationNormalization
} {
  const droppedFolder =
    organization.folderId !== undefined &&
    !resolvable.folders.has(organization.folderId)
      ? organization.folderId
      : undefined
  // Put into the app's order once, here: the table does not police the order of
  // the array, and everything downstream compares these lists element by element.
  const canonical = canonicalizeTagIds(organization.tagIds)
  const keptTags: DeckTagId[] = []
  const droppedTagIds: DeckTagId[] = []
  for (const tagId of canonical) {
    if (resolvable.tags.has(tagId)) keptTags.push(tagId)
    else droppedTagIds.push(tagId)
  }

  if (!droppedFolder && droppedTagIds.length === 0) {
    return { organization: { ...organization, tagIds: canonical } }
  }

  return {
    organization: {
      deckId: organization.deckId,
      ...(droppedFolder || organization.folderId === undefined
        ? {}
        : { folderId: organization.folderId }),
      tagIds: keptTags,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
    },
    normalization: {
      deckId: organization.deckId,
      ...(droppedFolder ? { droppedFolderId: droppedFolder } : {}),
      droppedTagIds,
    },
  }
}

export type DeckOrganizationApplyOptions = {
  /**
   * The unwrapped local stores.
   *
   * Writing a row that came from the account through a wrapped store would send
   * it straight back to the account it came from, and applying the account's
   * deletion through one would send that deletion back as this device's own.
   */
  local: {
    folders: DeckFolderRepository
    tags: DeckTagRepository
    organizations: DeckOrganizationRepository
  }
  cloud: CloudDeckOrganizationRepository | null
  /**
   * The unsent-change queues, which resolving a conflict has to keep honest: an
   * entry in one is an older intent for the same thing, and a retry would act on
   * it later.
   */
  pending?: {
    folders: {
      record: (id: DeckFolderId, operation: 'upsert') => void
      clear: (id: DeckFolderId) => void
    }
    tags: {
      record: (id: DeckTagId, operation: 'upsert') => void
      clear: (id: DeckTagId) => void
    }
    organizations: {
      record: (id: DeckId, operation: 'upsert' | 'tombstone') => void
      clear: (id: DeckId) => void
    }
  }
  /** Called after each change the account accepted, as elsewhere in the panel. */
  onUploadSuccess?: () => void
}

export type DeckOrganizationApplyResult = {
  /** Conflicts that were settled, so the caller can say how many are left. */
  resolved: string[]
  /** Conflicts still outstanding: nothing was chosen, or sending failed. */
  unresolved: string[]
  /** Rows written to this device, from the account. */
  restored: number
  /** Rows the account accepted from this device. */
  uploaded: number
  /** Folders, tags and organizations removed here because the account deleted them. */
  removed: number
  failure?: CloudDeckOrganizationFailure
}

/**
 * Applies the reporter's choices and the parts of the plan nobody has to choose.
 *
 * The order is fixed and the tests pin it: definitions first, then the
 * organization rows that name them. Doing it the other way round would store a
 * row pointing at a folder this device does not have yet, which is the one state
 * the local rules do not allow.
 *
 * Nothing is rolled back. Every step either writes what the other side already
 * holds or removes what the reporter agreed to remove, so stopping part way
 * leaves both sides consistent with themselves and running it again from a fresh
 * plan reaches the same place.
 */
export async function applyDeckOrganizationReconciliation(
  plan: DeckOrganizationReconciliationPlan,
  resolutions: DeckOrganizationResolutions,
  { local, cloud, pending, onUploadSuccess }: DeckOrganizationApplyOptions,
): Promise<DeckOrganizationApplyResult> {
  const resolved: string[] = []
  const unresolved: string[] = []
  let restored = 0
  let uploaded = 0
  let removed = 0
  let failure: CloudDeckOrganizationFailure | undefined

  for (const conflict of plan.conflicts) {
    if (resolutions[deckOrganizationConflictKey(conflict)] === undefined) {
      unresolved.push(deckOrganizationConflictKey(conflict))
    }
  }

  // Applying the account's deletions and additions needs no cloud call at all,
  // which is why this half runs even where Cloud Sync is unavailable.
  for (const folderId of plan.folders.tombstoned) {
    await local.folders.deleteFolder(folderId)
    pending?.folders.clear(folderId)
    removed += 1
  }
  for (const tagId of plan.tags.tombstoned) {
    await local.tags.deleteTag(tagId)
    pending?.tags.clear(tagId)
    removed += 1
  }
  for (const folder of plan.folders.cloudOnly) {
    await local.folders.saveFolder(folder)
    restored += 1
  }
  for (const tag of plan.tags.cloudOnly) {
    await local.tags.saveTag(tag)
    restored += 1
  }
  if (plan.folders.reordered.length > 0) {
    // One write for the whole order, as the local store requires.
    await local.folders.saveFolderOrder([
      ...plan.folders.reordered,
      ...plan.folders.identical.filter(
        (folder) =>
          !plan.folders.reordered.some((value) => value.id === folder.id),
      ),
    ])
    restored += plan.folders.reordered.length
  }

  const settleDefinitionConflict = async (
    conflict: DeckOrganizationConflict,
    choice: DeckOrganizationConflictChoice,
  ): Promise<boolean> => {
    if (conflict.kind === 'folder-name') {
      if (choice === 'cloud') {
        await local.folders.saveFolder({
          ...conflict.cloudFolder,
          sortOrder: conflict.localFolder.sortOrder,
        })
        pending?.folders.clear(conflict.id)
        restored += 1
        return true
      }
      if (!cloud) return false
      const result = await cloud.upsertFolder(conflict.localFolder)
      if (!result.ok) {
        failure ??= result.reason
        pending?.folders.record(conflict.id, 'upsert')
        return false
      }
      pending?.folders.clear(conflict.id)
      if (result.value.written) {
        uploaded += 1
        onUploadSuccess?.()
      }
      return true
    }
    if (conflict.kind === 'tag-name') {
      if (choice === 'cloud') {
        await local.tags.saveTag(conflict.cloudTag)
        pending?.tags.clear(conflict.id)
        restored += 1
        return true
      }
      if (!cloud) return false
      const result = await cloud.upsertTag(conflict.localTag)
      if (!result.ok) {
        failure ??= result.reason
        pending?.tags.record(conflict.id, 'upsert')
        return false
      }
      pending?.tags.clear(conflict.id)
      if (result.value.written) {
        uploaded += 1
        onUploadSuccess?.()
      }
      return true
    }
    return false
  }

  for (const conflict of plan.conflicts) {
    if (conflict.kind === 'organization-assignment') continue
    if (conflict.kind === 'organization-tombstone') continue
    const choice = resolutions[deckOrganizationConflictKey(conflict)]
    if (choice === undefined) continue
    if (await settleDefinitionConflict(conflict, choice)) {
      resolved.push(deckOrganizationConflictKey(conflict))
    } else {
      unresolved.push(deckOrganizationConflictKey(conflict))
    }
  }

  // Now the rows that name the definitions above.
  for (const deckId of plan.organizations.tombstoned) {
    await local.organizations.deleteOrganization(deckId)
    pending?.organizations.clear(deckId)
    removed += 1
  }
  for (const organization of plan.organizations.cloudOnly) {
    await local.organizations.saveOrganization(organization)
    restored += 1
  }

  for (const conflict of plan.conflicts) {
    if (
      conflict.kind !== 'organization-assignment' &&
      conflict.kind !== 'organization-tombstone'
    ) {
      continue
    }
    const choice = resolutions[deckOrganizationConflictKey(conflict)]
    if (choice === undefined) continue

    if (conflict.kind === 'organization-tombstone') {
      if (choice === 'cloud') {
        await local.organizations.deleteOrganization(conflict.id)
        pending?.organizations.clear(conflict.id)
        removed += 1
        resolved.push(deckOrganizationConflictKey(conflict))
        continue
      }
      if (!cloud) {
        unresolved.push(deckOrganizationConflictKey(conflict))
        continue
      }
      const result = await cloud.upsertOrganization(conflict.localOrganization)
      if (!result.ok) {
        failure ??= result.reason
        pending?.organizations.record(conflict.id, 'upsert')
        unresolved.push(deckOrganizationConflictKey(conflict))
        continue
      }
      pending?.organizations.clear(conflict.id)
      uploaded += 1
      onUploadSuccess?.()
      resolved.push(deckOrganizationConflictKey(conflict))
      continue
    }

    if (choice === 'cloud') {
      await local.organizations.saveOrganization(conflict.cloudOrganization)
      pending?.organizations.clear(conflict.id)
      restored += 1
      resolved.push(deckOrganizationConflictKey(conflict))
      continue
    }
    if (!cloud) {
      unresolved.push(deckOrganizationConflictKey(conflict))
      continue
    }
    const result = await cloud.upsertOrganization(conflict.localOrganization)
    if (!result.ok) {
      failure ??= result.reason
      pending?.organizations.record(conflict.id, 'upsert')
      unresolved.push(deckOrganizationConflictKey(conflict))
      continue
    }
    pending?.organizations.clear(conflict.id)
    uploaded += 1
    onUploadSuccess?.()
    resolved.push(deckOrganizationConflictKey(conflict))
  }

  return {
    resolved,
    unresolved,
    restored,
    uploaded,
    removed,
    ...(failure ? { failure } : {}),
  }
}
