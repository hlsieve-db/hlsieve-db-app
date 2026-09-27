import { sameDeckRegulation } from '../regulations/deckRegulationId'
import type {
  DeckFolder,
  DeckOrganization,
  DeckTag,
} from '../deckOrganization/types'
import {
  DECK_FOLDER_MAX_COUNT,
  DECK_TAG_MAX_COUNT,
  isDeckFolder,
  isDeckOrganization,
  isDeckTag,
} from '../deckOrganization/validation'
import type { Deck, DeckId } from './types'
import { isDeck } from './validation'

export const DECK_BACKUP_FORMAT = 'hlsieve-deck-backup' as const
export const DECK_BACKUP_VERSION = 1 as const
export const DECK_BACKUP_VERSION_V2 = 2 as const
export const MAX_DECK_BACKUP_FILE_SIZE = 5 * 1024 * 1024

export type DeckBackupV1 = {
  format: typeof DECK_BACKUP_FORMAT
  version: typeof DECK_BACKUP_VERSION
  exportedAt: string
  decks: Deck[]
}

export type DeckBackupV2 = {
  format: typeof DECK_BACKUP_FORMAT
  version: typeof DECK_BACKUP_VERSION_V2
  exportedAt: string
  decks: Deck[]
  folders: DeckFolder[]
  tags: DeckTag[]
  organizations: DeckOrganization[]
}

export type DeckBackup = DeckBackupV1 | DeckBackupV2

export type DeckImportPlan = {
  decks: Deck[]
  newCount: number
  identicalCount: number
  conflictCount: number
}

export type DeckBackupParseResult =
  { ok: true; backup: DeckBackup } | { ok: false; message: string }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  )
}

function isValidBackupDeck(value: unknown): value is Deck {
  return (
    isPlainObject(value) &&
    Array.isArray(value.entries) &&
    value.entries.every(isPlainObject) &&
    isDeck(value)
  )
}

function isValidBackupOrganization(value: unknown): value is DeckOrganization {
  if (!isPlainObject(value)) return false
  return (
    typeof value.deckId === 'string' &&
    value.deckId.length > 0 &&
    (value.folderId === undefined ||
      (typeof value.folderId === 'string' && value.folderId.length > 0)) &&
    Array.isArray(value.tagIds) &&
    value.tagIds.every((id) => typeof id === 'string' && id.length > 0) &&
    isIsoTimestamp(value.createdAt) &&
    isIsoTimestamp(value.updatedAt)
  )
}

export function createDeckBackup(
  decks: readonly Deck[],
  exportedAt = new Date().toISOString(),
): DeckBackupV1 {
  if (!isIsoTimestamp(exportedAt)) throw new Error('Invalid export timestamp.')
  const invalidIndex = decks.findIndex((deck) => !isValidBackupDeck(deck))
  if (invalidIndex >= 0) {
    throw new Error(`${invalidIndex + 1}件目のデッキが不正です。`)
  }
  return {
    format: DECK_BACKUP_FORMAT,
    version: DECK_BACKUP_VERSION,
    exportedAt,
    decks: [...decks].sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id),
    ),
  }
}

export function createDeckBackupV2(
  values: {
    decks: readonly Deck[]
    folders: readonly DeckFolder[]
    tags: readonly DeckTag[]
    organizations: readonly DeckOrganization[]
  },
  exportedAt = new Date().toISOString(),
): DeckBackupV2 {
  if (!isIsoTimestamp(exportedAt)) throw new Error('Invalid export timestamp.')
  if (!values.decks.every(isValidBackupDeck))
    throw new Error('Invalid deck backup.')
  if (!values.folders.every(isDeckFolder))
    throw new Error('Invalid folder backup.')
  if (!values.tags.every(isDeckTag)) throw new Error('Invalid tag backup.')
  if (!values.organizations.every(isDeckOrganization)) {
    throw new Error('Invalid organization backup.')
  }
  if (values.folders.length > DECK_FOLDER_MAX_COUNT) {
    throw new Error('Folder limit exceeded.')
  }
  if (values.tags.length > DECK_TAG_MAX_COUNT) {
    throw new Error('Tag limit exceeded.')
  }
  return {
    format: DECK_BACKUP_FORMAT,
    version: DECK_BACKUP_VERSION_V2,
    exportedAt,
    decks: [...values.decks].sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id),
    ),
    folders: [...values.folders].sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
    ),
    tags: [...values.tags].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    organizations: [...values.organizations].sort((left, right) =>
      left.deckId.localeCompare(right.deckId),
    ),
  }
}

