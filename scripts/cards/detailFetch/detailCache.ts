import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { DiscoveredCard } from '../discovery/types'
import { parseCardDetailHtml } from '../parser/parseCardDetail'
import type { FetchedCardDetail } from './types'

const CACHE_FORMAT = 'holocard-detail-cache'
const CACHE_VERSION = 1

export type DetailCacheMeta = {
  format: typeof CACHE_FORMAT
  version: typeof CACHE_VERSION
  officialId: string
  detailUrl: string
  contentType: string
  htmlSha256: string
  fetchedAt: string
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function cachePaths(directory: string, officialId: string) {
  return {
    html: join(directory, `${officialId}.html`),
    meta: join(directory, `${officialId}.meta.json`),
  }
}

function isMeta(value: unknown): value is DetailCacheMeta {
  if (!value || typeof value !== 'object') return false
  const meta = value as Partial<DetailCacheMeta>
  return (
    meta.format === CACHE_FORMAT &&
    meta.version === CACHE_VERSION &&
    typeof meta.officialId === 'string' &&
    typeof meta.detailUrl === 'string' &&
    typeof meta.contentType === 'string' &&
    typeof meta.htmlSha256 === 'string' &&
    typeof meta.fetchedAt === 'string'
  )
}

export async function readDetailCache(
  directory: string,
  card: DiscoveredCard,
  detailUrl: string,
): Promise<FetchedCardDetail | undefined> {
  const paths = cachePaths(directory, card.officialId)
  try {
    const metaValue: unknown = JSON.parse(await readFile(paths.meta, 'utf8'))
    if (!isMeta(metaValue)) return undefined
    if (
      metaValue.officialId !== card.officialId ||
      metaValue.detailUrl !== detailUrl ||
      !metaValue.contentType.toLowerCase().includes('text/html')
    ) {
      return undefined
    }
    const html = await readFile(paths.html, 'utf8')
    if (!html.trim() || sha256(html) !== metaValue.htmlSha256) return undefined
    const parsed = parseCardDetailHtml(html, detailUrl)
    if (!parsed.ok) return undefined
    if (
      parsed.value.officialId !== card.officialId ||
      parsed.value.cardNumberRaw !== card.cardNumber
    ) {
      return undefined
    }
    return { card, html, parsed: parsed.value, source: 'cache' }
  } catch {
    return undefined
  }
}

export async function writeDetailCache(
  directory: string,
  card: DiscoveredCard,
  detailUrl: string,
  contentType: string,
  html: string,
  fetchedAt: string,
): Promise<void> {
  await mkdir(directory, { recursive: true })
  const paths = cachePaths(directory, card.officialId)
  const suffix = `${process.pid}-${randomUUID()}.tmp`
  const tempHtml = `${paths.html}.${suffix}`
  const tempMeta = `${paths.meta}.${suffix}`
  const meta: DetailCacheMeta = {
    format: CACHE_FORMAT,
    version: CACHE_VERSION,
    officialId: card.officialId,
    detailUrl,
    contentType,
    htmlSha256: sha256(html),
    fetchedAt,
  }
  await writeFile(tempHtml, html, 'utf8')
  await writeFile(tempMeta, `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
  await rename(tempHtml, paths.html)
  await rename(tempMeta, paths.meta)
}
