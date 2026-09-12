import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

import { load } from 'cheerio'

import type { Card, CardsDataFile } from '../../src/domain/cards/types'
import {
  buildCardDetailMetadata,
  DISCLAIMER_METADATA,
  PROBABILITY_METADATA,
  resolvePageMetadata,
  SWISS_METADATA,
  UPDATE_HISTORY_METADATA,
  type PageMetadata,
} from '../../src/domain/site/metadata'
import { DEFAULT_DOCUMENT_TITLE } from '../../src/domain/site/constants'

const SAFE_CARD_NUMBER = /^[A-Za-z0-9-]+$/

export type PrerenderRoute = {
  routePath: string
  outputPath: string
  html: string
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function setMeta(
  $: ReturnType<typeof load>,
  attribute: 'name' | 'property',
  key: string,
  content: string,
) {
  const element = $(`meta[${attribute}="${key}"]`).first()
  if (element.length === 0) {
    $('head').append(`<meta ${attribute}="${key}" />`)
    $(`meta[${attribute}="${key}"]`).last().attr('content', content)
    return
  }
  element.attr('content', content)
}

export function renderMetadataHtml(
  template: string,
  metadata: PageMetadata,
): string {
  const resolved = resolvePageMetadata(metadata)
  const $ = load(template)
  const replacements: { placeholder: string; value: string }[] = []
  const placeholder = (value: string) => {
    const token = `__HLSIEVE_PRERENDER_${replacements.length}__`
    replacements.push({ placeholder: token, value })
    return token
  }

  $('title').first().text(placeholder(resolved.title))
  setMeta($, 'name', 'description', placeholder(resolved.description))
  setMeta($, 'name', 'robots', placeholder(resolved.robots))
  setMeta($, 'property', 'og:type', placeholder(resolved.ogType))
  setMeta($, 'property', 'og:site_name', placeholder(resolved.siteName))
  setMeta($, 'property', 'og:title', placeholder(resolved.title))
  setMeta($, 'property', 'og:description', placeholder(resolved.description))
  setMeta($, 'property', 'og:url', placeholder(resolved.socialUrl))
  setMeta($, 'property', 'og:image', placeholder(resolved.imageUrl))
  setMeta($, 'name', 'twitter:card', placeholder('summary_large_image'))
  setMeta($, 'name', 'twitter:title', placeholder(resolved.title))
  setMeta($, 'name', 'twitter:description', placeholder(resolved.description))
  setMeta($, 'name', 'twitter:image', placeholder(resolved.imageUrl))

  const canonical = $('link[rel="canonical"]').first()
  if (resolved.canonicalUrl) {
    if (canonical.length === 0) {
      $('head').append('<link rel="canonical" />')
      $('link[rel="canonical"]')
        .last()
        .attr('href', placeholder(resolved.canonicalUrl))
    } else {
      canonical.attr('href', placeholder(resolved.canonicalUrl))
    }
  } else {
    canonical.remove()
  }

  let html = $.html()
  for (const replacement of replacements) {
    html = html.replaceAll(
      replacement.placeholder,
      escapeHtml(replacement.value),
    )
  }
  return html
}

export function renderCardDetailHtml(template: string, card: Card): string {
  const metadataHtml = renderMetadataHtml(
    template,
    buildCardDetailMetadata(card),
  )
  const renderableQas = card.qas.filter(
    (qa) => qa.id && qa.officialUrl && Array.isArray(qa.relatedCardNumbers),
  )
  if (renderableQas.length === 0) return metadataHtml

  const $ = load(metadataHtml)
  const items = renderableQas
    .map(
      (qa) => `<details>
<summary>Q. ${escapeHtml(qa.question)}</summary>
<div><p>A. ${escapeHtml(qa.answer)}</p>
<p>${escapeHtml(qa.id)}${qa.publishedAt ? ` <time>${escapeHtml(qa.publishedAt)}</time>` : ''}</p>
<a href="${escapeHtml(qa.officialUrl)}" rel="noopener noreferrer">公式で確認</a></div>
</details>`,
    )
    .join('')
  $('#root').append(
    `<main data-prerender-card-detail="true"><section aria-labelledby="prerender-card-qa"><h1>${escapeHtml(card.name)}（${escapeHtml(card.cardNumber)}）</h1><h2 id="prerender-card-qa">公式Q&amp;A（${renderableQas.length}件）</h2>${items}</section></main>`,
  )
  return $.html()
}

export function assertSafeCardNumber(cardNumber: string): void {
  if (!SAFE_CARD_NUMBER.test(cardNumber)) {
    throw new Error(`Unsafe cardNumber for prerender path: ${cardNumber}`)
  }
}

export function buildPrerenderRoutes(
  template: string,
  cards: readonly Card[],
): PrerenderRoute[] {
  const sortedCards = [...cards].sort((left, right) =>
    left.cardNumber.localeCompare(right.cardNumber, 'en'),
  )
  const seen = new Set<string>()
  const routes: PrerenderRoute[] = [
    {
      routePath: '/cards',
      outputPath: 'cards.html',
      html: renderMetadataHtml(template, {
        title: DEFAULT_DOCUMENT_TITLE,
        canonicalPath: '/cards',
      }),
    },
    {
      routePath: '/probability',
      outputPath: 'probability.html',
      html: renderMetadataHtml(template, PROBABILITY_METADATA),
    },
    {
      routePath: '/swiss',
      outputPath: 'swiss.html',
      html: renderMetadataHtml(template, SWISS_METADATA),
    },
    {
      routePath: '/updates',
      outputPath: 'updates.html',
      html: renderMetadataHtml(template, UPDATE_HISTORY_METADATA),
    },
    {
      routePath: '/disclaimer',
      outputPath: 'disclaimer.html',
      html: renderMetadataHtml(template, DISCLAIMER_METADATA),
    },
  ]

  for (const card of sortedCards) {
    assertSafeCardNumber(card.cardNumber)
    if (seen.has(card.cardNumber)) {
      throw new Error(`Duplicate cardNumber for prerender: ${card.cardNumber}`)
    }
    seen.add(card.cardNumber)
    const encodedCardNumber = encodeURIComponent(card.cardNumber)
    routes.push({
      routePath: `/cards/${encodedCardNumber}`,
      outputPath: join('cards', `${card.cardNumber}.html`),
      html: renderCardDetailHtml(template, card),
    })
  }

  return routes
}

export async function writePrerenderRoutes(
  outputRoot: string,
  routes: readonly PrerenderRoute[],
): Promise<void> {
  for (const route of routes) {
    const outputPath = resolve(outputRoot, route.outputPath)
    const relativeOutput = relative(resolve(outputRoot), outputPath)
    if (relativeOutput.startsWith('..') || isAbsolute(relativeOutput)) {
      throw new Error(`Prerender output escaped dist: ${route.outputPath}`)
    }
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, route.html, 'utf8')
  }
}

export async function prerenderCards(): Promise<PrerenderRoute[]> {
  const outputRoot = resolve('dist')
  const template = await readFile(resolve(outputRoot, 'index.html'), 'utf8')
  const data = JSON.parse(
    await readFile(resolve('public', 'cards.json'), 'utf8'),
  ) as CardsDataFile
  const routes = buildPrerenderRoutes(template, data.cards)
  await writePrerenderRoutes(outputRoot, routes)
  return routes
}
