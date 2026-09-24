import { describe, expect, it } from 'vitest'

import type { Deck } from './types'
import {
  createDeckBackup,
  createDeckBackupFilename,
  DECK_BACKUP_FORMAT,
  DECK_BACKUP_VERSION,
  hasSameDeckContent,
  parseDeckBackup,
  planDeckBackupImport,
  serializeDeckBackup,
} from './backup'

function deck(
  id: string,
  name = `デッキ${id}`,
  overrides: Partial<Deck> = {},
): Deck {
  return {
    id,
    name,
    entries: [
      { cardNumber: 'CARD-002', quantity: 2 },
      { cardNumber: 'UNKNOWN-001', quantity: 1 },
    ],
    createdAt: '2026-09-12T00:00:00.000Z',
    updatedAt: '2026-09-13T00:00:00.000Z',
    ...overrides,
  }
}

const json = (value: unknown) => JSON.stringify(value)

describe('Deck backup export', () => {
  it('creates readable versioned JSON with every field and deterministic Deck order', () => {
    const later = deck('b', '日本語デッキ')
    const earlier = deck('a', '先のデッキ', {
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
    })
    const backup = createDeckBackup(
      [later, earlier],
      '2026-09-13T00:00:00.000Z',
    )

    expect(backup).toMatchObject({
      format: DECK_BACKUP_FORMAT,
      version: DECK_BACKUP_VERSION,
      exportedAt: '2026-09-13T00:00:00.000Z',
    })
    expect(backup.decks.map(({ id }) => id)).toEqual(['a', 'b'])
    expect(backup.decks[1]).toEqual(later)
    expect(backup.decks[1]?.entries).toEqual(later.entries)
    expect(serializeDeckBackup(backup)).toContain('\n  "decks"')
    expect(serializeDeckBackup(backup)).toContain('日本語デッキ')
    expect(backup).not.toHaveProperty('reports')
    expect(backup).not.toHaveProperty('theme')
    expect(backup).not.toHaveProperty('selectedDeckId')
  })

  it('supports an empty export model and uses a safe local-date filename', () => {
    expect(createDeckBackup([], '2026-09-13T00:00:00.000Z').decks).toEqual([])
    expect(createDeckBackupFilename(new Date(2026, 8, 13))).toBe(
      'hlsieve-deck-backup-2026-09-13.json',
    )
  })
})

describe('Deck backup parser and atomic validation', () => {
  const valid = () =>
    createDeckBackup([deck('one')], '2026-09-13T00:00:00.000Z')

  it('accepts a structurally valid Deck with unknown cards and preserves entry order', () => {
    const result = parseDeckBackup(json(valid()))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(
        result.backup.decks[0]?.entries.map(({ cardNumber }) => cardNumber),
      ).toEqual(['CARD-002', 'UNKNOWN-001'])
    }
  })

  it.each([
    ['invalid JSON', '{', '読み込めません'],
    ['wrong format', json({ ...valid(), format: 'other' }), '対応していません'],
    ['future version', json({ ...valid(), version: 2 }), '対応していません'],
    [
      'invalid exportedAt',
      json({ ...valid(), exportedAt: 'today' }),
      '内容が不正',
    ],
    ['decks not array', json({ ...valid(), decks: {} }), '内容が不正'],
  ])('rejects %s without partial data', (_label, input, message) => {
    expect(parseDeckBackup(input)).toEqual({
      ok: false,
      message: expect.stringContaining(message),
    })
  })

  it.each([
    ['empty ID', (value: Deck) => (value.id = '')],
    ['empty name', (value: Deck) => (value.name = ' ')],
    ['invalid createdAt', (value: Deck) => (value.createdAt = '2026-09-13')],
    ['invalid updatedAt', (value: Deck) => (value.updatedAt = 'today')],
    [
      'entries not array',
      (value: Deck) => (value.entries = {} as Deck['entries']),
    ],
    [
      'invalid card number',
      (value: Deck) => (value.entries[0]!.cardNumber = ' '),
    ],
    [
      'fractional quantity',
      (value: Deck) => (value.entries[0]!.quantity = 1.5),
    ],
    ['zero quantity', (value: Deck) => (value.entries[0]!.quantity = 0)],
    ['negative quantity', (value: Deck) => (value.entries[0]!.quantity = -1)],
    [
      'duplicate entry',
      (value: Deck) => value.entries.push({ ...value.entries[0]! }),
    ],
  ])('rejects all Decks when one Deck has %s', (_label, mutate) => {
    const invalid = deck('bad')
    mutate(invalid)
    expect(
      parseDeckBackup(json({ ...valid(), decks: [deck('good'), invalid] })),
    ).toEqual({
      ok: false,
      message: '2件目のデッキが不正なため、読み込みを中止しました。',
    })
  })

  it('rejects duplicate Deck IDs atomically', () => {
    const input = {
      ...valid(),
      decks: [deck('same'), deck('same', '別内容')],
    }

    expect(parseDeckBackup(json(input))).toEqual({
      ok: false,
      message: '2件目のデッキIDが重複しているため、読み込みを中止しました。',
    })
  })
})

