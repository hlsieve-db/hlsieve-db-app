import { describe, expect, it, vi } from 'vitest'

import {
  SYNTHETIC_TOURNAMENT_INDEX,
  SYNTHETIC_TOURNAMENT_OSHI_MASTER,
} from '../test/fixtures/tournaments'
import {
  createTournamentDataLoaders,
  isTournamentIndexFile,
  isTournamentOshiMasterFile,
} from './loadTournamentData'

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('Tournament static data loaders', () => {
  it('loads and caches index and Oshi master independently', async () => {
    const fetchData = vi.fn(async (url: string | URL | Request) =>
      jsonResponse(
        String(url).includes('oshi-master')
          ? SYNTHETIC_TOURNAMENT_OSHI_MASTER
          : SYNTHETIC_TOURNAMENT_INDEX,
      ),
    )
    const loaders = createTournamentDataLoaders(fetchData as typeof fetch)

    await expect(loaders.loadTournamentIndex()).resolves.toEqual(
      SYNTHETIC_TOURNAMENT_INDEX,
    )
    await expect(loaders.loadTournamentIndex()).resolves.toEqual(
      SYNTHETIC_TOURNAMENT_INDEX,
    )
    await expect(loaders.loadTournamentOshiMaster()).resolves.toEqual(
      SYNTHETIC_TOURNAMENT_OSHI_MASTER,
    )
    await expect(loaders.loadTournamentOshiMaster()).resolves.toEqual(
      SYNTHETIC_TOURNAMENT_OSHI_MASTER,
    )
    expect(fetchData).toHaveBeenCalledTimes(2)
    expect(fetchData).toHaveBeenNthCalledWith(1, '/tournaments/index.json')
    expect(fetchData).toHaveBeenNthCalledWith(
      2,
      '/tournaments/oshi-master.json',
    )
  })

  it('treats only an index 404 as missing publication', async () => {
    const loaders = createTournamentDataLoaders(
      vi.fn(async () => new Response('', { status: 404 })) as typeof fetch,
    )
    await expect(loaders.loadTournamentIndex()).resolves.toBeUndefined()
    await expect(loaders.loadTournamentOshiMaster()).rejects.toThrow('HTTP 404')
  })

  it('does not turn a 5xx into a missing publication', async () => {
    const loaders = createTournamentDataLoaders(
      vi.fn(async () => new Response('', { status: 503 })) as typeof fetch,
    )
    await expect(loaders.loadTournamentIndex()).rejects.toThrow('HTTP 503')
  })

  it('rejects invalid JSON and invalid runtime shapes', async () => {
    const invalidJson = createTournamentDataLoaders(
      vi.fn(async () => new Response('{')) as typeof fetch,
    )
    await expect(invalidJson.loadTournamentIndex()).rejects.toThrow(
      'not valid JSON',
    )

    const invalidShape = createTournamentDataLoaders(
      vi.fn(async () =>
        jsonResponse({ ...SYNTHETIC_TOURNAMENT_INDEX, events: [{}] }),
      ) as typeof fetch,
    )
    await expect(invalidShape.loadTournamentIndex()).rejects.toThrow(
      'invalid shape',
    )
  })

  it('drops failed Promise caches so retry can succeed', async () => {
    const fetchData = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(jsonResponse(SYNTHETIC_TOURNAMENT_INDEX))
    const loaders = createTournamentDataLoaders(fetchData as typeof fetch)

    await expect(loaders.loadTournamentIndex()).rejects.toThrow(
      'Failed to fetch tournament data',
    )
    await expect(loaders.loadTournamentIndex()).resolves.toEqual(
      SYNTHETIC_TOURNAMENT_INDEX,
    )
    expect(fetchData).toHaveBeenCalledTimes(2)
  })

  it('validates nested index fields and Oshi master cards', () => {
    expect(isTournamentIndexFile(SYNTHETIC_TOURNAMENT_INDEX)).toBe(true)
    expect(
      isTournamentIndexFile({
        ...SYNTHETIC_TOURNAMENT_INDEX,
        events: [
          {
            ...SYNTHETIC_TOURNAMENT_INDEX.events[0],
            results: [{ id: '', rank: 0, oshiCardNumber: '' }],
          },
        ],
      }),
    ).toBe(false)
    expect(isTournamentOshiMasterFile(SYNTHETIC_TOURNAMENT_OSHI_MASTER)).toBe(
      true,
    )
    expect(
      isTournamentOshiMasterFile({
        ...SYNTHETIC_TOURNAMENT_OSHI_MASTER,
        cards: { broken: { representativeImageUrl: 1 } },
      }),
    ).toBe(false)
  })
})
