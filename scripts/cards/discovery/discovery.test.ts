/** @vitest-environment node */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import type { NormalizedListEntry } from '../normalize/types'
import { buildSearchUrl } from './buildSearchUrl'
import { discoverCardEntries } from './discoverCardEntries'
import { createHtmlFetcher, DISCOVERY_USER_AGENT } from './fetchHtml'
import { mergeDiscoveryPages } from './mergeDiscoveryPages'
import { mergePaginatedPages } from './mergePaginatedPages'
import { buildPaginationUrl, parsePaginationDefinition } from './pagination'
import { parseDiscoveryPage } from './parseDiscoveryPage'
import { parsePaginationFragment } from './parsePaginationFragment'
import { parseSearchForm } from './parseSearchForm'
import { parseTextViewDefinition } from './parseTextViewDefinition'
import { reconcileDiscovery } from './reconcileDiscovery'
import type {
  DiscoveryMode,
  DiscoveryPageResult,
  SearchFormDefinition,
} from './types'

const fixtureRoot = resolve(process.cwd(), 'scripts/cards/fixtures')
const SOURCE_URL = 'https://official.example/cardlist/'

function formHtml(
  options: {
    omitParallel?: boolean
    omitNonParallel?: boolean
    duplicateValue?: boolean
    unknownLabel?: boolean
    method?: string
    withProducts?: boolean
  } = {},
): string {
  return `<!doctype html><html><body>
    <form id="searchForm" method="${options.method ?? 'get'}" action="/cardlist/cardsearch/">
      <dl><dt>収録商品</dt><dd><select name="expansion_name">
        <option value="">指定なし</option>
        ${options.withProducts ? '<option value="set A">商品 A</option><option value="set-b">商品 B</option>' : ''}
      </select></dd></dl>
      <dl><dt>パラレル</dt><dd>
        <input id="p-all" name="parallel[]" value="all"><label for="p-all">すべて</label>
        ${options.omitParallel ? '' : `<input id="p-only" name="parallel[]" value="${options.duplicateValue ? 'all' : 'parallel'}"><label for="p-only">${options.unknownLabel ? '不明' : 'パラレルのみ'}</label>`}
        ${options.omitNonParallel ? '' : '<input id="p-normal" name="parallel[]" value="normal"><label for="p-normal">パラレルを除く</label>'}
      </dd></dl>
    </form>
  </body></html>`
}

function cardLi(
  officialId: string,
  cardNumber: string,
  name = `Card ${officialId}`,
  imageUrl = `/images/${officialId}.png`,
): string {
  return `<li><a href="/cardlist/?id=${officialId}">
    <div class="img w100"><img src="${imageUrl}" alt="${name}"></div>
    <p class="number">${cardNumber}</p><p class="name">${name}</p>
  </a></li>`
}

function specialLi(name = 'Special'): string {
  return `<li><a href="/cardlist/?id=999"><div class="img w100"><img src="/special.png"></div>
    <p class="number">null</p><p class="name">${name}</p></a></li>`
}

function listHtml(declared: number | undefined, entries: string): string {
  return `<!doctype html><html><body><div id="content">
    ${declared === undefined ? '' : `<p class="cardlist-Result_Target_Num">検索結果<span class="num bold">${declared}</span>件</p>`}
    <ul class="cardlist-Result_List cardlist-Result_List_Txt">${entries}</ul>
  </div></body></html>`
}

function viewSelectionHtml(): string {
  return `<!doctype html><html><body><div id="content">
    <a class="change-Btn_Gallery" href="/cardlist/cardsearch/?parallel%5B0%5D=all&view=image&sort=new">Gallery</a>
    <a class="change-Btn_Txt" href="/cardlist/cardsearch/?parallel%5B0%5D=all&view=text&sort=new">Text</a>
  </div></body></html>`
}

