import { describe, expect, it, vi } from 'vitest'

import type { FavoriteCard } from '../domain/favorites/types'
import {
  createFavoriteCardRepository,
  type FavoriteCardPersistenceAdapter,
} from './favoriteCardRepository'

function memoryPersistence(
  initial: unknown[] = [],
): FavoriteCardPersistenceAdapter {
  const records = new Map(
    initial.map((value) => [
      (value as { cardNumber: string }).cardNumber,
      value,
    ]),
  )
  return {
    getAll: vi.fn(async () => [...records.values()]),
    get: vi.fn(async (cardNumber) => records.get(cardNumber)),
    put: vi.fn(async (favorite) => {
      records.set(favorite.cardNumber, favorite)
    }),
    delete: vi.fn(async (cardNumber) => {
      records.delete(cardNumber)
    }),
  }
}

describe('favoriteCardRepository', () => {
  it('adds, gets, lists newest first, and removes logical Cards', async () => {
    const persistence = memoryPersistence()
    const times = ['2026-09-14T00:00:00.000Z', '2026-09-15T00:00:00.000Z']
    const repository = createFavoriteCardRepository(persistence, {
      now: () => times.shift()!,
    })

    await repository.addFavorite('CARD-A')
    await repository.addFavorite('CARD-B')
    await expect(repository.getFavorite('CARD-A')).resolves.toEqual({
      cardNumber: 'CARD-A',
      createdAt: '2026-09-14T00:00:00.000Z',
    })
    await expect(repository.listFavorites()).resolves.toEqual([
      { cardNumber: 'CARD-B', createdAt: '2026-09-15T00:00:00.000Z' },
      { cardNumber: 'CARD-A', createdAt: '2026-09-14T00:00:00.000Z' },
    ])

    await repository.removeFavorite('CARD-A')
    await expect(repository.getFavorite('CARD-A')).resolves.toBeUndefined()
  })

  it('is idempotent and preserves the original createdAt', async () => {
    const existing: FavoriteCard = {
      cardNumber: 'CARD-A',
      createdAt: '2026-09-14T00:00:00.000Z',
    }
    const persistence = memoryPersistence([existing])
    const repository = createFavoriteCardRepository(persistence, {
      now: () => '2026-09-15T00:00:00.000Z',
    })

    await expect(repository.addFavorite('CARD-A')).resolves.toEqual(existing)
    expect(persistence.put).not.toHaveBeenCalled()
  })

  it('uses cardNumber ascending as the stable tie-breaker', async () => {
    const createdAt = '2026-09-14T00:00:00.000Z'
    const repository = createFavoriteCardRepository(
      memoryPersistence([
        { cardNumber: 'CARD-B', createdAt },
        { cardNumber: 'CARD-A', createdAt },
      ]),
    )
    await expect(repository.listFavorites()).resolves.toEqual([
      { cardNumber: 'CARD-A', createdAt },
      { cardNumber: 'CARD-B', createdAt },
    ])
  })

  it('rejects malformed persisted records and propagates failures', async () => {
    const malformed = createFavoriteCardRepository(
      memoryPersistence([{ cardNumber: '', createdAt: 'invalid' }]),
    )
    await expect(malformed.listFavorites()).rejects.toThrow('invalid shape')

    const failure = new Error('transaction failed')
    const repository = createFavoriteCardRepository({
      getAll: vi.fn(async () => {
        throw failure
      }),
      get: vi.fn(async () => {
        throw failure
      }),
      put: vi.fn(async () => {
        throw failure
      }),
      delete: vi.fn(async () => {
        throw failure
      }),
    })
    await expect(repository.listFavorites()).rejects.toBe(failure)
    await expect(repository.addFavorite('CARD-A')).rejects.toBe(failure)
    await expect(repository.removeFavorite('CARD-A')).rejects.toBe(failure)
  })
})
