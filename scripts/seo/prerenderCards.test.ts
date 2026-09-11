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
  it('generates /cards and all 1270 logical Card Detail routes deterministically', async () => {
    const [template, data] = await Promise.all([readTemplate(), readCards()])
    const routes = buildPrerenderRoutes(template, data.cards)
    const rerun = buildPrerenderRoutes(template, [...data.cards].reverse())

    expect(routes).toHaveLength(1271)
    expect(routes.filter((route) => route.routePath !== '/cards')).toHaveLength(
      1270,
    )
    expect(routes.map((route) => route.routePath)).toEqual(
      rerun.map((route) => route.routePath),
    )
    expect(routes.map((route) => route.html)).toEqual(
      rerun.map((route) => route.html),
    )
    expect(routes[0].outputPath).toBe('cards.html')
  })

  it('keeps prerendered Card routes in one-to-one sync with sitemap Card URLs', async () => {
    const [template, data, sitemap] = await Promise.all([
      readTemplate(),
      readCards(),
      readFile(resolve('public', 'sitemap.xml'), 'utf8'),
    ])
    const prerenderUrls = buildPrerenderRoutes(template, data.cards)
      .filter((route) => route.routePath !== '/cards')
      .map((route) => new URL(route.routePath, SITE_ORIGIN).toString())
    const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((match) => match[1])
      .filter((url) => url !== `${SITE_ORIGIN}/cards`)

    expect(new Set(prerenderUrls).size).toBe(1270)
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
      expect($('meta[name="robots"]').attr('content')).toBe('index,follow')
    }
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