function paginationScript(parallelValue: string, maxPage: number): string {
  return `<script>
    var cur_page = 1;
    var max_page = ${maxPage};
    function exload() {
      var date = new Date();
      $.ajax({
        type: 'GET',
        url: '/cardlist/cardsearch_ex?parallel%5B0%5D=${parallelValue}&view=text&page='+(cur_page+1)+'&t='+date.getTime()
      });
    }
  </script>`
}

function paginatedListHtml(
  declared: number,
  entries: string,
  parallelValue: string,
  maxPage: number,
): string {
  return listHtml(declared, entries).replace(
    '</div></body>',
    `${paginationScript(parallelValue, maxPage)}</div></body>`,
  )
}

function paginationFragment(entries: string): string {
  return entries.replaceAll('<li>', '<li class="ex-item">')
}

function formDefinition(withProducts = false): SearchFormDefinition {
  const parsed = parseSearchForm(formHtml({ withProducts }), SOURCE_URL)
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors))
  return parsed.value
}

function listCard(
  officialId: string,
  cardNumber = `hTEST-${officialId}`,
  imageUrl = `https://official.example/${officialId}.png`,
): Extract<NormalizedListEntry, { kind: 'card' }> {
  return {
    kind: 'card',
    officialId,
    detailUrl: `https://official.example/cardlist/?id=${officialId}`,
    cardNumber,
    name: `Card ${officialId}`,
    imageUrl,
  }
}

function page(
  mode: DiscoveryMode,
  cards: Extract<NormalizedListEntry, { kind: 'card' }>[],
  overrides: Partial<DiscoveryPageResult> = {},
): DiscoveryPageResult {
  return {
    mode,
    searchUrl: `https://official.example/search?mode=${mode}`,
    declaredResultCount: cards.length,
    rawEntryCount: cards.length,
    parsedEntryCount: cards.length,
    cards,
    specialEntries: [],
    duplicateOfficialIdCount: 0,
    partitionCount: 0,
    isComplete: true,
    issues: [],
    ...overrides,
  }
}

function reconcile(
  all: ReturnType<typeof listCard>[],
  parallel: ReturnType<typeof listCard>[],
  nonParallel: ReturnType<typeof listCard>[],
) {
  return reconcileDiscovery(
    formDefinition(),
    {
      all: page('all', all),
      parallel_only: page('parallel_only', parallel),
      non_parallel: page('non_parallel', nonParallel),
    },
    { requestCount: 4, retryCount: 0 },
  )
}

describe('official search form parsing and URL generation', () => {
  it('extracts resolved action, GET method, parallel name, and all three values', () => {
    const parsed = parseSearchForm(formHtml({ withProducts: true }), SOURCE_URL)
    expect(parsed).toMatchObject({
      ok: true,
      value: {
        action: 'https://official.example/cardlist/cardsearch/',
        method: 'get',
        parallelFilter: {
          parameterName: 'parallel[]',
          allValue: 'all',
          parallelOnlyValue: 'parallel',
          nonParallelValue: 'normal',
        },
        productFilter: {
          parameterName: 'expansion_name',
          options: [
            { value: 'set A', label: '商品 A' },
            { value: 'set-b', label: '商品 B' },
          ],
        },
      },
    })
  })

  it.each([
    [
      'parallel-only missing',
      { omitParallel: true },
      'PARALLEL_OPTION_MISSING',
    ],
    [
      'non-parallel missing',
      { omitNonParallel: true },
      'PARALLEL_OPTION_MISSING',
    ],
    [
      'duplicate value',
      { duplicateValue: true },
      'PARALLEL_OPTION_DUPLICATE_VALUE',
    ],
    ['unknown label', { unknownLabel: true }, 'PARALLEL_OPTION_UNKNOWN'],
    ['non-GET method', { method: 'post' }, 'FORM_METHOD_NOT_GET'],
  ] as const)('rejects %s', (_label, options, code) => {
    expect(parseSearchForm(formHtml(options), SOURCE_URL)).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([expect.objectContaining({ code })]),
    })
  })

  it('builds encoded URLs only from parsed form parameter definitions', () => {
    const form = formDefinition(true)
    const url = new URL(buildSearchUrl(form, 'parallel_only', 'set A'))
    expect(url.pathname).toBe('/cardlist/cardsearch/')
    expect(url.searchParams.get('parallel[]')).toBe('parallel')
    expect(url.searchParams.get('expansion_name')).toBe('set A')
    expect(url.toString()).toContain('parallel%5B%5D=parallel')
    expect(url.toString()).toContain('set+A')
  })

  it('derives the text-view parameter from public result view links', () => {
    expect(
      parseTextViewDefinition(viewSelectionHtml(), SOURCE_URL),
    ).toMatchObject({
      ok: true,
      value: { parameterName: 'view', value: 'text' },
    })
  })
})

