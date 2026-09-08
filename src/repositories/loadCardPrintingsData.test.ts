import { describe, expect, it, vi } from 'vitest'

import { assertCardPrintingsCompatibility } from '../domain/cards/cardPrintingsValidation'
import type { CardPrintingsDataFile } from '../domain/cards/types'
import { createCardPrintingsDataLoader } from './loadCardPrintingsData'

const VERSION = `sha256:${'1'.repeat(64)}`

function dataFile(): CardPrintingsDataFile {
  return {
    format: 'hlsieve-card-printings',
    formatVersion: 1,
    cardsDataVersion: VERSION,
    dataVersion: `sha256:${'2'.repeat(64)}`,
    cards: {
      'TEST-001': {
        defaultPrintingOfficialId: '2',
        printings: [
          {
            officialId: '2',
            officialUrl: 'https://official.example/cards?id=2',
            isParallel: false,
            imageUrl: 'https://img.example/2.png',
            rarity: 'R',
            products: ['Product'],
          },
          {
            officialId: '3',
            officialUrl: 'https://official.example/cards?id=3',
            isParallel: false,
            products: [],
          },
          {
            officialId: '10',
            officialUrl: 'https://official.example/cards?id=10',
            isParallel: true,
            products: [],
            illustrator: 'Artist',
          },
        ],
      },
    },
  }
}

describe('loadCardPrintingsData', () => {
  it('loads the production asset path', async () => {
    const value = dataFile()
    const fetchData = vi.fn(async () => Response.json(value))
    await expect(createCardPrintingsDataLoader(fetchData)()).resolves.toEqual(
      value,
    )
    expect(fetchData).toHaveBeenCalledWith('/card-printings.json')
  })

  it('reuses a successful promise', async () => {
    const fetchData = vi.fn(async () => Response.json(dataFile()))
    const load = createCardPrintingsDataLoader(fetchData)
    expect(load()).toBe(load())
    await load()
    expect(fetchData).toHaveBeenCalledTimes(1)
  })

  it('clears a failed request so it can retry', async () => {
    const fetchData = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(Response.json(dataFile()))
    const load = createCardPrintingsDataLoader(fetchData)
    await expect(load()).rejects.toThrow('Failed to fetch card printing data.')
    await expect(load()).resolves.toEqual(dataFile())
  })

  it('rejects non-2xx responses', async () => {
    const fetchData = vi.fn(async () => new Response('', { status: 503 }))
    await expect(createCardPrintingsDataLoader(fetchData)()).rejects.toThrow(
      'HTTP 503',
    )
  })

  it('rejects invalid JSON', async () => {
    const fetchData = vi.fn(async () => new Response('{'))
    await expect(createCardPrintingsDataLoader(fetchData)()).rejects.toThrow(
      'not valid JSON',
    )
  })

  it.each([
    { ...dataFile(), format: 'other' },
    { ...dataFile(), unknown: true },
    {
      ...dataFile(),
      cards: {
        ...dataFile().cards,
        'TEST-002': dataFile().cards['TEST-001'],
      },
    },
    {
      ...dataFile(),
      cards: {
        'TEST-001': {
          ...dataFile().cards['TEST-001'],
          defaultPrintingOfficialId: '999',
        },
      },
    },
    {
      ...dataFile(),
      cards: {
        'TEST-001': {
          ...dataFile().cards['TEST-001'],
          printings: [
            dataFile().cards['TEST-001']!.printings[0],
            dataFile().cards['TEST-001']!.printings[2],
            dataFile().cards['TEST-001']!.printings[1],
          ],
        },
      },
    },
  ])('rejects an invalid contract', async (value) => {
    const fetchData = vi.fn(async () => Response.json(value))
    await expect(createCardPrintingsDataLoader(fetchData)()).rejects.toThrow(
      'invalid shape',
    )
  })

  it('accepts a compatible cards data version', () => {
    expect(() =>
      assertCardPrintingsCompatibility(VERSION, dataFile()),
    ).not.toThrow()
  })

  it('rejects an incompatible cards data version', () => {
    expect(() =>
      assertCardPrintingsCompatibility(`sha256:${'9'.repeat(64)}`, dataFile()),
    ).toThrow('incompatible')
  })
})
