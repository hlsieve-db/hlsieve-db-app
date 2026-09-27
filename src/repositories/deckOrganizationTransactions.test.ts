import { describe, expect, it } from 'vitest'

import {
  STORE_DECK_FOLDERS,
  STORE_DECK_ORGANIZATIONS,
  STORE_DECK_TAGS,
  STORE_DECKS,
} from '../domain/decks/constants'
import type { Deck } from '../domain/decks/types'
import type {
  DeckFolder,
  DeckOrganization,
  DeckTag,
} from '../domain/deckOrganization/types'
import { createIndexedDbDeckOrganizationTransactions } from './deckOrganizationTransactions'

const AT = '2026-09-20T00:00:00.000Z'
const LATER = '2026-09-21T00:00:00.000Z'

const KEY_PATHS: Record<string, string> = {
  [STORE_DECKS]: 'id',
  [STORE_DECK_FOLDERS]: 'id',
  [STORE_DECK_TAGS]: 'id',
  [STORE_DECK_ORGANIZATIONS]: 'deckId',
}

type Row = Record<string, unknown>

/**
 * A stand-in that commits a transaction only once every request in it has
 * succeeded, and throws the staged writes away on failure. Without that, a
 * test cannot tell an atomic operation from a sequence of separate writes.
 */
function atomicFactory(seed: Record<string, Row[]> = {}) {
  const stores = new Map<string, Map<string, Row>>(
    Object.keys(KEY_PATHS).map((name) => [
      name,
      new Map(
        (seed[name] ?? []).map((row) => [
          row[KEY_PATHS[name] as string] as string,
          row,
        ]),
      ),
    ]),
  )

  const database = {
    objectStoreNames: { contains: () => true },
    transaction: (names: string | string[]) => {
      const opened = typeof names === 'string' ? [names] : names
      const staged = new Map<string, Map<string, Row | undefined>>(
        opened.map((name) => [name, new Map()]),
      )
      const requests: { onsuccess: (() => void) | null; result: unknown }[] = []
      let failure: Error | undefined

      const view = (name: string) => {
        const committed = stores.get(name)
        if (!committed) throw new Error(`unknown store ${name}`)
        return { committed, pending: staged.get(name) }
      }
      const current = (name: string, key: string) => {
        const { committed, pending } = view(name)
        if (pending?.has(key)) return pending.get(key)
        return committed.get(key)
      }
      const settle = (result: unknown) => {
        const request = { onsuccess: null as (() => void) | null, result }
        requests.push(request)
        return request as unknown as IDBRequest
      }

      const transaction = {
        get error() {
          return failure ?? null
        },
        objectStore: (name: string) => {
          if (!staged.has(name)) {
            throw new Error(`store ${name} is not in this transaction`)
          }
          const keyPath = KEY_PATHS[name] as string
          return {
            add: (value: Row) => {
              const key = value[keyPath] as string
              if (current(name, key) !== undefined) {
                failure = new Error('duplicate')
              } else {
                staged.get(name)?.set(key, value)
              }
              return settle(undefined)
            },
            put: (value: Row) => {
              staged.get(name)?.set(value[keyPath] as string, value)
              return settle(undefined)
            },
            delete: (key: string) => {
              staged.get(name)?.set(key, undefined)
              return settle(undefined)
            },
            get: (key: string) => settle(current(name, key)),
            getAll: () => {
              const { committed, pending } = view(name)
              const merged = new Map(committed)
              for (const [key, value] of pending ?? []) {
                if (value === undefined) merged.delete(key)
                else merged.set(key, value)
              }
              return settle([...merged.values()])
            },
          }
        },
        abort: () => {
          failure ??= new Error('aborted')
        },
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onabort: null as (() => void) | null,
      }

      queueMicrotask(() => {
        // A callback may queue further requests, as the delete cascades do.
        for (let index = 0; index < requests.length; index += 1) {
          if (failure) break
          requests[index]?.onsuccess?.()
        }
        if (failure) {
          transaction.onabort?.()
          return
        }
        for (const [name, pending] of staged) {
          const committed = stores.get(name)
          for (const [key, value] of pending) {
            if (value === undefined) committed?.delete(key)
            else committed?.set(key, value)
          }
        }
        transaction.oncomplete?.()
      })
      return transaction
    },
  } as unknown as IDBDatabase

  const factory = {
    open: () => {
      const request = {
        result: database,
        onsuccess: null as (() => void) | null,
        onerror: null,
        onblocked: null,
        onupgradeneeded: null,
      }
      queueMicrotask(() => request.onsuccess?.())
      return request
    },
  }

  return {
    transactions: createIndexedDbDeckOrganizationTransactions(
      factory as unknown as IDBFactory,
    ),
    rowsIn: (name: string) => [...(stores.get(name)?.values() ?? [])],
  }
}

const deck = (id: string, overrides: Partial<Deck> = {}): Deck => ({
  id,
  name: `デッキ${id}`,
  entries: [{ cardNumber: 'CARD-001', quantity: 2 }],
  createdAt: AT,
  updatedAt: AT,
  ...overrides,
})

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

