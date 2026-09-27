import { describe, expect, it, vi } from 'vitest'

import type {
  DeckFolder,
  DeckOrganization,
  DeckTag,
} from '../domain/deckOrganization/types'
import {
  createDeckFolderRepository,
  type DeckFolderPersistence,
} from './deckFolderRepository'
import {
  createDeckOrganizationRepository,
  type DeckOrganizationPersistence,
} from './deckOrganizationRepository'
import {
  createDeckTagRepository,
  type DeckTagPersistence,
} from './deckTagRepository'

const AT = '2026-09-20T00:00:00.000Z'

const folder = (id: string, name: string, sortOrder = 1): DeckFolder => ({
  id,
  name,
  sortOrder,
  createdAt: AT,
  updatedAt: AT,
})

const tag = (id: string, name: string): DeckTag => ({
  id,
  name,
  createdAt: AT,
  updatedAt: AT,
})

const organization = (
  deckId: string,
  overrides: Partial<DeckOrganization> = {},
): DeckOrganization => ({
  deckId,
  tagIds: [],
  createdAt: AT,
  updatedAt: AT,
  ...overrides,
})

function memoryPersistence(initial: unknown[] = [], keyPath = 'id') {
  const records = new Map(
    initial.map((record) => [
      (record as Record<string, string>)[keyPath] as string,
      record,
    ]),
  )
  return {
    records,
    getAll: vi.fn(async () => [...records.values()]),
    get: vi.fn(async (id: string) => records.get(id)),
    put: vi.fn(async (value: Record<string, string>) => {
      records.set(value[keyPath] as string, value)
    }),
    addMany: vi.fn(async (values: readonly Record<string, string>[]) => {
      for (const value of values) records.set(value[keyPath] as string, value)
    }),
    delete: vi.fn(async (id: string) => {
      records.delete(id)
    }),
  }
}

function transactions(overrides: Record<string, unknown> = {}) {
  return {
    deleteFolder: vi.fn(async () => 0),
    deleteTag: vi.fn(async () => 0),
    saveFolderOrder: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('the folders this device holds', () => {
  it('lists them by order, then by id', () => {
    const repository = createDeckFolderRepository(
      memoryPersistence([
        folder('b', '二', 2),
        folder('a', '一', 2),
        folder('c', '三', 1),
      ]) as unknown as DeckFolderPersistence,
      transactions(),
    )

    return expect(
      repository.listFolders().then((folders) => folders.map((f) => f.id)),
    ).resolves.toEqual(['c', 'a', 'b'])
  })

  it('refuses to store a folder the app could not read back', async () => {
    const repository = createDeckFolderRepository(
      memoryPersistence() as unknown as DeckFolderPersistence,
      transactions(),
    )

    await expect(
      repository.saveFolder(folder('a', '  spaced  ')),
    ).rejects.toThrow()
  })

  // Removing the definition and taking it off every deck is one operation, so
  // the repository cannot offer half of it.
  it('deletes through the transaction, and says how many decks changed', async () => {
    const deleteFolder = vi.fn(async () => 3)
    const repository = createDeckFolderRepository(
      memoryPersistence() as unknown as DeckFolderPersistence,
      transactions({ deleteFolder }),
    )

    await expect(repository.deleteFolder('f1', AT)).resolves.toBe(3)
    expect(deleteFolder).toHaveBeenCalledWith('f1', AT)
  })

  it('writes a whole reorder in one go', async () => {
    const saveFolderOrder = vi.fn(async () => undefined)
    const repository = createDeckFolderRepository(
      memoryPersistence() as unknown as DeckFolderPersistence,
      transactions({ saveFolderOrder }),
    )
    const order = [folder('a', '一', 1), folder('b', '二', 2)]

    await repository.saveFolderOrder(order)

    expect(saveFolderOrder).toHaveBeenCalledWith(order)
  })
})

describe('the tags this device holds', () => {
  it('lists them by name, as a reader would expect', async () => {
    const repository = createDeckTagRepository(
      memoryPersistence([
        tag('b', 'ｂタグ'),
        tag('a', 'Aタグ'),
      ]) as unknown as DeckTagPersistence,
      transactions(),
    )

    expect((await repository.listTags()).map((value) => value.id)).toEqual([
      'a',
      'b',
    ])
  })

  it('deletes through the transaction, and says how many decks changed', async () => {
    const deleteTag = vi.fn(async () => 2)
    const repository = createDeckTagRepository(
      memoryPersistence() as unknown as DeckTagPersistence,
      transactions({ deleteTag }),
    )

    await expect(repository.deleteTag('t1', AT)).resolves.toBe(2)
    expect(deleteTag).toHaveBeenCalledWith('t1', AT)
  })
})

describe('the organization rows this device holds', () => {
  it('reads one back by deck', async () => {
    const repository = createDeckOrganizationRepository(
      memoryPersistence(
        [organization('deck-1', { tagIds: ['t1'] })],
        'deckId',
      ) as unknown as DeckOrganizationPersistence,
    )

    expect((await repository.getOrganization('deck-1'))?.tagIds).toEqual(['t1'])
    expect(await repository.getOrganization('deck-2')).toBeUndefined()
  })

  // An empty row is a deck the reporter cleared, which is not the same as a
  // deck that never had one.
  it('keeps an empty row rather than treating it as absent', async () => {
    const persistence = memoryPersistence([], 'deckId')
    const repository = createDeckOrganizationRepository(
      persistence as unknown as DeckOrganizationPersistence,
    )

    await repository.saveOrganization(organization('deck-1'))

    expect(await repository.getOrganization('deck-1')).toEqual(
      organization('deck-1'),
    )
  })

  it('refuses a row the app could not read back', async () => {
    const repository = createDeckOrganizationRepository(
      memoryPersistence([], 'deckId') as unknown as DeckOrganizationPersistence,
    )

    await expect(
      repository.saveOrganization(
        organization('deck-1', { tagIds: ['t2', 't1'] }),
      ),
    ).rejects.toThrow()
  })
})
