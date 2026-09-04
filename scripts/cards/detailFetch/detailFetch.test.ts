/** @vitest-environment node */

import { createHash } from 'node:crypto'
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DiscoveredCard, DiscoveryResult } from '../discovery/types'
import { fetchCardDetails } from './fetchCardDetails'
import { validateDetailUrl } from './validateDetailUrl'

const fixturePath = resolve(
  process.cwd(),
  'scripts/cards/fixtures/detail/oshi-kiara-multiple-qa.html',
)
const detailUrl = 'https://hololive-official-cardgame.com/cardlist/?faq=&id=34'
const directories: string[] = []

function card(overrides: Partial<DiscoveredCard> = {}): DiscoveredCard {
  return {
    kind: 'card',
    officialId: '34',
    detailUrl,
    cardNumber: 'hBP01-006',
    name: '小鳥遊キアラ',
    isParallel: false,
    sourceSearchUrl:
      'https://hololive-official-cardgame.com/cardlist/cardsearch/?parallel%5B0%5D=all&view=text',
    ...overrides,
  }
}

function discovery(
  cards: DiscoveredCard[] = [card()],
  isComplete = true,
): DiscoveryResult {
  return {
    pages: {},
    cards,
    specialEntries: [],
    counts: {
      totalCards: cards.length,
      uniqueCardNumbers: new Set(cards.map((item) => item.cardNumber)).size,
      parallelCards: cards.filter((item) => item.isParallel).length,
      nonParallelCards: cards.filter((item) => !item.isParallel).length,
      specialEntries: 0,
      multipleOfficialIdCardNumbers: 0,
      normalAndParallelCardNumbers: 0,
      duplicateOfficialIds: 0,
      classificationConflicts: 0,
      unclassifiedOfficialIds: 0,
    },
    isComplete,
    issues: [],
    requestCount: 0,
    retryCount: 0,
  }
}

async function cacheDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'hocg-detail-fetch-'))
  directories.push(directory)
  return directory
}

async function fixture() {
  return readFile(fixturePath, 'utf8')
}

function htmlResponse(html: string, init: ResponseInit = {}, responseUrl = '') {
  const response = new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=UTF-8' },
    ...init,
  })
  if (responseUrl)
    Object.defineProperty(response, 'url', { value: responseUrl })
  return response
}

function mockFetch(...responses: Array<Response | Error>) {
  return vi.fn(async () => {
    const next = responses.shift()
    if (next instanceof Error) throw next
    if (!next) throw new Error('Unexpected request')
    return next
  }) as unknown as typeof fetch
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(async (directory) => {
      if (!directory.startsWith(tmpdir())) {
        throw new Error(`Refusing to remove non-temporary path: ${directory}`)
      }
      await rm(directory, { recursive: true, force: true })
    }),
  )
})