export function serializeDeckBackup(backup: DeckBackup): string {
  return JSON.stringify(backup, null, 2)
}

export function createDeckBackupFilename(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `hlsieve-deck-backup-${year}-${month}-${day}.json`
}

export function parseDeckBackup(text: string): DeckBackupParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return {
      ok: false,
      message: 'バックアップファイルを読み込めませんでした。',
    }
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, message: 'このバックアップ形式には対応していません。' }
  }
  if (parsed.format !== DECK_BACKUP_FORMAT) {
    return { ok: false, message: 'このバックアップ形式には対応していません。' }
  }
  if (
    parsed.version !== DECK_BACKUP_VERSION &&
    parsed.version !== DECK_BACKUP_VERSION_V2
  ) {
    return { ok: false, message: 'このバックアップ形式には対応していません。' }
  }
  if (!isIsoTimestamp(parsed.exportedAt) || !Array.isArray(parsed.decks)) {
    return { ok: false, message: 'バックアップファイルの内容が不正です。' }
  }
  const invalidIndex = parsed.decks.findIndex(
    (deck) => !isValidBackupDeck(deck),
  )
  if (invalidIndex >= 0) {
    return {
      ok: false,
      message: `${invalidIndex + 1}件目のデッキが不正なため、読み込みを中止しました。`,
    }
  }
  const seenIds = new Set<string>()
  const duplicateIndex = parsed.decks.findIndex((deck) => {
    const id = (deck as Deck).id
    if (seenIds.has(id)) return true
    seenIds.add(id)
    return false
  })
  if (duplicateIndex >= 0) {
    return {
      ok: false,
      message: `${duplicateIndex + 1}件目のデッキIDが重複しているため、読み込みを中止しました。`,
    }
  }
  if (parsed.version === DECK_BACKUP_VERSION_V2) {
    if (
      !Array.isArray(parsed.folders) ||
      !Array.isArray(parsed.tags) ||
      !Array.isArray(parsed.organizations) ||
      !parsed.folders.every(isDeckFolder) ||
      !parsed.tags.every(isDeckTag) ||
      !parsed.organizations.every(isValidBackupOrganization) ||
      parsed.folders.length > DECK_FOLDER_MAX_COUNT ||
      parsed.tags.length > DECK_TAG_MAX_COUNT
    ) {
      return { ok: false, message: 'バックアップファイルの内容が不正です。' }
    }
    const hasDuplicateId = (values: readonly { id: string }[]) =>
      new Set(values.map(({ id }) => id)).size !== values.length
    if (
      hasDuplicateId(parsed.folders as DeckFolder[]) ||
      hasDuplicateId(parsed.tags as DeckTag[]) ||
      new Set(
        (parsed.organizations as DeckOrganization[]).map(
          ({ deckId }) => deckId,
        ),
      ).size !== parsed.organizations.length
    ) {
      return {
        ok: false,
        message: 'バックアップファイルのIDが重複しています。',
      }
    }
    return {
      ok: true,
      backup: {
        format: DECK_BACKUP_FORMAT,
        version: DECK_BACKUP_VERSION_V2,
        exportedAt: parsed.exportedAt,
        decks: parsed.decks as Deck[],
        folders: parsed.folders as DeckFolder[],
        tags: parsed.tags as DeckTag[],
        organizations: parsed.organizations as DeckOrganization[],
      },
    }
  }
  return {
    ok: true,
    backup: {
      format: DECK_BACKUP_FORMAT,
      version: DECK_BACKUP_VERSION,
      exportedAt: parsed.exportedAt,
      decks: parsed.decks as Deck[],
    },
  }
}

export type DeckBackupV2ImportWarnings = {
  missingFolderIds: string[]
  missingTagIds: string[]
  duplicateTagIdCount: number
}

