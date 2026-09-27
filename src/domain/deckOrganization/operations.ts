import type { DeckId } from '../decks/types'
import type {
  DeckFolder,
  DeckFolderId,
  DeckOrganization,
  DeckTag,
  DeckTagId,
} from './types'
import {
  assertUniqueOrganizationName,
  normalizeOrganizationNameForComparison,
  DECK_FOLDER_MAX_COUNT,
  DECK_FOLDER_NAME_MAX_LENGTH,
  DECK_TAG_MAX_COUNT,
  DECK_TAG_NAME_MAX_LENGTH,
  normalizeTagIds,
  organizationNameForStorage,
} from './validation'

function checkedName(name: string, maxLength: number): string {
  const stored = organizationNameForStorage(name)
  if (!stored || stored.length > maxLength) {
    throw new Error('Organization name is invalid.')
  }
  return stored
}

export function createDeckFolder(
  name: string,
  existing: readonly DeckFolder[],
  options: { id?: () => string; now?: () => string } = {},
): DeckFolder {
  if (existing.length >= DECK_FOLDER_MAX_COUNT) {
    throw new Error('Folder limit reached.')
  }
  const stored = checkedName(name, DECK_FOLDER_NAME_MAX_LENGTH)
  assertUniqueOrganizationName(
    stored,
    existing.map((folder) => folder.name),
  )
  const timestamp = (options.now ?? (() => new Date().toISOString()))()
  return {
    id: (options.id ?? (() => crypto.randomUUID()))(),
    name: stored,
    sortOrder:
      existing.reduce(
        (maximum, folder) => Math.max(maximum, folder.sortOrder),
        -1,
      ) + 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function renameDeckFolder(
  folder: DeckFolder,
  name: string,
  existing: readonly DeckFolder[],
  now = () => new Date().toISOString(),
): DeckFolder {
  const stored = checkedName(name, DECK_FOLDER_NAME_MAX_LENGTH)
  assertUniqueOrganizationName(
    stored,
    existing.filter(({ id }) => id !== folder.id).map((item) => item.name),
  )
  return { ...folder, name: stored, updatedAt: now() }
}

export function moveDeckFolder(
  folders: readonly DeckFolder[],
  folderId: DeckFolderId,
  direction: 'up' | 'down',
  now = () => new Date().toISOString(),
): DeckFolder[] {
  const ordered = [...folders].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
  )
  const index = ordered.findIndex(({ id }) => id === folderId)
  if (index < 0) throw new Error('Folder not found.')
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= ordered.length) return ordered
  ;[ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!]
  const timestamp = now()
  return ordered.map((folder, sortOrder) =>
    folder.sortOrder === sortOrder
      ? folder
      : { ...folder, sortOrder, updatedAt: timestamp },
  )
}

