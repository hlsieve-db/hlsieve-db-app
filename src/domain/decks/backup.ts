import { sameDeckRegulation } from '../regulations/deckRegulationId'
import type { Deck } from './types'
import { isDeck } from './validation'

export const DECK_BACKUP_FORMAT = 'hlsieve-deck-backup' as const
export const DECK_BACKUP_VERSION = 1 as const
export const MAX_DECK_BACKUP_FILE_SIZE = 5 * 1024 * 1024

export type DeckBackup = {
  format: typeof DECK_BACKUP_FORMAT
  version: typeof DECK_BACKUP_VERSION
  exportedAt: string
  decks: Deck[]
}

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

export function createDeckBackup(
  decks: readonly Deck[],
  exportedAt = new Date().toISOString(),
): DeckBackup {
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
  if (
    parsed.format !== DECK_BACKUP_FORMAT ||
    parsed.version !== DECK_BACKUP_VERSION
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

export function planDeckBackupImport(
  imported: readonly Deck[],
  existing: readonly Deck[],
  createId: () => string = () => crypto.randomUUID(),
): DeckImportPlan {
  const occupied = new Map(existing.map((deck) => [deck.id, deck]))
  const reservedIds = new Set([
    ...existing.map(({ id }) => id),
    ...imported.map(({ id }) => id),
  ])
  const known = [...existing]
  const decks: Deck[] = []
  let newCount = 0
  let identicalCount = 0
  let conflictCount = 0

  for (const deck of imported) {
    const sameId = occupied.get(deck.id)
    if (!sameId) {
      decks.push(deck)
      occupied.set(deck.id, deck)
      known.push(deck)
      newCount += 1
      continue
    }
    if (
      hasSameDeckContent(sameId, deck) ||
      known.some(
        (candidate) =>
          candidate.id !== deck.id && hasSameDeckContent(candidate, deck),
      )
    ) {
      identicalCount += 1
      continue
    }

    let generatedId = createId()
    while (!generatedId.trim() || reservedIds.has(generatedId)) {
      generatedId = createId()
    }
    const renamed = { ...deck, id: generatedId }
    decks.push(renamed)
    occupied.set(generatedId, renamed)
    reservedIds.add(generatedId)
    known.push(renamed)
    conflictCount += 1
  }

  return { decks, newCount, identicalCount, conflictCount }
}
