import { describe, expect, it, vi } from 'vitest'

import type { Deck } from '../domain/decks/types'
import {
  createDeckRepository,
  type DeckPersistenceAdapter,
} from './deckRepository'

function deck(id: string, updatedAt = '2026-09-08T00:00:00.000Z'): Deck {
  return {
    id,
    name: `デッキ${id}`,
    entries: [{ cardNumber: 'CARD-001', quantity: 1 }],
    createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt,
  }
}

function memoryPersistence(initial: unknown[] = []): DeckPersistenceAdapter {
  const records = new Map(
    initial.map((record) => [(record as { id: string }).id, record]),
  )
  return {
    getAll: vi.fn(async () => [...records.values()]),
    get: vi.fn(async (id) => records.get(id)),
    put: vi.fn(async (value) => {
      records.set(value.id, value)
    }),
    addMany: vi.fn(async (values) => {
      for (const value of values) {
        if (records.has(value.id)) throw new Error('duplicate')
      }
      values.forEach((value: Deck) => records.set(value.id, value))
    }),
    delete: vi.fn(async (id) => {
      records.delete(id)
    }),
  }
}

describe('deckRepository', () => {
  it('saves, gets, updates, lists, and deletes decks', async () => {
    const persistence = memoryPersistence()
    const repository = createDeckRepository(persistence)
    await repository.saveDeck(deck('a'))
    await repository.saveDeck({ ...deck('a'), name: '更新済み' })
    await repository.saveDeck(deck('b', '2026-09-09T00:00:00.000Z'))

    await expect(repository.getDeck('a')).resolves.toMatchObject({
      name: '更新済み',
    })
    await expect(repository.listDecks()).resolves.toEqual([
      deck('b', '2026-09-09T00:00:00.000Z'),
      { ...deck('a'), name: '更新済み' },
    ])

    await repository.deleteDeck('a')
    await expect(repository.getDeck('a')).resolves.toBeUndefined()
  })

  it('rejects a malformed record returned by persistence', async () => {
    const repository = createDeckRepository(
      memoryPersistence([{ ...deck('bad'), entries: [] }, { id: 'broken' }]),
    )
    await expect(repository.getDeck('broken')).rejects.toThrow('invalid shape')
    await expect(repository.listDecks()).rejects.toThrow('invalid shape')
  })

  it('rejects an invalid deck before writing it', async () => {
    const persistence = memoryPersistence()
    const repository = createDeckRepository(persistence)
    await expect(
      repository.saveDeck({ ...deck('bad'), entries: [], name: ' ' }),
    ).rejects.toThrow('invalid shape')
    expect(persistence.put).not.toHaveBeenCalled()
  })

  it('propagates transaction failures', async () => {
    const failure = new Error('transaction failed')
    const persistence: DeckPersistenceAdapter = {
      getAll: vi.fn(async () => {
        throw failure
      }),
      get: vi.fn(async () => {
        throw failure
      }),
      put: vi.fn(async () => {
        throw failure
      }),
      addMany: vi.fn(async () => {
        throw failure
      }),
      delete: vi.fn(async () => {
        throw failure
      }),
    }
    const repository = createDeckRepository(persistence)

    await expect(repository.listDecks()).rejects.toBe(failure)
    await expect(repository.getDeck('a')).rejects.toBe(failure)
    await expect(repository.saveDeck(deck('a'))).rejects.toBe(failure)
    await expect(repository.importDecks([deck('a')])).rejects.toBe(failure)
    await expect(repository.deleteDeck('a')).rejects.toBe(failure)
  })

  it('validates and imports a Deck batch through add-only persistence', async () => {
    const persistence = memoryPersistence([deck('existing')])
    const repository = createDeckRepository(persistence)
    await repository.importDecks([deck('new-a'), deck('new-b')])
    expect(persistence.addMany).toHaveBeenCalledWith([
      deck('new-a'),
      deck('new-b'),
    ])
    await expect(repository.importDecks([deck('existing')])).rejects.toThrow(
      'duplicate',
    )
    await expect(repository.listDecks()).resolves.toContainEqual(
      deck('existing'),
    )
  })
})

/**
 * A deck built for a tournament, through the local store.
 *
 * The format is stored with the deck rather than beside it, so it survives
 * without the store knowing about formats. An id this build does not define
 * survives too: a deck built under a format that has since been removed is
 * still that deck, and rewriting it on read would be the store deciding
 * something the reporter did not.
 */
describe('a deck that names a format', () => {
  const tournament = (id: string, regulationId: string): Deck => ({
    ...deck(id),
    regulationId,
  })

  it('keeps the format through a save and a read', async () => {
    const repository = createDeckRepository(memoryPersistence())

    await repository.saveDeck(tournament('a', 'selection-cup-2026-osaka'))

    expect((await repository.getDeck('a'))?.regulationId).toBe(
      'selection-cup-2026-osaka',
    )
    expect((await repository.listDecks())[0]?.regulationId).toBe(
      'selection-cup-2026-osaka',
    )
  })

  it('keeps an id it does not recognise', async () => {
    const repository = createDeckRepository(memoryPersistence())

    await repository.saveDeck(tournament('a', 'future-or-removed-rule'))

    expect((await repository.getDeck('a'))?.regulationId).toBe(
      'future-or-removed-rule',
    )
  })

  it('reads a deck stored before formats existed', async () => {
    const repository = createDeckRepository(memoryPersistence([deck('a')]))

    const stored = await repository.getDeck('a')

    expect(stored).toBeDefined()
    expect(stored?.regulationId).toBeUndefined()
  })

  it('refuses a stored deck whose format is not a string', async () => {
    const repository = createDeckRepository(
      memoryPersistence([{ ...deck('a'), regulationId: 7 }]),
    )

    await expect(repository.getDeck('a')).rejects.toThrow()
  })

  it('keeps the format through an import', async () => {
    const repository = createDeckRepository(memoryPersistence())

    await repository.importDecks([tournament('a', 'selection-cup-2026-osaka')])

    expect((await repository.getDeck('a'))?.regulationId).toBe(
      'selection-cup-2026-osaka',
    )
  })
})