export function createDeckTag(
  name: string,
  existing: readonly DeckTag[],
  options: { id?: () => string; now?: () => string } = {},
): DeckTag {
  if (existing.length >= DECK_TAG_MAX_COUNT)
    throw new Error('Tag limit reached.')
  const stored = checkedName(name, DECK_TAG_NAME_MAX_LENGTH)
  assertUniqueOrganizationName(
    stored,
    existing.map((tag) => tag.name),
  )
  const timestamp = (options.now ?? (() => new Date().toISOString()))()
  return {
    id: (options.id ?? (() => crypto.randomUUID()))(),
    name: stored,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function renameDeckTag(
  tag: DeckTag,
  name: string,
  existing: readonly DeckTag[],
  now = () => new Date().toISOString(),
): DeckTag {
  const stored = checkedName(name, DECK_TAG_NAME_MAX_LENGTH)
  assertUniqueOrganizationName(
    stored,
    existing.filter(({ id }) => id !== tag.id).map((item) => item.name),
  )
  return { ...tag, name: stored, updatedAt: now() }
}

export type NormalizeDeckOrganizationResult = {
  organization: DeckOrganization
  missingFolderId?: DeckFolderId
  missingTagIds: DeckTagId[]
}

export function normalizeDeckOrganization(
  input: {
    deckId: DeckId
    folderId?: DeckFolderId
    tagIds: readonly DeckTagId[]
    createdAt?: string
  },
  definitions: {
    folders: readonly DeckFolder[]
    tags: readonly DeckTag[]
  },
  options: {
    missing: 'reject' | 'drop'
    now?: () => string
  },
): NormalizeDeckOrganizationResult {
  const folderIds = new Set(definitions.folders.map(({ id }) => id))
  const tagIds = new Set(definitions.tags.map(({ id }) => id))
  const missingFolderId =
    input.folderId !== undefined && !folderIds.has(input.folderId)
      ? input.folderId
      : undefined
  if (missingFolderId && options.missing === 'reject') {
    throw new Error('Folder does not exist.')
  }
  const normalizedTags = normalizeTagIds(input.tagIds, {
    existingTagIds: tagIds,
    missing: options.missing,
  })
  if (!normalizedTags.ok) throw new Error(normalizedTags.reason)
  const timestamp = (options.now ?? (() => new Date().toISOString()))()
  return {
    organization: {
      deckId: input.deckId,
      ...(input.folderId !== undefined && missingFolderId === undefined
        ? { folderId: input.folderId }
        : {}),
      tagIds: normalizedTags.tagIds,
      createdAt: input.createdAt ?? timestamp,
      updatedAt: timestamp,
    },
    ...(missingFolderId ? { missingFolderId } : {}),
    missingTagIds: normalizedTags.missingTagIds,
  }
}

export function duplicateDeckOrganization(
  organization: DeckOrganization | undefined,
  deckId: DeckId,
  now = () => new Date().toISOString(),
): DeckOrganization | undefined {
  if (!organization) return undefined
  const timestamp = now()
  return {
    deckId,
    ...(organization.folderId !== undefined
      ? { folderId: organization.folderId }
      : {}),
    tagIds: [...organization.tagIds],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function organizationMatchesAllTags(
  organization: DeckOrganization | undefined,
  selectedTagIds: readonly DeckTagId[],
): boolean {
  if (selectedTagIds.length === 0) return true
  if (!organization) return false
  const assigned = new Set(organization.tagIds)
  return selectedTagIds.every((id) => assigned.has(id))
}

/** What the folder column offers: everything, the unfiled decks, or one folder. */
export type DeckFolderFilter =
  | { kind: 'all' }
  | { kind: 'none' }
  | { kind: 'folder'; folderId: DeckFolderId }

export const ALL_DECKS_FILTER: DeckFolderFilter = { kind: 'all' }

export type DeckFolderSummary = {
  folder: DeckFolder
  deckCount: number
}

export type DeckFolderSummaries = {
  allCount: number
  /** Decks with no organization row, and decks whose row names no folder. */
  unfiledCount: number
  folders: DeckFolderSummary[]
}

function organizationsByDeck(
  organizations: readonly DeckOrganization[],
): Map<DeckId, DeckOrganization> {
  return new Map(organizations.map((value) => [value.deckId, value]))
}

/**
 * Counts for the folder column.
 *
 * A deck whose row names a folder that no longer exists counts as unfiled,
 * because that is where the column would show it.
 */
export function summarizeDeckFolders(
  decks: readonly { id: DeckId }[],
  organizations: readonly DeckOrganization[],
  folders: readonly DeckFolder[],
): DeckFolderSummaries {
  const rows = organizationsByDeck(organizations)
  const counts = new Map<DeckFolderId, number>()
  const known = new Set(folders.map(({ id }) => id))
  let unfiledCount = 0

  for (const deck of decks) {
    const folderId = rows.get(deck.id)?.folderId
    if (folderId === undefined || !known.has(folderId)) {
      unfiledCount += 1
      continue
    }
    counts.set(folderId, (counts.get(folderId) ?? 0) + 1)
  }

  return {
    allCount: decks.length,
    unfiledCount,
    folders: sortFoldersForDisplay(folders).map((folder) => ({
      folder,
      deckCount: counts.get(folder.id) ?? 0,
    })),
  }
}

/** The order the reporter arranged, with id breaking a tie. */
export function sortFoldersForDisplay(
  folders: readonly DeckFolder[],
): DeckFolder[] {
  return [...folders].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
  )
}

/** Tags are stored in id order and read in name order. */
export function sortTagsForDisplay(tags: readonly DeckTag[]): DeckTag[] {
  return [...tags].sort(
    (left, right) =>
      normalizeOrganizationNameForComparison(left.name).localeCompare(
        normalizeOrganizationNameForComparison(right.name),
      ) || left.id.localeCompare(right.id),
  )
}

/** The tags one deck carries, named and in reading order. */
export function tagsForOrganization(
  organization: DeckOrganization | undefined,
  tags: readonly DeckTag[],
): DeckTag[] {
  if (!organization || organization.tagIds.length === 0) return []
  const assigned = new Set(organization.tagIds)
  return sortTagsForDisplay(tags.filter(({ id }) => assigned.has(id)))
}

/** What a narrow deck card shows, plus how many it had to leave out. */
export function visibleTagsWithOverflow(
  tags: readonly DeckTag[],
  limit: number,
): { visible: DeckTag[]; overflowCount: number } {
  if (limit < 0) throw new Error('Tag display limit must not be negative.')
  return {
    visible: tags.slice(0, limit),
    overflowCount: Math.max(0, tags.length - limit),
  }
}

export function folderNameForDeck(
  organization: DeckOrganization | undefined,
  folders: readonly DeckFolder[],
): string | undefined {
  if (organization?.folderId === undefined) return undefined
  return folders.find(({ id }) => id === organization.folderId)?.name
}

/**
 * The decks the folder column and the tag chips leave visible.
 *
 * Tags are combined with AND: a deck has to carry every selected tag. Selecting
 * nothing means no narrowing at all, which is not the same as selecting a tag
 * no deck carries.
 */
export function filterDecksByOrganization<T extends { id: DeckId }>(
  decks: readonly T[],
  organizations: readonly DeckOrganization[],
  selection: {
    folder: DeckFolderFilter
    tagIds: readonly DeckTagId[]
    folders?: readonly DeckFolder[]
  },
): T[] {
  const rows = organizationsByDeck(organizations)
  const known =
    selection.folders === undefined
      ? undefined
      : new Set(selection.folders.map(({ id }) => id))

  return decks.filter((deck) => {
    const organization = rows.get(deck.id)
    const folderId =
      organization?.folderId !== undefined &&
      (known === undefined || known.has(organization.folderId))
        ? organization.folderId
        : undefined

    if (selection.folder.kind === 'none' && folderId !== undefined) return false
    if (
      selection.folder.kind === 'folder' &&
      folderId !== selection.folder.folderId
    ) {
      return false
    }
    return organizationMatchesAllTags(organization, selection.tagIds)
  })
}

/**
 * Adds or removes one tag on a deck.
 *
 * Returns the row to store, which stays even when it ends up empty: a cleared
 * row is a thing the reporter did, and differs from never having organized the
 * deck at all.
 */
export function toggleDeckOrganizationTag(
  organization: DeckOrganization | undefined,
  input: { deckId: DeckId; tagId: DeckTagId },
  definitions: { folders: readonly DeckFolder[]; tags: readonly DeckTag[] },
  now = () => new Date().toISOString(),
): DeckOrganization {
  const current = organization?.tagIds ?? []
  const tagIds = current.includes(input.tagId)
    ? current.filter((id) => id !== input.tagId)
    : [...current, input.tagId]

  return normalizeDeckOrganization(
    {
      deckId: input.deckId,
      ...(organization?.folderId === undefined
        ? {}
        : { folderId: organization.folderId }),
      tagIds,
      ...(organization === undefined
        ? {}
        : { createdAt: organization.createdAt }),
    },
    definitions,
    { missing: 'reject', now },
  ).organization
}

/** Moves one deck into a folder, or out of every folder. */
export function setDeckOrganizationFolder(
  organization: DeckOrganization | undefined,
  input: { deckId: DeckId; folderId?: DeckFolderId },
  definitions: { folders: readonly DeckFolder[]; tags: readonly DeckTag[] },
  now = () => new Date().toISOString(),
): DeckOrganization {
  return normalizeDeckOrganization(
    {
      deckId: input.deckId,
      ...(input.folderId === undefined ? {} : { folderId: input.folderId }),
      tagIds: organization?.tagIds ?? [],
      ...(organization === undefined
        ? {}
        : { createdAt: organization.createdAt }),
    },
    definitions,
    { missing: 'reject', now },
  ).organization
}