describe('list page parsing and reconciliation', () => {
  it('extracts declared count and classifies cards and special entries', () => {
    const result = parseDiscoveryPage(
      listHtml(2, `${cardLi('1', 'hTEST-001')}${specialLi()}`),
      SOURCE_URL,
      'all',
    )
    expect(result).toMatchObject({
      declaredResultCount: 2,
      rawEntryCount: 2,
      parsedEntryCount: 2,
      isComplete: true,
    })
    expect(result.cards).toHaveLength(1)
    expect(result.specialEntries).toHaveLength(1)
  })

  it('reuses existing list fixtures and detects partial fixture pages', async () => {
    for (const file of ['normal-multi-result.html', 'support-results.html']) {
      const html = await readFile(resolve(fixtureRoot, 'list', file), 'utf8')
      const result = parseDiscoveryPage(html, SOURCE_URL, 'all')
      expect(result.cards.length).toBeGreaterThan(0)
      expect(result.isComplete).toBe(false)
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'DECLARED_COUNT_MISMATCH' }),
        ]),
      )
    }
  })

  it('reuses the special-entry fixture structurally', async () => {
    const html = await readFile(
      resolve(fixtureRoot, 'list', 'special-deck-building-rules.html'),
      'utf8',
    )
    const result = parseDiscoveryPage(html, SOURCE_URL, 'all')
    expect(result.isComplete).toBe(true)
    expect(result.cards).toEqual([])
    expect(result.specialEntries).toHaveLength(1)
    expect(result.specialEntries[0]).not.toHaveProperty('isParallel')
  })

  it('marks declared count mismatch and missing count incomplete', () => {
    const mismatch = parseDiscoveryPage(
      listHtml(2, cardLi('1', 'hTEST-001')),
      SOURCE_URL,
      'all',
    )
    const missing = parseDiscoveryPage(
      listHtml(undefined, cardLi('1', 'hTEST-001')),
      SOURCE_URL,
      'all',
    )
    expect(mismatch.isComplete).toBe(false)
    expect(missing.isComplete).toBe(false)
    expect(missing.issues[0]?.code).toBe('DECLARED_COUNT_MISSING')
  })

  it('accepts a declared empty result', () => {
    expect(
      parseDiscoveryPage(listHtml(0, ''), SOURCE_URL, 'parallel_only'),
    ).toMatchObject({
      declaredResultCount: 0,
      rawEntryCount: 0,
      parsedEntryCount: 0,
      isComplete: true,
    })
  })

  it('deduplicates identical officialId entries and rejects contradictions', () => {
    const identical = parseDiscoveryPage(
      listHtml(2, `${cardLi('1', 'hTEST-001')}${cardLi('1', 'hTEST-001')}`),
      SOURCE_URL,
      'all',
    )
    const conflict = parseDiscoveryPage(
      listHtml(2, `${cardLi('1', 'hTEST-001')}${cardLi('1', 'hOTHER-001')}`),
      SOURCE_URL,
      'all',
    )
    expect(identical.cards).toHaveLength(1)
    expect(identical.duplicateOfficialIdCount).toBe(1)
    expect(identical.isComplete).toBe(true)
    expect(conflict.isComplete).toBe(false)
    expect(conflict.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'DUPLICATE_OFFICIAL_ID_CONFLICT' }),
      ]),
    )
  })
})

