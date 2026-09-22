/** @vitest-environment node */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { CardsDataFile } from '../../src/domain/cards/types'
import { SITE_ORIGIN } from '../../src/domain/site/constants'
import { buildSitemap } from './buildSitemap'

const publicPath = (...parts: string[]) => resolve('public', ...parts)

describe('production SEO assets', () => {
  it('keeps the generated sitemap synchronized with all logical cards', async () => {
    const cards = JSON.parse(
      await readFile(publicPath('cards.json'), 'utf8'),
    ) as CardsDataFile
    const sitemap = await readFile(publicPath('sitemap.xml'), 'utf8')
    const expected = buildSitemap(cards.cards.map((card) => card.cardNumber))
    const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (match) => match[1],
    )

    expect(cards.cards).toHaveLength(1381)
    expect(sitemap).toBe(expected)
    expect(locations).toHaveLength(1390)
    expect(new Set(locations)).toHaveProperty('size', 1390)
    expect(locations[0]).toBe(`${SITE_ORIGIN}/cards`)
    expect(locations[1]).toBe(`${SITE_ORIGIN}/qa`)
    expect(locations[2]).toBe(`${SITE_ORIGIN}/probability`)
    expect(locations[3]).toBe(`${SITE_ORIGIN}/mulligan`)
    expect(locations[4]).toBe(`${SITE_ORIGIN}/swiss`)
    expect(locations[5]).toBe(`${SITE_ORIGIN}/tournament-report`)
    expect(locations[6]).toBe(`${SITE_ORIGIN}/updates`)
    expect(locations[7]).toBe(`${SITE_ORIGIN}/contact`)
    expect(locations[8]).toBe(`${SITE_ORIGIN}/privacy`)
    expect(locations.slice(9)).toEqual(
      cards.cards
        .map((card) => `${SITE_ORIGIN}/cards/${card.cardNumber}`)
        .sort((left, right) => left.localeCompare(right, 'en')),
    )
  })

  // Short shares are user generated and unbounded in number, so they belong in
  // neither the sitemap nor the prerendered routes.
  it('excludes short deck share links entirely', async () => {
    const sitemap = await readFile(publicPath('sitemap.xml'), 'utf8')
    expect(sitemap).not.toContain('/s/')
  })

  it('excludes non-indexable and parameterized URLs from the sitemap', async () => {
    const sitemap = await readFile(publicPath('sitemap.xml'), 'utf8')
    const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (match) => new URL(match[1]),
    )

    expect(locations.every((location) => location.search === '')).toBe(true)
    expect(sitemap).not.toContain('/decks')
    expect(sitemap).toContain('/contact')
    expect(sitemap).not.toContain('/deck/share')
    expect(sitemap).not.toContain('/disclaimer')
    expect(sitemap).not.toContain('/tournament-history')
    expect(sitemap).not.toContain('/tournament-stats')
    expect(sitemap).not.toContain('/favorites')
    expect(sitemap).not.toContain('/recent')
    expect(sitemap).not.toContain('printing=')
    expect(sitemap).not.toContain('<lastmod>')
  })

  it('allows crawling and advertises the production sitemap', async () => {
    const robots = await readFile(publicPath('robots.txt'), 'utf8')

    expect(robots).toBe(
      `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`,
    )
  })

  it('ships the social preview image at 1200 by 630 pixels', async () => {
    const image = await readFile(publicPath('og-image.png'))

    expect(image.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect(image.readUInt32BE(16)).toBe(1200)
    expect(image.readUInt32BE(20)).toBe(630)
  })
})