describe('removing a folder', () => {
  it('takes it off every deck in it, and keeps the decks', async () => {
    const { transactions, rowsIn } = atomicFactory({
      [STORE_DECK_FOLDERS]: [folder('f1', '大会用'), folder('f2', '練習用')],
      [STORE_DECK_ORGANIZATIONS]: [
        organization('deck-1', { folderId: 'f1', tagIds: ['t1'] }),
        organization('deck-2', { folderId: 'f2' }),
      ],
      [STORE_DECKS]: [deck('deck-1'), deck('deck-2')],
    })

    await expect(transactions.deleteFolder('f1', LATER)).resolves.toBe(1)

    expect(rowsIn(STORE_DECK_FOLDERS).map((row) => row.id)).toEqual(['f2'])
    expect(rowsIn(STORE_DECKS)).toHaveLength(2)
    expect(rowsIn(STORE_DECK_ORGANIZATIONS)).toEqual([
      // No folder at all, rather than one that no longer exists.
      { ...organization('deck-1', { tagIds: ['t1'] }), updatedAt: LATER },
      organization('deck-2', { folderId: 'f2' }),
    ])
  })

  it('reports no change when no deck was in it', async () => {
    const { transactions } = atomicFactory({
      [STORE_DECK_FOLDERS]: [folder('f1', '大会用')],
    })

    await expect(transactions.deleteFolder('f1')).resolves.toBe(0)
  })
})

describe('removing a tag', () => {
  it('takes it off every deck carrying it, leaving the others in order', async () => {
    const { transactions, rowsIn } = atomicFactory({
      [STORE_DECK_TAGS]: [tag('t1', '赤'), tag('t2', '青')],
      [STORE_DECK_ORGANIZATIONS]: [
        organization('deck-1', { tagIds: ['t1', 't2'] }),
        organization('deck-2', { tagIds: ['t2'] }),
      ],
    })

    await expect(transactions.deleteTag('t1', LATER)).resolves.toBe(1)

    expect(rowsIn(STORE_DECK_TAGS).map((row) => row.id)).toEqual(['t2'])
    expect(rowsIn(STORE_DECK_ORGANIZATIONS)).toEqual([
      { ...organization('deck-1', { tagIds: ['t2'] }), updatedAt: LATER },
      organization('deck-2', { tagIds: ['t2'] }),
    ])
  })
})

describe('removing a deck', () => {
  it('removes what it was organized by at the same time', async () => {
    const { transactions, rowsIn } = atomicFactory({
      [STORE_DECKS]: [deck('deck-1'), deck('deck-2')],
      [STORE_DECK_ORGANIZATIONS]: [
        organization('deck-1'),
        organization('deck-2'),
      ],
    })

    await transactions.deleteDeck('deck-1')

    expect(rowsIn(STORE_DECKS).map((row) => row.id)).toEqual(['deck-2'])
    expect(rowsIn(STORE_DECK_ORGANIZATIONS).map((row) => row.deckId)).toEqual([
      'deck-2',
    ])
  })
})

describe('copying a deck', () => {
  it('writes the copy and its organization together', async () => {
    const { transactions, rowsIn } = atomicFactory({
      [STORE_DECKS]: [deck('deck-1')],
    })

    await transactions.duplicateDeck(
      deck('copy'),
      organization('copy', { tagIds: ['t1'] }),
    )

    expect(rowsIn(STORE_DECKS).map((row) => row.id)).toEqual(['deck-1', 'copy'])
    expect(rowsIn(STORE_DECK_ORGANIZATIONS)).toEqual([
      organization('copy', { tagIds: ['t1'] }),
    ])
  })

  // Nothing at all, not a deck with someone else's organization on it.
  it('writes neither when the deck id is already taken', async () => {
    const { transactions, rowsIn } = atomicFactory({
      [STORE_DECKS]: [deck('deck-1')],
    })

    await expect(
      transactions.duplicateDeck(deck('deck-1'), organization('deck-1')),
    ).rejects.toThrow()

    expect(rowsIn(STORE_DECKS)).toEqual([deck('deck-1')])
    expect(rowsIn(STORE_DECK_ORGANIZATIONS)).toEqual([])
  })

  it('refuses an organization that describes another deck', async () => {
    const { transactions, rowsIn } = atomicFactory()

    await expect(
      transactions.duplicateDeck(deck('copy'), organization('other')),
    ).rejects.toThrow()

    expect(rowsIn(STORE_DECKS)).toEqual([])
  })
})

describe('importing a backup', () => {
  const values = {
    decks: [deck('a'), deck('b')],
    folders: [folder('f1', '大会用')],
    tags: [tag('t1', '赤')],
    organizations: [organization('a', { folderId: 'f1', tagIds: ['t1'] })],
  }

  it('writes decks, folders, tags and organizations in one go', async () => {
    const { transactions, rowsIn } = atomicFactory()

    await transactions.importAll(values)

    expect(rowsIn(STORE_DECKS)).toHaveLength(2)
    expect(rowsIn(STORE_DECK_FOLDERS)).toHaveLength(1)
    expect(rowsIn(STORE_DECK_TAGS)).toHaveLength(1)
    expect(rowsIn(STORE_DECK_ORGANIZATIONS)).toHaveLength(1)
  })

  // A half-written import would leave folders nothing points at, or decks the
  // reporter cannot find, so the collection stays as it was.
  it('changes nothing when one record cannot be added', async () => {
    const { transactions, rowsIn } = atomicFactory({
      [STORE_DECK_TAGS]: [tag('t1', '既存')],
    })

    await expect(transactions.importAll(values)).rejects.toThrow()

    expect(rowsIn(STORE_DECKS)).toEqual([])
    expect(rowsIn(STORE_DECK_FOLDERS)).toEqual([])
    expect(rowsIn(STORE_DECK_ORGANIZATIONS)).toEqual([])
    expect(rowsIn(STORE_DECK_TAGS)).toEqual([tag('t1', '既存')])
  })

  it('refuses a record the app could not read back, before writing any', async () => {
    const { transactions, rowsIn } = atomicFactory()

    await expect(
      transactions.importAll({
        ...values,
        folders: [folder('f1', '  spaced  ')],
      }),
    ).rejects.toThrow()

    expect(rowsIn(STORE_DECKS)).toEqual([])
  })
})