describe('public frontend pagination', () => {
  const searchUrl =
    'https://official.example/cardlist/cardsearch/?parallel%5B%5D=all&view=text'

  it('derives pagination bounds and the confirmed GET transport from inline script', () => {
    const parsed = parsePaginationDefinition(
      paginatedListHtml(2, cardLi('1', 'hTEST-001'), 'all', 2),
      searchUrl,
    )
    expect(parsed).toMatchObject({
      ok: true,
      value: {
        endpointUrl: 'https://official.example/cardlist/cardsearch_ex',
        method: 'get',
        currentPage: 1,
        maxPage: 2,
        filterParameters: [
          { name: 'parallel[0]', value: 'all' },
          { name: 'view', value: 'text' },
        ],
        pageParameterName: 'page',
        cacheBusterParameterName: 't',
      },
    })
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors))
    const pageUrl = new URL(buildPaginationUrl(parsed.value, 2, 1234))
    expect(pageUrl.pathname).toBe('/cardlist/cardsearch_ex')
    expect([...pageUrl.searchParams.entries()]).toEqual([
      ['parallel[0]', 'all'],
      ['view', 'text'],
      ['page', '2'],
      ['t', '1234'],
    ])
  })

  it('wraps only li.ex-item fragments and delegates entry parsing', () => {
    const fragment = paginationFragment(cardLi('2', 'hTEST-002'))
    const parsed = parsePaginationFragment(fragment, searchUrl, 'all')
    expect(parsed).toMatchObject({
      rawEntryCount: 1,
      parsedEntryCount: 1,
      isComplete: true,
    })
    expect(parsed.cards[0]).toMatchObject({
      officialId: '2',
      cardNumber: 'hTEST-002',
    })
    expect(
      parsePaginationFragment('<div>unexpected</div>', searchUrl, 'all'),
    ).toMatchObject({
      isComplete: false,
      issues: [
        expect.objectContaining({ code: 'PAGINATION_FRAGMENT_INVALID' }),
      ],
    })
  })

  it('merges every numbered page and reconciles the declared union count', () => {
    const initial = parseDiscoveryPage(
      paginatedListHtml(2, cardLi('1', 'hTEST-001'), 'all', 2),
      searchUrl,
      'all',
    )
    const definition = parsePaginationDefinition(
      paginatedListHtml(2, cardLi('1', 'hTEST-001'), 'all', 2),
      searchUrl,
    )
    if (!definition.ok) throw new Error(JSON.stringify(definition.errors))
    const second = parsePaginationFragment(
      paginationFragment(cardLi('2', 'hTEST-002')),
      buildPaginationUrl(definition.value, 2, 1234),
      'all',
    )
    const merged = mergePaginatedPages(initial, definition.value, [
      { pageNumber: 2, result: second },
    ])
    expect(merged.isComplete).toBe(true)
    expect(merged.cards.map((card) => card.officialId)).toEqual(['1', '2'])
    expect(merged.pagination).toEqual({
      currentPage: 1,
      maxPage: 2,
      fetchedPages: [1, 2],
      pageEntryCounts: [1, 1],
    })
  })

  it('uses pagination before product fallback in the full discovery flow', async () => {
    const requested: string[] = []
    const stats = { requestCount: 0, retryCount: 0 }
    const fetchHtml = async (url: string) => {
      requested.push(url)
      stats.requestCount += 1
      if (url === SOURCE_URL) {
        return {
          ok: true as const,
          value: formHtml({ withProducts: true }),
          attempts: 1,
        }
      }
      const parsed = new URL(url)
      const mode =
        parsed.searchParams.get('parallel[]') ??
        parsed.searchParams.get('parallel[0]')
      const view = parsed.searchParams.get('view')
      const pageNumber = parsed.searchParams.get('page')
      if (mode === 'all' && !view) {
        return { ok: true as const, value: viewSelectionHtml(), attempts: 1 }
      }
      if (mode === 'all' && pageNumber === '2') {
        return {
          ok: true as const,
          value: paginationFragment(cardLi('2', 'hSAME-001')),
          attempts: 1,
        }
      }
      if (mode === 'all') {
        return {
          ok: true as const,
          value: paginatedListHtml(2, cardLi('1', 'hSAME-001'), 'all', 2),
          attempts: 1,
        }
      }
      if (mode === 'parallel') {
        return {
          ok: true as const,
          value: paginatedListHtml(1, cardLi('2', 'hSAME-001'), 'parallel', 1),
          attempts: 1,
        }
      }
      return {
        ok: true as const,
        value: paginatedListHtml(1, cardLi('1', 'hSAME-001'), 'normal', 1),
        attempts: 1,
      }
    }

    const result = await discoverCardEntries({
      formUrl: SOURCE_URL,
      fetchHtml,
      stats,
    })
    expect(result.isComplete).toBe(true)
    expect(result.requestCount).toBe(6)
    expect(result.pages.all?.pagination?.fetchedPages).toEqual([1, 2])
    expect(result.pages.all?.partitionCount).toBe(0)
    expect(result.cards).toEqual([
      expect.objectContaining({ officialId: '1', isParallel: false }),
      expect.objectContaining({ officialId: '2', isParallel: true }),
    ])
    expect(
      requested.filter(
        (url) => new URL(url).pathname === '/cardlist/cardsearch_ex',
      ),
    ).toHaveLength(1)
  })
})

