import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertResultSmoke,
  waitForRepresentativeCardImage,
  waitForProductionPublication,
  type ResultSmokeObservation,
} from './production'

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

function resultObservation(): ResultSmokeObservation {
  return {
    url: '/tournaments/evt/results/res',
    warning: false,
    sections: { oshi: true, main: true, cheer: true },
    actions: {
      deckCode: true,
      copyCode: true,
      deckLog: true,
      hlsieve: true,
    },
    images: [
      {
        src: 'https://example.test/card.webp',
        complete: true,
        naturalWidth: 300,
        state: 'loaded',
      },
    ],
  }
}

describe('Tournament Daily Result smoke contract', () => {
  it('accepts a rendered recipe with one loaded representative image', () => {
    expect(() => assertResultSmoke(resultObservation())).not.toThrow()
  })
  it.each([
    [
      'warning',
      (value: ResultSmokeObservation) => (value.warning = true),
      'card lookup warning',
    ],
    [
      'main',
      (value: ResultSmokeObservation) => (value.sections.main = false),
      'missing main section',
    ],
    [
      'cheer',
      (value: ResultSmokeObservation) => (value.sections.cheer = false),
      'missing cheer section',
    ],
    [
      'Deck Code',
      (value: ResultSmokeObservation) => (value.actions.deckCode = false),
      'missing deckCode action',
    ],
    [
      'DECK LOG',
      (value: ResultSmokeObservation) => (value.actions.deckLog = false),
      'missing deckLog action',
    ],
    [
      'HLSieve copy',
      (value: ResultSmokeObservation) => (value.actions.hlsieve = false),
      'missing hlsieve action',
    ],
  ])(
    'rejects a missing %s condition with diagnostics',
    (_name, mutate, message) => {
      const value = resultObservation()
      mutate(value)
      expect(() => assertResultSmoke(value)).toThrow(message)
    },
  )
  it('rejects delayed, missing, or failed representative images with their state', () => {
    for (const images of [
      [],
      [
        {
          src: 'lazy.webp',
          complete: false,
          naturalWidth: 0,
          state: 'loading',
        },
      ],
      [
        {
          src: 'failed.webp',
          complete: true,
          naturalWidth: 0,
          state: 'failed',
        },
      ],
    ]) {
      const value = resultObservation()
      value.images = images
      expect(() => assertResultSmoke(value)).toThrow(/representative image/)
    }
  })
  it('scrolls a lazy image into view and waits for attachment and load', async () => {
    const calls: string[] = []
    let releaseAttached = () => undefined
    let releaseLoaded = () => undefined
    const attached = new Promise<void>((resolve) => {
      releaseAttached = resolve
    })
    const loaded = new Promise<void>((resolve) => {
      releaseLoaded = resolve
    })
    let complete = false
    const pending = waitForRepresentativeCardImage({
      scrollIntoView: async () => {
        calls.push('scroll')
      },
      waitForAttached: async () => {
        calls.push('attached')
        await attached
      },
      waitForLoaded: async () => {
        calls.push('loaded')
        await loaded
      },
    }).then(() => {
      complete = true
    })
    await vi.waitFor(() => expect(calls).toEqual(['scroll', 'attached']))
    expect(complete).toBe(false)
    releaseAttached()
    await vi.waitFor(() =>
      expect(calls).toEqual(['scroll', 'attached', 'loaded']),
    )
    expect(complete).toBe(false)
    releaseLoaded()
    await pending
    expect(complete).toBe(true)
  })
  it('reports the URL, image count, warning, and missing actions', () => {
    const value = resultObservation()
    value.warning = true
    value.actions.copyCode = false
    value.images = []
    expect(() => assertResultSmoke(value)).toThrow(
      /evt\/results\/res[\s\S]*Image count: 0[\s\S]*Warning present: true[\s\S]*copyCode/,
    )
  })
})
