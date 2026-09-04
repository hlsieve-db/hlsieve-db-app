import { describe, expect, it, vi } from 'vitest'

import type { Card, CardsDataFile } from '../domain/cards/types'
import { createCardsDataLoader } from './loadCardsData'

function dataFile(): CardsDataFile {
  const card: Card = {
    cardNumber: 'hBP03-050',
    name: 'FUWAMOCO',
    cardType: 'holomem',
    colors: ['white'],
    isBuzz: false,
    tags: [],
    abilities: [],
    arts: [],
    batonPass: [],
    effectTags: [],
    criticalColors: [],
    rarities: [],
    products: [],
    illustrators: [],
    qas: [],
    searchText: 'hbp03-050 fuwamoco ふわもこ',
  }
  return {
    format: 'holocard-cards',
    formatVersion: 1,
    dataVersion: `sha256:${'0'.repeat(64)}`,
    generatedAt: '2026-09-04T00:00:00.000Z',
    cards: [card],
  }
}

describe('loadCardsData', () => {
  it('loads a valid CardsDataFile from the production asset path', async () => {
    const value = dataFile()
    const fetchData = vi.fn(async () => Response.json(value))

    await expect(createCardsDataLoader(fetchData)()).resolves.toEqual(value)
    expect(fetchData).toHaveBeenCalledWith('/cards.json')
  })

  it('caches a successful request and result', async () => {
    const value = dataFile()
    const fetchData = vi.fn(async () => Response.json(value))
    const load = createCardsDataLoader(fetchData)

    const first = load()
    const second = load()
    expect(second).toBe(first)
    const resolved = await first
    expect(resolved).toEqual(value)
    await expect(load()).resolves.toBe(resolved)
    expect(fetchData).toHaveBeenCalledTimes(1)
  })

  it('wraps fetch failure and allows a later retry', async () => {
    const fetchData = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(Response.json(dataFile()))
    const load = createCardsDataLoader(fetchData)

    await expect(load()).rejects.toThrow('Failed to fetch card data.')
    await expect(load()).resolves.toEqual(dataFile())
    expect(fetchData).toHaveBeenCalledTimes(2)
  })

  it('rejects a non-2xx response', async () => {
    const fetchData = vi.fn(async () => new Response('', { status: 503 }))

    await expect(createCardsDataLoader(fetchData)()).rejects.toThrow(
      'Failed to load card data: HTTP 503.',
    )
  })

  it('rejects invalid JSON', async () => {
    const fetchData = vi.fn(
      async () =>
        new Response('{', {
          headers: { 'Content-Type': 'application/json' },
        }),
    )

    await expect(createCardsDataLoader(fetchData)()).rejects.toThrow(
      'Card data is not valid JSON.',
    )
  })

  it.each([
    null,
    {},
    { ...dataFile(), format: 'other' },
    { ...dataFile(), internalMetadata: true },
    { ...dataFile(), cards: [{ cardNumber: 'TEST-001' }] },
    { ...dataFile(), cards: [{ ...dataFile().cards[0], cardType: 'buzz' }] },
    { ...dataFile(), cards: [{ ...dataFile().cards[0], officialId: '123' }] },
    {
      ...dataFile(),
      cards: [{ ...dataFile().cards[0], qas: [{ question: 1, answer: 'x' }] }],
    },
    {
      ...dataFile(),
      cards: [{ ...dataFile().cards[0], searchText: undefined }],
    },
    { ...dataFile(), cards: [...dataFile().cards, dataFile().cards[0]] },
  ])('rejects invalid CardsDataFile shape', async (value) => {
    const fetchData = vi.fn(async () => Response.json(value))

    await expect(createCardsDataLoader(fetchData)()).rejects.toThrow(
      'Card data has an invalid shape.',
    )
  })
})