describe('Deck backup conflict planning', () => {
  it('compares semantic content independently of ID and property insertion order', () => {
    const left = deck('left')
    const right = {
      ...deck('right', left.name),
      entries: left.entries.map((entry) => ({ ...entry })),
    }
    expect(hasSameDeckContent(left, right)).toBe(true)
    expect(
      hasSameDeckContent(left, {
        ...right,
        entries: [...right.entries].reverse(),
      }),
    ).toBe(false)
  })

  it('preserves new IDs and skips an identical same-ID Deck', () => {
    const same = deck('same')
    const fresh = deck('fresh')
    expect(planDeckBackupImport([same, fresh], [same])).toEqual({
      decks: [fresh],
      newCount: 1,
      identicalCount: 1,
      conflictCount: 0,
    })
  })

  it('protects an existing conflict and assigns a collision-free ID', () => {
    const existing = deck('same', '既存')
    const incoming = deck('same', '復元')
    const ids = ['same', 'future', 'generated']
    const plan = planDeckBackupImport(
      [incoming, deck('future')],
      [existing],
      () => ids.shift() ?? 'unused',
    )
    expect(plan.decks).toEqual([
      { ...incoming, id: 'generated' },
      deck('future'),
    ])
    expect(plan).toMatchObject({
      newCount: 1,
      identicalCount: 0,
      conflictCount: 1,
    })
    expect(existing.name).toBe('既存')
  })

  it('keeps normal and conflict imports idempotent on re-import', () => {
    const local = deck('same', '既存')
    const incoming = deck('same', '復元')
    const first = planDeckBackupImport([incoming], [local], () => 'generated')
    expect(
      planDeckBackupImport(
        [incoming],
        [local, ...first.decks],
        () => 'another',
      ),
    ).toEqual({
      decks: [],
      newCount: 0,
      identicalCount: 1,
      conflictCount: 0,
    })
  })

  it('skips matching content already imported under another ID during conflict', () => {
    const incoming = deck('same', '復元')
    expect(
      planDeckBackupImport(
        [incoming],
        [deck('same', '既存'), { ...incoming, id: 'already-restored' }],
      ),
    ).toEqual({ decks: [], newCount: 0, identicalCount: 1, conflictCount: 0 })
  })
})

const EXPORTED_AT = '2026-09-24T00:00:00.000Z'

/**
 * Backups and the format a deck is built for.
 *
 * A backup stores the deck as it is, so the format travels with it without the
 * file format changing. A deck holding the same cards for a different
 * tournament is a different deck and must not be skipped as a duplicate.
 */
describe('the format a deck is built for, through a backup', () => {
  const selection = 'selection-cup-2026-autumn'

  const tournamentDeck = (overrides: Partial<Deck> = {}): Deck => ({
    ...deck('a'),
    regulationId: selection,
    ...overrides,
  })

  it('writes the format out and reads it back', () => {
    const backup = createDeckBackup([tournamentDeck()], EXPORTED_AT)
    const parsed = parseDeckBackup(serializeDeckBackup(backup))

    expect(parsed.ok).toBe(true)
    expect(parsed.ok && parsed.backup.decks[0]?.regulationId).toBe(selection)
    // The file format did not have to change to carry it.
    expect(backup.version).toBe(1)
  })

  it('keeps an id this build does not define', () => {
    const parsed = parseDeckBackup(
      serializeDeckBackup(
        createDeckBackup(
          [tournamentDeck({ regulationId: 'future-or-removed-rule' })],
          EXPORTED_AT,
        ),
      ),
    )

    expect(parsed.ok && parsed.backup.decks[0]?.regulationId).toBe(
      'future-or-removed-rule',
    )
  })

  // A file written before formats existed is a file of ordinary decks.
  it('reads a backup that names no format', () => {
    const parsed = parseDeckBackup(
      serializeDeckBackup(createDeckBackup([deck('a')], EXPORTED_AT)),
    )

    expect(parsed.ok).toBe(true)
    expect(parsed.ok && parsed.backup.decks[0]?.regulationId).toBeUndefined()
  })

  it('imports a deck whose only difference is the tournament it is for', () => {
    const plan = planDeckBackupImport(
      [tournamentDeck()],
      [deck('a')],
      () => 'generated-id',
    )

    expect(plan.identicalCount).toBe(0)
    expect(plan.conflictCount).toBe(1)
    expect(plan.decks[0]?.regulationId).toBe(selection)
  })

  it('skips a deck that differs only in how ordinary construction is spelled', () => {
    const plan = planDeckBackupImport(
      [{ ...deck('a'), regulationId: 'standard' }],
      [deck('a')],
      () => 'generated-id',
    )

    expect(plan.identicalCount).toBe(1)
    expect(plan.decks).toEqual([])
  })

  it('skips a deck already here for the same tournament', () => {
    const plan = planDeckBackupImport(
      [tournamentDeck()],
      [tournamentDeck()],
      () => 'generated-id',
    )

    expect(plan.identicalCount).toBe(1)
  })

  // The copy made to resolve an id clash is the same deck, tournament included.
  it('keeps the format on a deck imported under a new id', () => {
    const plan = planDeckBackupImport(
      [tournamentDeck({ name: '別の名前' })],
      [deck('a')],
      () => 'generated-id',
    )

    expect(plan.decks[0]?.id).toBe('generated-id')
    expect(plan.decks[0]?.regulationId).toBe(selection)
  })
})