describe('parallel classification', () => {
  it('classifies ALL membership from disjoint official filter sets', () => {
    const one = listCard('1')
    const two = listCard('2')
    const result = reconcile([one, two], [two], [one])
    expect(result.isComplete).toBe(true)
    expect(result.cards).toEqual([
      expect.objectContaining({ officialId: '1', isParallel: false }),
      expect.objectContaining({ officialId: '2', isParallel: true }),
    ])
  })

  it('detects parallel/non-parallel intersection', () => {
    const one = listCard('1')
    const result = reconcile([one], [one], [one])
    expect(result.isComplete).toBe(false)
    expect(result.counts.classificationConflicts).toBe(1)
  })

  it('detects unclassified ALL ids', () => {
    const result = reconcile([listCard('1')], [], [])
    expect(result.isComplete).toBe(false)
    expect(result.counts.unclassifiedOfficialIds).toBe(1)
  })

  it('detects filtered ids outside ALL', () => {
    const result = reconcile([listCard('1')], [listCard('2')], [listCard('1')])
    expect(result.isComplete).toBe(false)
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'FILTER_ID_OUTSIDE_ALL',
          officialId: '2',
        }),
      ]),
    )
  })

  it('detects identity metadata contradictions across modes', () => {
    const one = listCard('1')
    const altered = { ...one, cardNumber: 'hOTHER-001' }
    const result = reconcile([one], [], [altered])
    expect(result.isComplete).toBe(false)
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'FILTER_METADATA_CONFLICT' }),
      ]),
    )
  })

  it('keeps normal and parallel officialIds sharing one cardNumber', () => {
    const normal = listCard('1', 'hSAME-001')
    const parallel = listCard('2', 'hSAME-001')
    const result = reconcile([normal, parallel], [parallel], [normal])
    expect(result.cards).toHaveLength(2)
    expect(result.counts.uniqueCardNumbers).toBe(1)
    expect(result.counts.normalAndParallelCardNumbers).toBe(1)
  })

  it('does not infer parallel status from an image filename', () => {
    const looksParallel = listCard(
      '1',
      'hTEST-001',
      'https://official.example/card_P_02.png',
    )
    const result = reconcile([looksParallel], [], [looksParallel])
    expect(result.cards[0]?.isParallel).toBe(false)
  })

  it('returns deterministic officialId ordering', () => {
    const one = listCard('1')
    const ten = listCard('10')
    const two = listCard('2')
    const result = reconcile([ten, one, two], [ten], [two, one])
    expect(result.cards.map((card) => card.officialId)).toEqual([
      '1',
      '2',
      '10',
    ])
  })
})

