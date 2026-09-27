import type { DeckFolder, DeckOrganization, DeckTag, DeckTagId } from './types'

export const DECK_FOLDER_NAME_MAX_LENGTH = 50
export const DECK_TAG_NAME_MAX_LENGTH = 30
export const DECK_FOLDER_MAX_COUNT = 50
export const DECK_TAG_MAX_COUNT = 100
export const DECK_ORGANIZATION_TAG_MAX_COUNT = 10

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIsoDateString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  )
}

export function organizationNameForStorage(name: string): string {
  return name.trim()
}

export function normalizeOrganizationNameForComparison(name: string): string {
  return organizationNameForStorage(name).normalize('NFKC').toLowerCase()
}

function isValidName(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value === organizationNameForStorage(value) &&
    value.length > 0 &&
    value.length <= maxLength
  )
}

export function isDeckFolder(value: unknown): value is DeckFolder {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    isValidName(value.name, DECK_FOLDER_NAME_MAX_LENGTH) &&
    // Zero or above, matching the cloud table. A negative order reaches the
    // local store only through a hand-edited backup, and the account would
    // then refuse it for good, leaving an unsent change that can never be sent.
    typeof value.sortOrder === 'number' &&
    Number.isSafeInteger(value.sortOrder) &&
    value.sortOrder >= 0 &&
    isIsoDateString(value.createdAt) &&
    isIsoDateString(value.updatedAt)
  )
}

export function isDeckTag(value: unknown): value is DeckTag {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    isValidName(value.name, DECK_TAG_NAME_MAX_LENGTH) &&
    isIsoDateString(value.createdAt) &&
    isIsoDateString(value.updatedAt)
  )
}

export function canonicalizeTagIds(tagIds: readonly DeckTagId[]): DeckTagId[] {
  return [...new Set(tagIds)].sort((left, right) => left.localeCompare(right))
}

export type NormalizeTagIdsResult =
  | { ok: true; tagIds: DeckTagId[]; missingTagIds: DeckTagId[] }
  | { ok: false; reason: 'invalid-id' | 'missing-tag' | 'too-many-tags' }

export function normalizeTagIds(
  tagIds: readonly DeckTagId[],
  options: {
    existingTagIds: ReadonlySet<DeckTagId>
    missing: 'reject' | 'drop'
  },
): NormalizeTagIdsResult {
  if (tagIds.some((id) => typeof id !== 'string' || id.length === 0)) {
    return { ok: false, reason: 'invalid-id' }
  }
  const unique = canonicalizeTagIds(tagIds)
  const missingTagIds = unique.filter((id) => !options.existingTagIds.has(id))
  if (missingTagIds.length > 0 && options.missing === 'reject') {
    return { ok: false, reason: 'missing-tag' }
  }
  const normalized = unique.filter((id) => options.existingTagIds.has(id))
  if (normalized.length > DECK_ORGANIZATION_TAG_MAX_COUNT) {
    return { ok: false, reason: 'too-many-tags' }
  }
  return { ok: true, tagIds: normalized, missingTagIds }
}

export function isDeckOrganization(value: unknown): value is DeckOrganization {
  if (!isRecord(value)) return false
  if (
    typeof value.deckId !== 'string' ||
    value.deckId.length === 0 ||
    (value.folderId !== undefined &&
      (typeof value.folderId !== 'string' || value.folderId.length === 0)) ||
    !Array.isArray(value.tagIds) ||
    value.tagIds.some((id) => typeof id !== 'string' || id.length === 0) ||
    value.tagIds.length > DECK_ORGANIZATION_TAG_MAX_COUNT ||
    !isIsoDateString(value.createdAt) ||
    !isIsoDateString(value.updatedAt)
  ) {
    return false
  }
  return (
    JSON.stringify(value.tagIds) ===
    JSON.stringify(canonicalizeTagIds(value.tagIds))
  )
}

export function assertUniqueOrganizationName(
  name: string,
  existingNames: readonly string[],
): void {
  const key = normalizeOrganizationNameForComparison(name)
  if (
    existingNames.some(
      (candidate) => normalizeOrganizationNameForComparison(candidate) === key,
    )
  ) {
    throw new Error('An item with the same normalized name already exists.')
  }
}
