/** @vitest-environment node */

import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { load } from 'cheerio'
import { describe, expect, it } from 'vitest'

import type { Card, CardsDataFile } from '../../src/domain/cards/types'
import { SITE_ORIGIN } from '../../src/domain/site/constants'
import { buildCardDetailMetadata } from '../../src/domain/site/metadata'
import {
  assertSafeCardNumber,
  buildPrerenderRoutes,
  renderCardDetailHtml,
  renderMetadataHtml,
} from './prerenderCards'

const readTemplate = async () =>
  (await readFile(resolve('index.html'), 'utf8')).replaceAll(
    '__SITE_ORIGIN__',
    SITE_ORIGIN,
  )

const readCards = async () =>
  JSON.parse(
    await readFile(resolve('public', 'cards.json'), 'utf8'),
  ) as CardsDataFile

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    cardNumber: 'TEST-001',
    name: 'テストカード',
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
    searchText: '',
    ...overrides,
  }
}

describe('Card Detail static prerender', () => {
  it('generates indexable static pages and all 1381 logical Card Detail routes deterministically', async () => {
    const [template, data] = await Promise.all([readTemplate(), readCards()])
    const routes = buildPrerenderRoutes(template, data.cards)
    const rerun = buildPrerenderRoutes(template, [...data.cards].reverse())

    expect(routes).toHaveLength(1386)
    expect(
      routes.filter((route) => route.routePath.startsWith('/cards/')),
    ).toHaveLength(1381)
    expect(routes.map((route) => route.routePath)).toEqual(
      rerun.map((route) => route.routePath),
    )
    expect(routes.map((route) => route.html)).toEqual(
      rerun.map((route) => route.html),
    )
    expect(routes[0].outputPath).toBe('cards.html')
    expect(routes[1].outputPath).toBe('probability.html')
    const probability = load(routes[1].html)
    expect(probability('title').text()).toBe('確率計算 | HLSieve DB')
    expect(probability('meta[name="robots"]').attr('content')).toBe(
      'index,follow',
    )
    expect(probability('link[rel="canonical"]').attr('href')).toBe(
      `${SITE_ORIGIN}/probability`,
    )
    expect(routes[2].outputPath).toBe('swiss.html')
    const swiss = load(routes[2].html)
    expect(swiss('title').text()).toBe('スイスドロー計算 | HLSieve DB')
    expect(swiss('meta[name="robots"]').attr('content')).toBe('index,follow')
    expect(swiss('link[rel="canonical"]').attr('href')).toBe(
      `${SITE_ORIGIN}/swiss`,
    )
    expect(routes[3].outputPath).toBe('updates.html')
    const updates = load(routes[3].html)
    expect(updates('title').text()).toBe('更新履歴 | HLSieve DB')
    expect(updates('meta[name="robots"]').attr('content')).toBe('index,follow')
    expect(updates('link[rel="canonical"]').attr('href')).toBe(
      `${SITE_ORIGIN}/updates`,
    )
    expect(routes[4].outputPath).toBe('disclaimer.html')
    const disclaimer = load(routes[4].html)
    expect(disclaimer('title').text()).toBe('免責事項・利用条件 | HLSieve DB')
    expect(disclaimer('meta[name="robots"]').attr('content')).toBe(
      'noindex,follow',
    )
    expect(disclaimer('link[rel="canonical"]').attr('href')).toBe(
      `${SITE_ORIGIN}/disclaimer`,
    )
  }, 15_000)

  it('keeps prerendered Card routes in one-to-one sync with sitemap Card URLs', async () => {
    const [template, data, sitemap] = await Promise.all([
      readTemplate(),
      readCards(),
      readFile(resolve('public', 'sitemap.xml'), 'utf8'),
    ])
    const prerenderUrls = buildPrerenderRoutes(template, data.cards)
      .filter((route) => route.routePath.startsWith('/cards/'))
      .map((route) => new URL(route.routePath, SITE_ORIGIN).toString())
    const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((match) => match[1])
      .filter((url) => url.startsWith(`${SITE_ORIGIN}/cards/`))

    expect(new Set(prerenderUrls).size).toBe(1381)
    expect(prerenderUrls).toEqual(sitemapUrls)
  })

  it('renders complete static metadata for representative cards', async () => {
    const [template, data] = await Promise.all([readTemplate(), readCards()])
    const routes = buildPrerenderRoutes(template, data.cards)

    for (const cardNumber of ['hBP03-050', 'hBP01-001', 'hSD01-001']) {
      const route = routes.find(
        (candidate) => candidate.routePath === `/cards/${cardNumber}`,
      )
      const card = data.cards.find(
        (candidate) => candidate.cardNumber === cardNumber,
      )
      expect(route).toBeDefined()
      expect(card).toBeDefined()
      expect(route?.outputPath).toBe(join('cards', `${cardNumber}.html`))

      const $ = load(route?.html ?? '')
      const expected = buildCardDetailMetadata(card as Card)
      expect($('title').text()).toBe(expected.title)
      expect($('meta[name="description"]').attr('content')).toBe(
        expected.description,
      )
      expect($('link[rel="canonical"]').attr('href')).toBe(
        `${SITE_ORIGIN}/cards/${cardNumber}`,
      )
      expect($('meta[property="og:title"]').attr('content')).toBe(
        expected.title,
      )
      expect($('meta[property="og:url"]').attr('content')).toBe(
        `${SITE_ORIGIN}/cards/${cardNumber}`,
      )
      expect($('meta[name="twitter:title"]').attr('content')).toBe(
        expected.title,
      )
      expect($('meta[property="og:image"]').attr('content')).toBe(
        card?.imageUrl,
      )
      expect($('meta[name="twitter:image"]').attr('content')).toBe(
        card?.imageUrl,
      )
      expect($('meta[name="robots"]').attr('content')).toBe('index,follow')
    }
  })

  it('audits one unique official representative image for every logical Card', async () => {
    const data = await readCards()
    const imageUrls = data.cards.flatMap((card) =>
      card.imageUrl ? [card.imageUrl] : [],
    )
    const hosts = imageUrls.map((imageUrl) => new URL(imageUrl).host)

    expect(data.cards).toHaveLength(1381)
    expect(imageUrls).toHaveLength(1381)
    expect(new Set(imageUrls).size).toBe(1381)
    expect(new Set(hosts)).toEqual(new Set(['hololive-official-cardgame.com']))
  })

  it('HTML-escapes card metadata without changing its decoded meaning', async () => {
    const template = await readTemplate()
    const card = makeCard({ name: `A&B <C> "D" 'E'` })
    const html = renderMetadataHtml(template, buildCardDetailMetadata(card))
    const $ = load(html)

    expect(html).toContain('A&amp;B &lt;C&gt; &quot;D&quot;')
    expect($('title').text()).toContain(`A&B <C> "D" 'E'`)
    expect($('meta[name="description"]').attr('content')).toContain(
      `A&B <C> "D" 'E'`,
    )
  })

  it('includes safe official Q&A text in the JS-free Card Detail HTML', async () => {
    const template = await readTemplate()
    const html = renderCardDetailHtml(
      template,
      makeCard({
        qas: [
          {
            id: 'Q617',
            question: '「<script>」を含む質問ですか？',
            answer: 'A&Bを回答します。',
            officialUrl:
              'https://hololive-official-cardgame.com/cardlist/?id=614#faq',
            publishedAt: '2026-03-02',
            relatedCardNumbers: ['TEST-001'],
          },
        ],
      }),
    )
    const $ = load(html)

    expect($('[data-prerender-card-detail] h2').text()).toBe('公式Q&A（1件）')
    expect($('[data-prerender-card-detail] summary').text()).toBe(
      'Q. 「<script>」を含む質問ですか？',
    )
    expect($('[data-prerender-card-detail] p').first().text()).toBe(
      'A. A&Bを回答します。',
    )
    expect($('[data-prerender-card-detail] a').attr('href')).toBe(
      'https://hololive-official-cardgame.com/cardlist/?id=614#faq',
    )
    expect($('[data-prerender-card-detail] script')).toHaveLength(0)
  })

  it('rejects unsafe path segments and duplicate Card identities', async () => {
    const template = await readTemplate()
    expect(() => assertSafeCardNumber('../CARD')).toThrow('Unsafe cardNumber')
    expect(() => assertSafeCardNumber('CARD/001')).toThrow('Unsafe cardNumber')
    expect(() => assertSafeCardNumber('CARD%2F001')).toThrow(
      'Unsafe cardNumber',
    )
    expect(() =>
      buildPrerenderRoutes(template, [makeCard(), makeCard()]),
    ).toThrow('Duplicate cardNumber')
  })
})
