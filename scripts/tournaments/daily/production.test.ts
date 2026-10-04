import { afterEach, describe, expect, it, vi } from 'vitest'
import { waitForProductionPublication } from './production'

function response(value: unknown, contentType = 'application/json'): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': contentType },
  })
}

describe('Tournament Daily Production verification', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('requires the expected dataset, Cards/Oshi version, and Event JSON', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          dataVersion: 'dataset',
          events: [{ id: 'evt_1', resultCount: 0 }],
        }),
      )
      .mockResolvedValueOnce(response({ cardsDataVersion: 'cards', cards: {} }))
      .mockResolvedValueOnce(
        response({
          dataVersion: 'dataset',
          event: { id: 'evt_1', results: [] },
        }),
      )
    vi.stubGlobal('fetch', fetch)
    await expect(
      waitForProductionPublication({
        expectedVersion: 'dataset',
        cardsDataVersion: 'cards',
        eventIds: ['evt_1'],
        timeoutMs: 100,
      }),
    ).resolves.toBeUndefined()
  })
  it('rejects HTML fallback and stale Card catalog versions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}, 'text/html')))
    await expect(
      waitForProductionPublication({
        expectedVersion: 'dataset',
        cardsDataVersion: 'cards',
        eventIds: [],
        timeoutMs: 100,
      }),
    ).rejects.toThrow('JSON smoke')
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response({ dataVersion: 'dataset' }))
        .mockResolvedValueOnce(response({ cardsDataVersion: 'old' })),
    )
    await expect(
      waitForProductionPublication({
        expectedVersion: 'dataset',
        cardsDataVersion: 'cards',
        eventIds: [],
        timeoutMs: 100,
      }),
    ).rejects.toThrow('version mismatch')
  })
  it('does not accept a stale deployed dataset version', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(async () => response({ dataVersion: 'stale' })),
    )
    await expect(
      waitForProductionPublication({
        expectedVersion: 'dataset',
        cardsDataVersion: 'cards',
        eventIds: [],
        timeoutMs: 5,
        pollMs: 1,
      }),
    ).rejects.toThrow('version timeout')
  })
})
