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

export const UPDATE_HISTORY_METADATA: PageMetadata = {
  title: '更新履歴 | HLSieve DB',
  description:
    'HLSieve DBのカードデータ追加・修正履歴を確認できます。新カードや版情報、カード情報の更新内容をお知らせします。',
  canonicalPath: '/updates',
  robots: 'index,follow',
}

export const PROBABILITY_METADATA: PageMetadata = {
  title: '確率計算 | HLSieve DB',
  description:
    '現在の山札枚数、対象カード枚数、見る枚数から、対象カードを1枚以上引く確率を計算できます。',
  canonicalPath: '/probability',
  robots: 'index,follow',
}

export const MULLIGAN_METADATA: PageMetadata = {
  title: 'マリガン計算 | HLSieve DB',
  description:
    '山札枚数・対象カード枚数・初手枚数・引き直し枚数から、マリガン後に対象カードを1枚以上引ける確率を計算できます。',
  canonicalPath: '/mulligan',
  robots: 'index,follow',
}

export const SWISS_METADATA: PageMetadata = {
  title: 'スイスドロー計算 | HLSieve DB',
  description:
    '大会参加人数とスイス回戦数から、全勝・1敗など各勝敗数の理論人数と割合を計算できます。',
  canonicalPath: '/swiss',
  robots: 'index,follow',
}

export const TOURNAMENT_REPORT_METADATA: PageMetadata = {
  title: '大会戦績レポート | HLSieve DB',
  description:
    '大会名・順位・使用推しホロメン・各対戦結果を入力して、SNS投稿用の大会戦績をまとめられるツールです。',
  canonicalPath: '/tournament-report',
  robots: 'index,follow',
}

export const TOURNAMENT_HISTORY_METADATA: PageMetadata = {
  title: '大会戦績履歴 | HLSieve DB',
  description: 'この端末のブラウザ内に保存した大会戦績を確認・再編集できます。',
  canonicalPath: '/tournament-history',
  robots: 'noindex,follow',
}

export const DISCLAIMER_METADATA: PageMetadata = {
  title: '免責事項・利用条件 | HLSieve DB',
  description:
    'HLSieve DBの非公式サービスとしての免責事項、権利帰属および利用条件をご案内します。',
  canonicalPath: '/disclaimer',
  robots: 'noindex,follow',
}

export function buildCardDetailMetadata(card: Card): PageMetadata {
  return {
    title: `${card.name} (${card.cardNumber}) | ${SITE_NAME}`,
    description: `${card.name}（${card.cardNumber}）の${CARD_TYPE_LABELS[card.cardType]}カード情報、能力、アーツ、収録情報を確認できます。HLSieve DBはホロライブOCGの非公式カード検索DBです。`,
    canonicalPath: `/cards/${encodeURIComponent(card.cardNumber)}`,
    robots: 'index,follow',
    imageUrl: card.imageUrl?.trim() || undefined,
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
