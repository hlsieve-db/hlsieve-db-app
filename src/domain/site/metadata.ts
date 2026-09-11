import { CARD_TYPE_LABELS } from '../cards/constants'
import type { Card } from '../cards/types'
import {
  DEFAULT_META_DESCRIPTION,
  DEFAULT_OG_IMAGE_URL,
  SITE_NAME,
  SITE_ORIGIN,
} from './constants'

export type RobotsDirective = 'index,follow' | 'noindex,follow' | 'noindex'

export type PageMetadata = {
  title: string
  description?: string
  canonicalPath?: string
  robots?: RobotsDirective
  ogType?: 'website'
  imageUrl?: string
}

export type ResolvedPageMetadata = {
  title: string
  description: string
  canonicalUrl?: string
  robots: RobotsDirective
  ogType: 'website'
  siteName: string
  socialUrl: string
  imageUrl: string
}

export function buildCardDetailMetadata(card: Card): PageMetadata {
  return {
    title: `${card.name} (${card.cardNumber}) | ${SITE_NAME}`,
    description: `${card.name}（${card.cardNumber}）の${CARD_TYPE_LABELS[card.cardType]}カード情報、能力、アーツ、収録情報を確認できます。HLSieve DBはホロライブOCGの非公式カード検索DBです。`,
    canonicalPath: `/cards/${encodeURIComponent(card.cardNumber)}`,
    robots: 'index,follow',
  }
}

export function resolvePageMetadata({
  title,
  description = DEFAULT_META_DESCRIPTION,
  canonicalPath,
  robots = 'index,follow',
  ogType = 'website',
  imageUrl = DEFAULT_OG_IMAGE_URL,
}: PageMetadata): ResolvedPageMetadata {
  const canonicalUrl = canonicalPath
    ? new URL(canonicalPath, SITE_ORIGIN).toString()
    : undefined

  return {
    title,
    description,
    canonicalUrl,
    robots,
    ogType,
    siteName: SITE_NAME,
    socialUrl: canonicalUrl ?? SITE_ORIGIN,
    imageUrl,
  }
}
