import { describe, expect, it, vi } from 'vitest'

import type { Deck } from '../domain/decks/types'
import type { DeckVersion } from '../domain/deckVersions/types'
import {
  createDeckVersionRepository,
  type DeckVersionPersistenceAdapter,
} from './deckVersionRepository'

function deck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'deck-1',
    name: 'テストデッキ',
    entries: [{ cardNumber: 'CARD-001', quantity: 2 }],
    createdAt: '2026-09-20T00:00:00.000Z',
    updatedAt: '2026-09-22T00:00:00.000Z',
    ...overrides,
  }
}

function memoryPersistence(
  initial: unknown[] = [],
): DeckVersionPersistenceAdapter & { records: Map<string, unknown> } {
  const records = new Map(
    initial.map((record) => [(record as { id: string }).id, record]),
  )
  return {
    records,
    getAll: vi.fn(async () => [...records.values()]),
    get: vi.fn(async (id: string) => records.get(id)),
    put: vi.fn(async (value: DeckVersion) => {
      records.set(value.id, value)
    }),
    delete: vi.fn(async (id: string) => {
      records.delete(id)
    }),
  }
}

let counter = 0
const options = {
  id: () => `version-${++counter}`,
  now: () => '2026-09-25T02:30:00.000Z',
}

describe('keeping deck snapshots', () => {
  it('records the deck under the label it was given', async () => {
    counter = 0
    const persistence = memoryPersistence()
    const repository = createDeckVersionRepository(persistence, options)

    const version = await repository.createVersion(deck(), '大会前')

    expect(version).toEqual({
      id: 'version-1',
      deckId: 'deck-1',
      label: '大会前',
      createdAt: '2026-09-25T02:30:00.000Z',
      snapshot: {
        name: 'テストデッキ',
        entries: [{ cardNumber: 'CARD-001', quantity: 2 }],
      },
    })
    expect(persistence.put).toHaveBeenCalledWith(version)
  })

  // The moment it was kept is the one thing always worth saying.
  it('names an unlabelled snapshot after when it was taken', async () => {
    counter = 0
    const repository = createDeckVersionRepository(memoryPersistence(), options)

    expect((await repository.createVersion(deck())).label).toMatch(
      /^2026\/09\/25/,
    )
    expect((await repository.createVersion(deck(), '   ')).label).toMatch(
      /^2026\/09\/25/,
    )
  })

  it('keeps the format the deck was built for', async () => {
    counter = 0
    const repository = createDeckVersionRepository(memoryPersistence(), options)

    const version = await repository.createVersion(
      deck({ regulationId: 'selection-cup-2026-autumn' }),
      '大会用',
    )

    expect(version.snapshot.regulationId).toBe('selection-cup-2026-autumn')
  })

  it('refuses a label too long to show', async () => {
    counter = 0
    const repository = createDeckVersionRepository(memoryPersistence(), options)

    await expect(
      repository.createVersion(deck(), 'あ'.repeat(51)),
    ).rejects.toThrow()
  })

  it('does not touch the deck it copied', async () => {
    counter = 0
    const source = deck()
    const repository = createDeckVersionRepository(memoryPersistence(), options)

    const version = await repository.createVersion(source, '保存')
    source.entries[0]!.quantity = 99

    expect(version.snapshot.entries).toEqual([
      { cardNumber: 'CARD-001', quantity: 2 },
    ])
  })
})

describe('reading deck snapshots', () => {
  const stored = (
    id: string,
    deckId: string,
    createdAt: string,
  ): DeckVersion => ({
    id,
    deckId,
    label: id,
    createdAt,
    snapshot: { name: 'テストデッキ', entries: [] },
  })

  it('lists one deck s snapshots, newest first', async () => {
    const repository = createDeckVersionRepository(
      memoryPersistence([
        stored('a', 'deck-1', '2026-09-20T00:00:00.000Z'),
        stored('b', 'deck-1', '2026-09-24T00:00:00.000Z'),
        stored('c', 'deck-2', '2026-09-25T00:00:00.000Z'),
      ]),
    )

    expect((await repository.listVersions('deck-1')).map((v) => v.id)).toEqual([
      'b',
      'a',
    ])
  })

  it('reads one back by id', async () => {
    const repository = createDeckVersionRepository(
      memoryPersistence([stored('a', 'deck-1', '2026-09-20T00:00:00.000Z')]),
    )

    expect((await repository.getVersion('a'))?.id).toBe('a')
    expect(await repository.getVersion('missing')).toBeUndefined()
  })

  // A record the app cannot restore from is not offered as one it can.
  it('leaves out anything that is not a snapshot', async () => {
    const repository = createDeckVersionRepository(
      memoryPersistence([
        stored('a', 'deck-1', '2026-09-20T00:00:00.000Z'),
        { id: 'broken', deckId: 'deck-1' },
      ]),
    )

    expect((await repository.listVersions('deck-1')).map((v) => v.id)).toEqual([
      'a',
    ])
    expect(await repository.getVersion('broken')).toBeUndefined()
  })
})

describe('removing deck snapshots', () => {
  const stored = (id: string, deckId: string): DeckVersion => ({
    id,
    deckId,
    label: id,
    createdAt: '2026-09-20T00:00:00.000Z',
    snapshot: { name: 'テストデッキ', entries: [] },
  })

  it('removes one', async () => {
    const persistence = memoryPersistence([stored('a', 'deck-1')])
    const repository = createDeckVersionRepository(persistence)

    await repository.deleteVersion('a')

    expect(persistence.records.has('a')).toBe(false)
  })

  // A snapshot restores into one deck and nothing else, so deleting that deck
  // takes them with it.
  it('removes every snapshot belonging to one deck', async () => {
    const persistence = memoryPersistence([
      stored('a', 'deck-1'),
      stored('b', 'deck-1'),
      stored('c', 'deck-2'),
    ])
    const repository = createDeckVersionRepository(persistence)

    await repository.deleteVersionsForDeck('deck-1')

    expect([...persistence.records.keys()]).toEqual(['c'])
  })

  it('leaves another deck s snapshots alone', async () => {
    const persistence = memoryPersistence([
      stored('a', 'deck-1'),
      stored('c', 'deck-2'),
    ])
    const repository = createDeckVersionRepository(persistence)

    await repository.deleteVersionsForDeck('deck-2')

    expect([...persistence.records.keys()]).toEqual(['a'])
  })

  it('does nothing for a deck with none', async () => {
    const persistence = memoryPersistence([stored('a', 'deck-1')])
    const repository = createDeckVersionRepository(persistence)

    await repository.deleteVersionsForDeck('deck-9')

    expect(persistence.delete).not.toHaveBeenCalled()
  })
})
