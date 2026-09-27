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