describe('fetchHtml', () => {
  const validHtml = '<div id="content">ok</div>'
  const htmlResponse = (
    body = validHtml,
    status = 200,
    contentType = 'text/html',
  ) => new Response(body, { status, headers: { 'content-type': contentType } })

  it('fetches HTML successfully with the explicit User-Agent', async () => {
    const fetchImpl = vi.fn(async () => htmlResponse())
    const fetcher = createHtmlFetcher({ fetchImpl, minIntervalMs: 0 })
    expect(
      await fetcher('https://official.example/', '#content'),
    ).toMatchObject({
      ok: true,
      attempts: 1,
    })
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toEqual({
      'User-Agent': DISCOVERY_USER_AGENT,
    })
    expect(fetcher.stats).toEqual({ requestCount: 1, retryCount: 0 })
  })

  it.each([500, 429])(
    'retries HTTP %s and records request/retry counts',
    async (status) => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(htmlResponse('error', status))
        .mockResolvedValueOnce(htmlResponse())
      const fetcher = createHtmlFetcher({ fetchImpl, minIntervalMs: 0 })
      expect(
        await fetcher('https://official.example/', '#content'),
      ).toMatchObject({
        ok: true,
        attempts: 2,
      })
      expect(fetcher.stats).toEqual({ requestCount: 2, retryCount: 1 })
    },
  )

  it('respects Retry-After before retrying', async () => {
    const sleep = vi.fn(async () => undefined)
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('busy', {
          status: 429,
          headers: {
            'content-type': 'text/html',
            'retry-after': '2',
          },
        }),
      )
      .mockResolvedValueOnce(htmlResponse())
    const fetcher = createHtmlFetcher({
      fetchImpl,
      minIntervalMs: 0,
      sleep,
    })
    expect(
      await fetcher('https://official.example/', '#content'),
    ).toMatchObject({ ok: true, attempts: 2 })
    expect(sleep).toHaveBeenCalledWith(2_000)
  })

  it('does not retry HTTP 404', async () => {
    const fetchImpl = vi.fn(async () => htmlResponse('missing', 404))
    const fetcher = createHtmlFetcher({ fetchImpl, minIntervalMs: 0 })
    expect(
      await fetcher('https://official.example/', '#content'),
    ).toMatchObject({
      ok: false,
      attempts: 1,
      error: { code: 'FETCH_HTTP_ERROR' },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('aborts timed-out requests and retries up to the configured limit', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          )
        }),
    )
    const fetcher = createHtmlFetcher({
      fetchImpl,
      timeoutMs: 1,
      maxAttempts: 2,
      minIntervalMs: 0,
    })
    expect(
      await fetcher('https://official.example/', '#content'),
    ).toMatchObject({
      ok: false,
      attempts: 2,
      error: { code: 'FETCH_TIMEOUT' },
    })
    expect(fetcher.stats).toEqual({ requestCount: 2, retryCount: 1 })
  })

  it.each([
    [
      'wrong content type',
      htmlResponse(validHtml, 200, 'application/json'),
      'FETCH_CONTENT_TYPE_INVALID',
    ],
    ['empty HTML', htmlResponse('  '), 'FETCH_EMPTY_RESPONSE'],
    [
      'missing expected DOM',
      htmlResponse('<main>other</main>'),
      'FETCH_EXPECTED_DOM_MISSING',
    ],
  ])('rejects %s', async (_label, response, code) => {
    const fetcher = createHtmlFetcher({
      fetchImpl: vi.fn(async () => response),
      minIntervalMs: 0,
    })
    expect(
      await fetcher('https://official.example/', '#content'),
    ).toMatchObject({
      ok: false,
      error: { code },
    })
  })
})