describe('detail Discovery gate and identity', () => {
  it('makes zero requests for incomplete Discovery', async () => {
    const fetchImpl = mockFetch(htmlResponse(await fixture()))
    const report = await fetchCardDetails(discovery([card()], false), {
      cacheDirectory: await cacheDirectory(),
      fetchImpl,
    })

    expect(report.aborted).toBe(true)
    expect(report.issues[0]?.code).toBe('DISCOVERY_INCOMPLETE')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('fetches cards from complete Discovery and excludes special entries', async () => {
    const input = discovery([])
    input.specialEntries = [
      {
        kind: 'special',
        name: 'デッキ構築ルール',
        sourceSearchUrl: 'https://hololive-official-cardgame.com/cardlist/',
      },
    ]
    const fetchImpl = mockFetch()
    const report = await fetchCardDetails(input, {
      cacheDirectory: await cacheDirectory(),
      fetchImpl,
    })

    expect(report.total).toBe(0)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('dedupes identical officialIds but rejects conflicting metadata before fetch', async () => {
    const html = await fixture()
    const validFetch = mockFetch(htmlResponse(html))
    const valid = await fetchCardDetails(discovery([card(), card()]), {
      cacheDirectory: await cacheDirectory(),
      fetchImpl: validFetch,
      minIntervalMs: 0,
    })
    expect(valid.total).toBe(1)
    expect(validFetch).toHaveBeenCalledTimes(1)

    const invalidFetch = mockFetch(htmlResponse(html))
    const invalid = await fetchCardDetails(
      discovery([card(), card({ name: 'conflict' })]),
      { cacheDirectory: await cacheDirectory(), fetchImpl: invalidFetch },
    )
    expect(invalid.issues[0]?.code).toBe('DUPLICATE_OFFICIAL_ID_CONFLICT')
    expect(invalidFetch).not.toHaveBeenCalled()
  })

  it('keeps same-cardNumber printings separate and preserves isParallel', async () => {
    const html = await fixture()
    const parallelHtml = html.replace('id=34', 'id=35')
    const cards = [
      card(),
      card({
        officialId: '35',
        detailUrl:
          'https://hololive-official-cardgame.com/cardlist/?faq=&id=35',
        isParallel: true,
      }),
    ]
    const report = await fetchCardDetails(discovery(cards), {
      cacheDirectory: await cacheDirectory(),
      fetchImpl: mockFetch(htmlResponse(html), htmlResponse(parallelHtml)),
      minIntervalMs: 0,
    })

    expect(report.succeeded).toBe(2)
    expect(report.results.map((result) => result.card.isParallel)).toEqual([
      false,
      true,
    ])
  })
})

describe('detail URL validation', () => {
  it('accepts official HTTPS URLs and removes fragments', () => {
    expect(
      validateDetailUrl(card({ detailUrl: `${detailUrl}#fragment` })),
    ).toEqual({ ok: true, url: detailUrl })
  })

  it.each([
    ['not a URL', 'DETAIL_URL_INVALID'],
    ['https://example.com/cardlist/?id=34', 'DETAIL_URL_EXTERNAL'],
    [
      'https://user:password@hololive-official-cardgame.com/cardlist/?id=34',
      'DETAIL_URL_CREDENTIALS',
    ],
    [
      'http://hololive-official-cardgame.com/cardlist/?id=34',
      'DETAIL_URL_EXTERNAL',
    ],
  ])('rejects %s', (url, code) => {
    const result = validateDetailUrl(card({ detailUrl: url }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issue.code).toBe(code)
  })

  it('rejects a non-numeric officialId before cache or network access', async () => {
    const fetchImpl = mockFetch()
    const report = await fetchCardDetails(
      discovery([
        card({
          officialId: '../escape',
          detailUrl:
            'https://hololive-official-cardgame.com/cardlist/?id=..%2Fescape',
        }),
      ]),
      { cacheDirectory: await cacheDirectory(), fetchImpl },
    )
    expect(report.issues[0]?.code).toBe('DETAIL_URL_INVALID')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects an external final response URL', async () => {
    const fetchImpl = mockFetch(
      htmlResponse(await fixture(), {}, 'https://example.com/card/?id=34'),
    )
    const report = await fetchCardDetails(discovery(), {
      cacheDirectory: await cacheDirectory(),
      fetchImpl,
    })
    expect(report.issues[0]?.code).toBe('DETAIL_REDIRECT_EXTERNAL')
  })

  it('rejects a final response URL with a different officialId', async () => {
    const fetchImpl = mockFetch(
      htmlResponse(
        await fixture(),
        {},
        'https://hololive-official-cardgame.com/cardlist/?id=999',
      ),
    )
    const report = await fetchCardDetails(discovery(), {
      cacheDirectory: await cacheDirectory(),
      fetchImpl,
    })
    expect(report.aborted).toBe(true)
    expect(report.issues.map((issue) => issue.code)).toEqual([
      'DETAIL_URL_ID_MISMATCH',
    ])
  })
})

describe('detail HTTP handling', () => {
  it('retries network failures and succeeds', async () => {
    const fetchImpl = mockFetch(
      new TypeError('offline'),
      htmlResponse(await fixture()),
    )
    const report = await fetchCardDetails(discovery(), {
      cacheDirectory: await cacheDirectory(),
      fetchImpl,
      minIntervalMs: 0,
    })
    expect(report).toMatchObject({
      succeeded: 1,
      requestCount: 2,
      retryCount: 1,
    })
    expect(fetchImpl).toHaveBeenLastCalledWith(
      detailUrl,
      expect.objectContaining({
        headers: { 'User-Agent': 'hocg-card-tool/0.1 card-data-updater' },
      }),
    )
  })

  it('retries timeout failures', async () => {
    const html = await fixture()
    let calls = 0
    const fetchImpl = vi.fn((_url: URL | RequestInfo, init?: RequestInit) => {
      calls += 1
      if (calls === 2) return Promise.resolve(htmlResponse(html))
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new Error('abort')),
        )
      })
    }) as unknown as typeof fetch
    const report = await fetchCardDetails(discovery(), {
      cacheDirectory: await cacheDirectory(),
      fetchImpl,
      timeoutMs: 1,
      minIntervalMs: 0,
    })
    expect(report).toMatchObject({
      succeeded: 1,
      requestCount: 2,
      retryCount: 1,
    })
  })

  it('retries 429 and respects Retry-After', async () => {
    const sleep = vi.fn(async () => undefined)
    const fetchImpl = mockFetch(
      new Response('', {
        status: 429,
        headers: { 'retry-after': '2', 'content-type': 'text/html' },
      }),
      htmlResponse(await fixture()),
    )
    const report = await fetchCardDetails(discovery(), {
      cacheDirectory: await cacheDirectory(),
      fetchImpl,
      sleep,
      minIntervalMs: 0,
    })
    expect(report.succeeded).toBe(1)
    expect(sleep).toHaveBeenCalledWith(2_000)
  })

  it('retries 500 but does not retry 404', async () => {
    const html = await fixture()
    const retrying = await fetchCardDetails(discovery(), {
      cacheDirectory: await cacheDirectory(),
      fetchImpl: mockFetch(
        new Response('', { status: 500 }),
        htmlResponse(html),
      ),
      minIntervalMs: 0,
    })
    expect(retrying).toMatchObject({ succeeded: 1, requestCount: 2 })

    const fetchImpl = mockFetch(new Response('', { status: 404 }))
    const notFound = await fetchCardDetails(discovery(), {
      cacheDirectory: await cacheDirectory(),
      fetchImpl,
      minIntervalMs: 0,
    })
    expect(notFound).toMatchObject({ failed: 1, requestCount: 1 })
  })

  it.each([
    [
      new Response('{}', { headers: { 'content-type': 'application/json' } }),
      'FETCH_CONTENT_TYPE_INVALID',
    ],
    [htmlResponse('   '), 'FETCH_EMPTY_RESPONSE'],
  ])('rejects invalid successful responses', async (response, code) => {
    const report = await fetchCardDetails(discovery(), {
      cacheDirectory: await cacheDirectory(),
      fetchImpl: mockFetch(response),
    })
    expect(report.issues[0]?.code).toBe(code)
  })

  it('enforces the request interval serially', async () => {
    const sleep = vi.fn(async () => undefined)
    const html = await fixture()
    const second = card({
      officialId: '35',
      detailUrl: 'https://hololive-official-cardgame.com/cardlist/?faq=&id=35',
    })
    const report = await fetchCardDetails(discovery([card(), second]), {
      cacheDirectory: await cacheDirectory(),
      fetchImpl: mockFetch(
        htmlResponse(html),
        htmlResponse(html.replace('id=34', 'id=35')),
      ),
      sleep,
      now: () => 1_000,
      minIntervalMs: 750,
    })
    expect(report.succeeded).toBe(2)
    expect(sleep).toHaveBeenCalledWith(750)
  })
})

describe('parser validation and circuit breakers', () => {
  it('accepts the existing official fixture and rejects malformed/card mismatch HTML', async () => {
    const html = await fixture()
    const valid = await fetchCardDetails(discovery(), {
      cacheDirectory: await cacheDirectory(),
      fetchImpl: mockFetch(htmlResponse(html)),
    })
    expect(valid.succeeded).toBe(1)
    expect(valid.results[0]?.parsed.officialId).toBe('34')

    const malformed = await fetchCardDetails(discovery(), {
      cacheDirectory: await cacheDirectory(),
      fetchImpl: mockFetch(htmlResponse('<main>missing</main>')),
    })
    expect(malformed.issues[0]?.code).toBe('DETAIL_PARSE_FAILED')

    const mismatch = await fetchCardDetails(discovery(), {
      cacheDirectory: await cacheDirectory(),
      fetchImpl: mockFetch(
        htmlResponse(
          html.replace('<span>hBP01-006</span>', '<span>WRONG-001</span>'),
        ),
      ),
    })
    expect(mismatch.issues[0]?.code).toBe('DETAIL_CARD_NUMBER_MISMATCH')
  })

  it('aborts immediately on 403 and after exhausted 429', async () => {
    const cards = [
      card(),
      card({ officialId: '35', detailUrl: detailUrl.replace('34', '35') }),
    ]
    const forbidden = await fetchCardDetails(discovery(cards), {
      cacheDirectory: await cacheDirectory(),
      fetchImpl: mockFetch(new Response('', { status: 403 })),
      minIntervalMs: 0,
    })
    expect(forbidden).toMatchObject({ aborted: true, requestCount: 1 })
    expect(forbidden.issues.at(-1)?.code).toBe('CIRCUIT_BREAKER_403')

    const rateLimited = await fetchCardDetails(discovery(cards), {
      cacheDirectory: await cacheDirectory(),
      fetchImpl: mockFetch(
        new Response('', { status: 429 }),
        new Response('', { status: 429 }),
        new Response('', { status: 429 }),
      ),
      minIntervalMs: 0,
    })
    expect(rateLimited).toMatchObject({
      aborted: true,
      requestCount: 3,
      retryCount: 2,
    })
    expect(rateLimited.issues.at(-1)?.code).toBe('CIRCUIT_BREAKER_429')
  })

  it('aborts after three consecutive cards exhaust 5xx retries', async () => {
    const cards = ['34', '35', '36', '37'].map((officialId) =>
      card({ officialId, detailUrl: detailUrl.replace('34', officialId) }),
    )
    const responses = Array.from(
      { length: 9 },
      () => new Response('', { status: 500 }),
    )
    const report = await fetchCardDetails(discovery(cards), {
      cacheDirectory: await cacheDirectory(),
      fetchImpl: mockFetch(...responses),
      minIntervalMs: 0,
    })
    expect(report).toMatchObject({ aborted: true, failed: 3, requestCount: 9 })
    expect(report.issues.at(-1)?.code).toBe('CIRCUIT_BREAKER_5XX')
  })
})

describe('detail cache and resume', () => {
  it('writes an atomic officialId cache and resumes with zero network', async () => {
    const directory = await cacheDirectory()
    const html = await fixture()
    const first = await fetchCardDetails(discovery(), {
      cacheDirectory: directory,
      fetchImpl: mockFetch(htmlResponse(html)),
    })
    expect(first).toMatchObject({ fetched: 1, cacheHits: 0 })
    expect((await readdir(directory)).sort()).toEqual([
      '34.html',
      '34.meta.json',
    ])
    const meta = JSON.parse(
      await readFile(join(directory, '34.meta.json'), 'utf8'),
    ) as Record<string, unknown>
    expect(meta).toMatchObject({
      format: 'holocard-detail-cache',
      version: 1,
      officialId: '34',
      detailUrl,
      contentType: 'text/html; charset=UTF-8',
      htmlSha256: createHash('sha256').update(html).digest('hex'),
    })
    expect(meta.fetchedAt).toEqual(expect.any(String))

    const fetchImpl = mockFetch()
    const resumed = await fetchCardDetails(
      discovery([card({ isParallel: true })]),
      {
        cacheDirectory: directory,
        fetchImpl,
      },
    )
    expect(resumed).toMatchObject({ fetched: 0, cacheHits: 1, succeeded: 1 })
    expect(resumed.results[0]?.source).toBe('cache')
    expect(resumed.results[0]?.card.isParallel).toBe(true)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each([
    [
      'invalid meta',
      async (directory: string) =>
        writeFile(join(directory, '34.meta.json'), '{'),
    ],
    [
      'missing HTML',
      async (directory: string) => unlink(join(directory, '34.html')),
    ],
    [
      'hash mismatch',
      async (directory: string) =>
        writeFile(join(directory, '34.html'), 'changed'),
    ],
    [
      'detail URL mismatch',
      async (directory: string) => {
        const path = join(directory, '34.meta.json')
        const meta = JSON.parse(await readFile(path, 'utf8')) as Record<
          string,
          unknown
        >
        meta.detailUrl = `${detailUrl}&changed=1`
        await writeFile(path, JSON.stringify(meta))
      },
    ],
    [
      'officialId mismatch',
      async (directory: string) => {
        const path = join(directory, '34.meta.json')
        const meta = JSON.parse(await readFile(path, 'utf8')) as Record<
          string,
          unknown
        >
        meta.officialId = '999'
        await writeFile(path, JSON.stringify(meta))
      },
    ],
  ])('refetches an invalid cache: %s', async (_name, invalidate) => {
    const directory = await cacheDirectory()
    const html = await fixture()
    await fetchCardDetails(discovery(), {
      cacheDirectory: directory,
      fetchImpl: mockFetch(htmlResponse(html)),
    })
    await invalidate(directory)
    const fetchImpl = mockFetch(htmlResponse(html))
    const report = await fetchCardDetails(discovery(), {
      cacheDirectory: directory,
      fetchImpl,
    })
    expect(report.fetched).toBe(1)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('does not accept partial temp files or cache a failed response', async () => {
    const directory = await cacheDirectory()
    await writeFile(join(directory, '34.html.partial.tmp'), await fixture())
    await writeFile(join(directory, '34.meta.json.partial.tmp'), '{}')
    const fetchImpl = mockFetch(new Response('', { status: 404 }))
    const report = await fetchCardDetails(discovery(), {
      cacheDirectory: directory,
      fetchImpl,
    })
    expect(report.failed).toBe(1)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect((await readdir(directory)).sort()).toEqual([
      '34.html.partial.tmp',
      '34.meta.json.partial.tmp',
    ])
  })

  it('refetches cache whose parsed cardNumber is wrong even with a valid hash', async () => {
    const directory = await cacheDirectory()
    const wrongHtml = (await fixture()).replace(
      '<span>hBP01-006</span>',
      '<span>WRONG-001</span>',
    )
    const meta = {
      format: 'holocard-detail-cache',
      version: 1,
      officialId: '34',
      detailUrl,
      contentType: 'text/html',
      htmlSha256: createHash('sha256').update(wrongHtml).digest('hex'),
      fetchedAt: '2026-09-04T00:00:00.000Z',
    }
    await writeFile(join(directory, '34.html'), wrongHtml)
    await writeFile(join(directory, '34.meta.json'), JSON.stringify(meta))
    const fetchImpl = mockFetch(htmlResponse(await fixture()))
    const report = await fetchCardDetails(discovery(), {
      cacheDirectory: directory,
      fetchImpl,
    })
    expect(report.fetched).toBe(1)
  })

  it('resumes three cards by requesting only the missing officialId', async () => {
    const directory = await cacheDirectory()
    const html = await fixture()
    const cards = ['34', '35', '36'].map((officialId, index) =>
      card({
        officialId,
        detailUrl: detailUrl.replace('34', officialId),
        isParallel: index === 2,
      }),
    )
    await fetchCardDetails(discovery([cards[0]!, cards[2]!]), {
      cacheDirectory: directory,
      fetchImpl: mockFetch(htmlResponse(html), htmlResponse(html)),
      minIntervalMs: 0,
    })

    const fetchImpl = mockFetch(htmlResponse(html))
    const report = await fetchCardDetails(discovery(cards), {
      cacheDirectory: directory,
      fetchImpl,
      minIntervalMs: 0,
    })
    expect(report).toMatchObject({
      total: 3,
      succeeded: 3,
      cacheHits: 2,
      fetched: 1,
      requestCount: 1,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(report.results.map((result) => result.card.officialId)).toEqual([
      '34',
      '35',
      '36',
    ])
  })
})
