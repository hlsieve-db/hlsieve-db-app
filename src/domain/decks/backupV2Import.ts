import type {
  DeckFolder,
  DeckFolderId,
  DeckOrganization,
  DeckTag,
  DeckTagId,
} from '../deckOrganization/types'
import {
  canonicalizeTagIds,
  DECK_FOLDER_MAX_COUNT,
  DECK_FOLDER_NAME_MAX_LENGTH,
  DECK_ORGANIZATION_TAG_MAX_COUNT,
  DECK_TAG_MAX_COUNT,
  DECK_TAG_NAME_MAX_LENGTH,
  normalizeOrganizationNameForComparison,
} from '../deckOrganization/validation'
import { planDeckImportOutcomes, type DeckBackupV2 } from './backup'
import type { Deck, DeckId } from './types'

/**
 * Bringing a backup with folders and tags into the decks already here.
 *
 * Three rules shape all of it.
 *
 * Nothing is merged because two things share a name. A folder called 大会用 in
 * a file is not necessarily the one called 大会用 here, and quietly folding
 * them together would move decks into a folder their owner never chose. Only an
 * id that matches, carrying the same name, is treated as the same folder, which
 * is what makes importing the same file twice a no-op rather than a duplication.
 *
 * Nothing is dropped in silence. A reference that cannot be resolved, a record
 * whose deck is not in the file, a tag list over the limit: each is applied as
 * safely as it can be and counted, so the import screen can say what happened.
 *
 * Nothing throws for being too big. A file that would take the collection over
 * a limit is refused as a result the screen can show, because the alternative
 * is an exception in the middle of a preview the reporter asked for.
 */

export type DeckBackupV2ImportWarnings = {
  /** Referenced by an organization but absent from the file. */
  missingFolderIds: DeckFolderId[]
  missingTagIds: DeckTagId[]
  /** Tag ids listed more than once on one deck. */
  duplicateTagIdCount: number
  /** Organizations whose deck is not in the file. */
  orphanedOrganizationCount: number
  /** Decks already here, so not imported again. */
  skippedDeckCount: number
  /** Skipped decks that already had organization metadata, which was kept. */
  skippedOrganizationCount: number
  /** Folders and tags matched by id and name, so reused rather than added. */
  reusedFolderCount: number
  reusedTagCount: number
  /** Folders and tags renamed because the name was taken. */
  renamedFolderCount: number
  renamedTagCount: number
  /** Organizations whose tag list was cut to the per-deck limit. */
  truncatedTagOrganizationCount: number
}

export type DeckBackupV2ImportPlan = {
  /** Only what is actually written: reused and skipped records are not here. */
  decks: Deck[]
  folders: DeckFolder[]
  tags: DeckTag[]
  organizations: DeckOrganization[]
  deckIdMap: Map<DeckId, DeckId>
  folderIdMap: Map<DeckFolderId, DeckFolderId>
  tagIdMap: Map<DeckTagId, DeckTagId>
  newCount: number
  identicalCount: number
  conflictCount: number
  warnings: DeckBackupV2ImportWarnings
}

export type DeckBackupV2ImportResult =
  { ok: true; plan: DeckBackupV2ImportPlan } | { ok: false; message: string }

export type DeckBackupV2ImportExisting = {
  decks: readonly Deck[]
  folders: readonly DeckFolder[]
  tags: readonly DeckTag[]
  organizations: readonly DeckOrganization[]
}

export type DeckBackupV2ImportIds = {
  deck?: () => string
  folder?: () => string
  tag?: () => string
}

type NamedRecord = { id: string; name: string }

type NameResolution<T extends NamedRecord> = {
  added: T[]
  idMap: Map<string, string>
  reusedCount: number
  renamedCount: number
}

function freeId(createId: () => string, reserved: ReadonlySet<string>): string {
  let generated = createId()
  while (!generated.trim() || reserved.has(generated)) generated = createId()
  return generated
}

/**
 * Numbers a name that is already taken: 名前, 名前 (2), 名前 (3).
 *
 * The suffix is what tells the two apart, so when the result would be too long
 * the original name gives way rather than the number.
 */
