import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { CardsDataFile } from '../../src/domain/cards/types'
import { SITE_ORIGIN } from '../../src/domain/site/constants'
import { buildSitemap } from './buildSitemap'

const cardsPath = resolve('public/cards.json')
const sitemapPath = resolve('public/sitemap.xml')
const robotsPath = resolve('public/robots.txt')
const cardsData = JSON.parse(await readFile(cardsPath, 'utf8')) as CardsDataFile

const sitemap = buildSitemap(cardsData.cards.map((card) => card.cardNumber))

await writeFile(sitemapPath, sitemap, 'utf8')
await writeFile(
  robotsPath,
  `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`,
  'utf8',
)

console.log(
  // Counted from the output rather than from the card total plus a literal,
  // which was already one short of the static paths it stood for.
  `Generated ${sitemapPath} with ${sitemap.match(/<loc>/g)?.length ?? 0} URLs and ${robotsPath}.`,
)