/**
 * Whether an imported deck is the one already here.
 *
 * Stricter than the comparison the cloud uses: the timestamps and the stored
 * order count, because a backup is a copy of decks as they were rather than two
 * devices arriving at the same deck separately.
 *
 * The format is compared through the same rule as everywhere else, so that a
 * deck holding the same cards for a different tournament is imported rather
 * than skipped as a duplicate.
 */
export function hasSameDeckContent(left: Deck, right: Deck): boolean {
  return (
    left.name === right.name &&
    sameDeckRegulation(left.regulationId, right.regulationId) &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.entries.length === right.entries.length &&
    left.entries.every((entry, index) => {
      const other = right.entries[index]
      return (
        entry.cardNumber === other?.cardNumber &&
        entry.quantity === other.quantity
      )
    })
  )
}

/**
 * What importing one deck from a file does to the decks already here.
 *
 * `kept` means the id was free and the deck comes in as it is. `renamed` means
 * something else already holds that id and the copy comes in under a new one.
 * `skipped` means this deck is already here, and names the deck it matched, so
 * a caller carrying other records can point them at the deck that stayed.
 */
export type DeckImportOutcome =
  | { kind: 'kept'; deck: Deck; sourceId: DeckId }
  | { kind: 'renamed'; deck: Deck; sourceId: DeckId }
  | { kind: 'skipped'; sourceId: DeckId; matchedId: DeckId }

/**
 * Decides that for a whole file, in order.
 *
 * A deck whose id is free is taken at its word. Only a clash makes the contents
 * worth comparing, and then against the deck holding that id and against every
 * other deck known so far, including ones this same import has just renamed:
 * importing a file twice must not leave two copies of the same deck.
 *
 * Both backup formats go through this, so what counts as "already here" cannot
 * differ between them.
 */
export function planDeckImportOutcomes(
  imported: readonly Deck[],
  existing: readonly Deck[],
  createId: () => string = () => crypto.randomUUID(),
): DeckImportOutcome[] {
  const occupied = new Map(existing.map((deck) => [deck.id, deck]))
  const reservedIds = new Set([
    ...existing.map(({ id }) => id),
    ...imported.map(({ id }) => id),
  ])
  const known = [...existing]
  const outcomes: DeckImportOutcome[] = []

  for (const deck of imported) {
    const sameId = occupied.get(deck.id)
    if (!sameId) {
      outcomes.push({ kind: 'kept', deck, sourceId: deck.id })
      occupied.set(deck.id, deck)
      known.push(deck)
      continue
    }
    if (hasSameDeckContent(sameId, deck)) {
      outcomes.push({
        kind: 'skipped',
        sourceId: deck.id,
        matchedId: sameId.id,
      })
      continue
    }
    const elsewhere = known.find(
      (candidate) =>
        candidate.id !== deck.id && hasSameDeckContent(candidate, deck),
    )
    if (elsewhere) {
      outcomes.push({
        kind: 'skipped',
        sourceId: deck.id,
        matchedId: elsewhere.id,
      })
      continue
    }

    let generatedId = createId()
    while (!generatedId.trim() || reservedIds.has(generatedId)) {
      generatedId = createId()
    }
    const renamed = { ...deck, id: generatedId }
    outcomes.push({ kind: 'renamed', deck: renamed, sourceId: deck.id })
    occupied.set(generatedId, renamed)
    reservedIds.add(generatedId)
    known.push(renamed)
  }

  return outcomes
}

export function planDeckBackupImport(
  imported: readonly Deck[],
  existing: readonly Deck[],
  createId: () => string = () => crypto.randomUUID(),
): DeckImportPlan {
  const outcomes = planDeckImportOutcomes(imported, existing, createId)
  return {
    decks: outcomes
      .filter(
        (outcome): outcome is Extract<DeckImportOutcome, { deck: Deck }> =>
          outcome.kind !== 'skipped',
      )
      .map((outcome) => outcome.deck),
    newCount: outcomes.filter((outcome) => outcome.kind === 'kept').length,
    identicalCount: outcomes.filter((outcome) => outcome.kind === 'skipped')
      .length,
    conflictCount: outcomes.filter((outcome) => outcome.kind === 'renamed')
      .length,
  }
}
