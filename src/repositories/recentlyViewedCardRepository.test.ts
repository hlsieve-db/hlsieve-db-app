import { describe, expect, it, vi } from 'vitest'

import type { RecentlyViewedCard } from '../domain/recentlyViewed/types'
import {
  createRecentlyViewedCardRepository,
  type RecentlyViewedCardPersistenceAdapter,
} from './recentlyViewedCardRepository'

function memoryPersistence(
  initial: unknown[] = [],
): RecentlyViewedCardPersistenceAdapter {
  const records = new Map(
    initial.map((value) => [
      (value as { cardNumber: string }).cardNumber,
      value,
    ]),
  )
  return {
    getAll: vi.fn(async () => [...records.values()]),
    recordView: vi.fn(async (record, limit) => {
      records.set(record.cardNumber, record)
      const sorted = [...records.values()]
        .filter(
          (value): value is RecentlyViewedCard =>
            typeof (value as RecentlyViewedCard).viewedAt === 'string',
        )
        .sort(
          (left, right) =>
            right.viewedAt.localeCompare(left.viewedAt) ||
            left.cardNumber.localeCompare(right.cardNumber, 'en'),
        )
      for (const stale of sorted.slice(limit)) records.delete(stale.cardNumber)
    }),
    delete: vi.fn(async (cardNumber) => {
      records.delete(cardNumber)
    }),
    clear: vi.fn(async () => {
      records.clear()
    }),
  }
}

describe('recentlyViewedCardRepository', () => {
  it('records, lists, removes, clears, and retains unknown card numbers', async () => {
    const times = ['2026-09-15T00:00:00.000Z', '2026-09-15T00:01:00.000Z']
    const repository = createRecentlyViewedCardRepository(memoryPersistence(), {
      now: () => times.shift()!,
    })

    await expect(repository.list()).resolves.toEqual([])
    await repository.recordView('CARD-A')
    await repository.recordView('UNKNOWN-001')
    await expect(repository.list()).resolves.toEqual([
      { cardNumber: 'UNKNOWN-001', viewedAt: '2026-09-15T00:01:00.000Z' },
      { cardNumber: 'CARD-A', viewedAt: '2026-09-15T00:00:00.000Z' },
    ])
    await repository.remove('CARD-A')
    await expect(repository.list()).resolves.toHaveLength(1)
    await repository.clear()
    await expect(repository.list()).resolves.toEqual([])
  })

  it('updates duplicate identity and moves a repeated view to the top', async () => {
    const times = [
      '2026-09-15T00:00:00.000Z',
      '2026-09-15T00:01:00.000Z',
      '2026-09-15T00:02:00.000Z',
    ]
    const persistence = memoryPersistence()
    const repository = createRecentlyViewedCardRepository(persistence, {
      now: () => times.shift()!,
    })
    await repository.recordView('CARD-A')
    await repository.recordView('CARD-B')
    await repository.recordView('CARD-A')

    await expect(repository.list()).resolves.toEqual([
      { cardNumber: 'CARD-A', viewedAt: '2026-09-15T00:02:00.000Z' },
      { cardNumber: 'CARD-B', viewedAt: '2026-09-15T00:01:00.000Z' },
    ])
    expect(persistence.recordView).toHaveBeenCalledTimes(3)
  })

  it('keeps only the configured newest records and trims the oldest', async () => {
    let minute = 0
    const repository = createRecentlyViewedCardRepository(memoryPersistence(), {
      limit: 3,
      now: () => `2026-09-15T00:0${minute++}:00.000Z`,
    })
    for (const number of ['A', 'B', 'C', 'D']) {
      await repository.recordView(number)
    }
    await expect(repository.list()).resolves.toEqual([
      { cardNumber: 'D', viewedAt: '2026-09-15T00:03:00.000Z' },
      { cardNumber: 'C', viewedAt: '2026-09-15T00:02:00.000Z' },
      { cardNumber: 'B', viewedAt: '2026-09-15T00:01:00.000Z' },
    ])
  })

  it('uses deterministic card-number ordering for equal timestamps', async () => {
    const repository = createRecentlyViewedCardRepository(
      memoryPersistence([
        { cardNumber: 'B', viewedAt: '2026-09-15T00:00:00.000Z' },
        { cardNumber: 'A', viewedAt: '2026-09-15T00:00:00.000Z' },
      ]),
    )
    expect(
      (await repository.list()).map((record) => record.cardNumber),
    ).toEqual(['A', 'B'])
  })

  it('rejects blank identities, invalid timestamps, and invalid persisted data', async () => {
    const blank = createRecentlyViewedCardRepository(memoryPersistence())
    await expect(blank.recordView('  ')).rejects.toThrow('required')

    const invalidTime = createRecentlyViewedCardRepository(
      memoryPersistence(),
      {
        now: () => 'invalid',
      },
    )
    await expect(invalidTime.recordView('A')).rejects.toThrow('timestamp')

    const invalidStored = createRecentlyViewedCardRepository(
      memoryPersistence([{ cardNumber: 'A', viewedAt: 'invalid' }]),
    )
    await expect(invalidStored.list()).rejects.toThrow('invalid shape')
  })
})
