import { describe, expect, it, vi } from 'vitest'

import {
  SYNTHETIC_TOURNAMENT_INDEX,
  SYNTHETIC_TOURNAMENT_OSHI_MASTER,
  SYNTHETIC_TOURNAMENT_PUBLICATION,
} from '../test/fixtures/tournaments'
import {
  createTournamentDataLoaders,
  isTournamentIndexFile,
  isTournamentEventFile,
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

  it('does not turn a 200 HTML fallback into a missing publication', async () => {
    const loaders = createTournamentDataLoaders(
      vi.fn(
        async () =>
          new Response('<!doctype html><title>SPA</title>', {
            headers: { 'content-type': 'text/html' },
          }),
      ) as typeof fetch,
    )
    await expect(loaders.loadTournamentIndex()).rejects.toThrow(
      'not valid JSON',
    )
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

  it('loads and caches each encoded Event independently', async () => {
    const source = SYNTHETIC_TOURNAMENT_PUBLICATION.events['synthetic-event-a']
    const file = {
      ...source,
      event: { ...source.event, id: 'synthetic event/a' },
    }
    const fetchData = vi.fn(async () => jsonResponse(file))
    const loaders = createTournamentDataLoaders(fetchData as typeof fetch)

    await expect(
      loaders.loadTournamentEvent('synthetic event/a'),
    ).resolves.toEqual(file)
    await expect(
      loaders.loadTournamentEvent('synthetic event/a'),
    ).resolves.toEqual(file)
    expect(fetchData).toHaveBeenCalledOnce()
    expect(fetchData).toHaveBeenCalledWith(
      '/tournaments/events/synthetic%20event%2Fa.json',
    )
  })

  it('classifies Event 404 and retries only the failed Event', async () => {
    const file = SYNTHETIC_TOURNAMENT_PUBLICATION.events['synthetic-event-a']
    const fetchData = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(jsonResponse(file))
    const loaders = createTournamentDataLoaders(fetchData as typeof fetch)

    await expect(
      loaders.loadTournamentEvent('synthetic-event-a'),
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      loaders.loadTournamentEvent('synthetic-event-a'),
    ).resolves.toEqual(file)
    expect(fetchData).toHaveBeenCalledTimes(2)
  })

  it('rejects invalid Event JSON and nested schema', async () => {
    const invalidJson = createTournamentDataLoaders(
      vi.fn(async () => new Response('{')) as typeof fetch,
    )
    await expect(invalidJson.loadTournamentEvent('event')).rejects.toThrow(
      'not valid JSON',
    )

    const file = SYNTHETIC_TOURNAMENT_PUBLICATION.events['synthetic-event-a']
    const invalid = createTournamentDataLoaders(
      vi.fn(async () =>
        jsonResponse({
          ...file,
          event: { ...file.event, results: [{ id: 'bad' }] },
        }),
      ) as typeof fetch,
    )
    await expect(invalid.loadTournamentEvent('event')).rejects.toThrow(
      'invalid shape',
    )
    expect(isTournamentEventFile(file)).toBe(true)
  })

  it('rejects an Event file whose stable ID differs from the request', async () => {
    const file = SYNTHETIC_TOURNAMENT_PUBLICATION.events['synthetic-event-a']
    const loaders = createTournamentDataLoaders(
      vi.fn(async () => jsonResponse(file)) as typeof fetch,
    )
    await expect(
      loaders.loadTournamentEvent('different-event'),
    ).rejects.toThrow('does not match')
  })
})
