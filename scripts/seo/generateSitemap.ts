import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { CardsDataFile } from '../../src/domain/cards/types'
import { SITE_ORIGIN } from '../../src/domain/site/constants'
import { buildSitemap } from './buildSitemap'

const cardsPath = resolve('public/cards.json')
const sitemapPath = resolve('public/sitemap.xml')
const robotsPath = resolve('public/robots.txt')
const cardsData = JSON.parse(await readFile(cardsPath, 'utf8')) as CardsDataFile

await writeFile(
  sitemapPath,
  buildSitemap(cardsData.cards.map((card) => card.cardNumber)),
  'utf8',
)
await writeFile(
  robotsPath,
  `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`,
  'utf8',
)

console.log(
  `Generated ${sitemapPath} with ${cardsData.cards.length + 6} URLs and ${robotsPath}.`,
)