function availableName(
  name: string,
  taken: ReadonlySet<string>,
  maxLength: number,
): string {
  const fits = (candidate: string) =>
    candidate.length <= maxLength ? candidate : undefined
  if (
    !taken.has(normalizeOrganizationNameForComparison(name)) &&
    fits(name) !== undefined
  ) {
    return name
  }
  for (let attempt = 2; ; attempt += 1) {
    const suffix = ` (${attempt})`
    const base = name.slice(0, Math.max(0, maxLength - suffix.length))
    const candidate = `${base}${suffix}`
    if (!taken.has(normalizeOrganizationNameForComparison(candidate))) {
      return candidate
    }
  }
}

/**
 * Works out which incoming folders or tags are already here and which are new.
 *
 * Reuse comes first, because a record that matches an existing one by id and
 * name is that record; only after that can a name clash mean anything.
 */
function resolveNamed<T extends NamedRecord>(
  incoming: readonly T[],
  existing: readonly T[],
  createId: () => string,
  maxNameLength: number,
  rename: (record: T, name: string) => T,
): NameResolution<T> {
  const existingById = new Map(existing.map((record) => [record.id, record]))
  const takenNames = new Set(
    existing.map((record) =>
      normalizeOrganizationNameForComparison(record.name),
    ),
  )
  const reserved = new Set([
    ...existing.map(({ id }) => id),
    ...incoming.map(({ id }) => id),
  ])

  const added: T[] = []
  const idMap = new Map<string, string>()
  let reusedCount = 0
  let renamedCount = 0

  for (const record of incoming) {
    const sameId = existingById.get(record.id)
    if (
      sameId &&
      normalizeOrganizationNameForComparison(sameId.name) ===
        normalizeOrganizationNameForComparison(record.name)
    ) {
      idMap.set(record.id, sameId.id)
      reusedCount += 1
      continue
    }

    const id = sameId ? freeId(createId, reserved) : record.id
    reserved.add(id)
    const name = availableName(record.name, takenNames, maxNameLength)
    if (name !== record.name) renamedCount += 1
    takenNames.add(normalizeOrganizationNameForComparison(name))

    const next = rename({ ...record, id } as T, name)
    added.push(next)
    idMap.set(record.id, id)
  }

  return { added, idMap, reusedCount, renamedCount }
}

/**
 * Places imported folders after the ones already here.
 *
 * Their order relative to each other is kept — by the order the file gives, and
 * by id where that ties — but the numbers are reassigned, so an imported folder
 * cannot land in the middle of a list the reporter arranged.
 */
function appendFolderOrder(
  folders: readonly DeckFolder[],
  existing: readonly DeckFolder[],
): DeckFolder[] {
  const highest = existing.reduce(
    (max, folder) => Math.max(max, folder.sortOrder),
    0,
  )
  return [...folders]
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
    )
    .map((folder, index) => ({ ...folder, sortOrder: highest + index + 1 }))
}