describe('product partition fallback', () => {
  it('unions product partitions by officialId and deduplicates overlaps', () => {
    const base = page('all', [listCard('1')], {
      declaredResultCount: 2,
      rawEntryCount: 1,
      parsedEntryCount: 1,
      isComplete: false,
      issues: [
        { code: 'DECLARED_COUNT_MISMATCH', mode: 'all', message: 'partial' },
      ],
    })
    const merged = mergeDiscoveryPages(base, [
      page('all', [listCard('1')]),
      page('all', [listCard('1'), listCard('2')]),
    ])
    expect(merged.cards.map((card) => card.officialId)).toEqual(['1', '2'])
    expect(merged.duplicateOfficialIdCount).toBe(1)
    expect(merged.partitionCount).toBe(2)
    expect(merged.isComplete).toBe(true)
  })

  it('marks contradictory partition duplicates incomplete', () => {
    const base = page('all', [], { declaredResultCount: 1, isComplete: false })
    const merged = mergeDiscoveryPages(base, [
      page('all', [listCard('1')]),
      page('all', [{ ...listCard('1'), name: 'Other' }]),
    ])
    expect(merged.isComplete).toBe(false)
    expect(merged.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'DUPLICATE_OFFICIAL_ID_CONFLICT' }),
      ]),
    )
  })

  it('runs only public form GET product partitions and reports exact request counts', async () => {
    const requested: string[] = []
    const stats = { requestCount: 0, retryCount: 0 }
    const fetchHtml = async (url: string) => {
      requested.push(url)
      stats.requestCount += 1
      if (url === SOURCE_URL) {
        return {
          ok: true as const,
          value: formHtml({ withProducts: true }),
          attempts: 1,
        }
      }
      const parsed = new URL(url)
      const mode = parsed.searchParams.get('parallel[]')
      const product = parsed.searchParams.get('expansion_name')
      const view = parsed.searchParams.get('view')
      if (mode === 'all' && !product && !view) {
        return { ok: true as const, value: viewSelectionHtml(), attempts: 1 }
      }
      if (mode === 'all' && !product) {
        return {
          ok: true as const,
          value: listHtml(2, cardLi('1', 'hSAME-001')),
          attempts: 1,
        }
      }
      if (mode === 'all' && product === 'set A') {
        return {
          ok: true as const,
          value: listHtml(1, cardLi('1', 'hSAME-001')),
          attempts: 1,
        }
      }
      if (mode === 'all' && product === 'set-b') {
        return {
          ok: true as const,
          value: listHtml(1, cardLi('2', 'hSAME-001')),
          attempts: 1,
        }
      }
      if (mode === 'parallel') {
        return {
          ok: true as const,
          value: listHtml(1, cardLi('2', 'hSAME-001')),
          attempts: 1,
        }
      }
      return {
        ok: true as const,
        value: listHtml(1, cardLi('1', 'hSAME-001')),
        attempts: 1,
      }
    }

    const result = await discoverCardEntries({
      formUrl: SOURCE_URL,
      fetchHtml,
      stats,
    })
    expect(result.isComplete).toBe(true)
    expect(result.requestCount).toBe(7)
    expect(result.retryCount).toBe(0)
    expect(result.pages.all?.partitionCount).toBe(2)
    expect(result.cards).toEqual([
      expect.objectContaining({ officialId: '1', isParallel: false }),
      expect.objectContaining({ officialId: '2', isParallel: true }),
    ])
    expect(
      requested.every(
        (url) => new URL(url).pathname !== '/cardlist/cardsearch_ex',
      ),
    ).toBe(true)
  })
})