export function planDeckBackupV2Import(
  backup: DeckBackupV2,
  existing: DeckBackupV2ImportExisting,
  createIds: DeckBackupV2ImportIds = {},
): DeckBackupV2ImportResult {
  const fallback = () => crypto.randomUUID()

  const folderResolution = resolveNamed(
    backup.folders,
    existing.folders,
    createIds.folder ?? fallback,
    DECK_FOLDER_NAME_MAX_LENGTH,
    (folder, name) => ({ ...folder, name }),
  )
  const tagResolution = resolveNamed(
    backup.tags,
    existing.tags,
    createIds.tag ?? fallback,
    DECK_TAG_NAME_MAX_LENGTH,
    (tag, name) => ({ ...tag, name }),
  )

  // Counted against what is actually added, so reusing a folder the file and
  // this device share does not push the collection towards its limit.
  if (
    existing.folders.length + folderResolution.added.length >
    DECK_FOLDER_MAX_COUNT
  ) {
    return {
      ok: false,
      message: `フォルダーが上限の${DECK_FOLDER_MAX_COUNT}個を超えるため、読み込みを中止しました。`,
    }
  }
  if (existing.tags.length + tagResolution.added.length > DECK_TAG_MAX_COUNT) {
    return {
      ok: false,
      message: `タグが上限の${DECK_TAG_MAX_COUNT}個を超えるため、読み込みを中止しました。`,
    }
  }

  const outcomes = planDeckImportOutcomes(
    backup.decks,
    existing.decks,
    createIds.deck ?? fallback,
  )
  const deckIdMap = new Map<DeckId, DeckId>()
  const decks: Deck[] = []
  const skippedDeckIds = new Set<DeckId>()
  for (const outcome of outcomes) {
    if (outcome.kind === 'skipped') {
      deckIdMap.set(outcome.sourceId, outcome.matchedId)
      skippedDeckIds.add(outcome.matchedId)
      continue
    }
    deckIdMap.set(outcome.sourceId, outcome.deck.id)
    decks.push(outcome.deck)
  }

  const organizedDeckIds = new Set(
    existing.organizations.map((organization) => organization.deckId),
  )
  const missingFolderIds = new Set<DeckFolderId>()
  const missingTagIds = new Set<DeckTagId>()
  let duplicateTagIdCount = 0
  let orphanedOrganizationCount = 0
  let skippedOrganizationCount = 0
  let truncatedTagOrganizationCount = 0
  const organizations: DeckOrganization[] = []

  for (const organization of backup.organizations) {
    const deckId = deckIdMap.get(organization.deckId)
    if (deckId === undefined) {
      // Its deck is not in the file, so there is nothing for it to describe.
      orphanedOrganizationCount += 1
      continue
    }
    // A deck already here keeps the organization it already has: the reporter
    // arranged this collection, and the file is the older account of it.
    if (skippedDeckIds.has(deckId) && organizedDeckIds.has(deckId)) {
      skippedOrganizationCount += 1
      continue
    }

    const folderId =
      organization.folderId === undefined
        ? undefined
        : folderResolution.idMap.get(organization.folderId)
    if (organization.folderId !== undefined && folderId === undefined) {
      missingFolderIds.add(organization.folderId)
    }

    const remapped: DeckTagId[] = []
    for (const tagId of organization.tagIds) {
      const next = tagResolution.idMap.get(tagId)
      if (next === undefined) missingTagIds.add(tagId)
      else remapped.push(next)
    }
    const canonical = canonicalizeTagIds(remapped)
    duplicateTagIdCount += remapped.length - canonical.length
    // Cut rather than refused: one over-tagged deck must not cost the reporter
    // the rest of the file.
    const tagIds = canonical.slice(0, DECK_ORGANIZATION_TAG_MAX_COUNT)
    if (tagIds.length < canonical.length) truncatedTagOrganizationCount += 1

    // Built field by field rather than spread: spreading would carry the
    // file's own folderId through even when it could not be resolved.
    organizations.push({
      deckId,
      ...(folderId === undefined ? {} : { folderId }),
      tagIds,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
    })
  }

  return {
    ok: true,
    plan: {
      decks,
      folders: appendFolderOrder(folderResolution.added, existing.folders),
      tags: tagResolution.added,
      organizations,
      deckIdMap,
      folderIdMap: folderResolution.idMap,
      tagIdMap: tagResolution.idMap,
      newCount: outcomes.filter((outcome) => outcome.kind === 'kept').length,
      identicalCount: outcomes.filter((outcome) => outcome.kind === 'skipped')
        .length,
      conflictCount: outcomes.filter((outcome) => outcome.kind === 'renamed')
        .length,
      warnings: {
        missingFolderIds: [...missingFolderIds].sort(),
        missingTagIds: [...missingTagIds].sort(),
        duplicateTagIdCount,
        orphanedOrganizationCount,
        skippedDeckCount: outcomes.filter(
          (outcome) => outcome.kind === 'skipped',
        ).length,
        skippedOrganizationCount,
        reusedFolderCount: folderResolution.reusedCount,
        reusedTagCount: tagResolution.reusedCount,
        renamedFolderCount: folderResolution.renamedCount,
        renamedTagCount: tagResolution.renamedCount,
        truncatedTagOrganizationCount,
      },
    },
  }
}
