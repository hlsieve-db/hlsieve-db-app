import siteConfig from '../../../site.config.json' with { type: 'json' }

export const SITE_NAME = 'HLSieve DB'

export const SITE_SUBTITLE = 'ホロライブOCGカード検索DB'

export const SITE_ORIGIN = siteConfig.origin

export const DEFAULT_DOCUMENT_TITLE = `${SITE_NAME} | ${SITE_SUBTITLE}`

export const DEFAULT_META_DESCRIPTION =
  'HLSieve DBは、ホロライブOCGのカード検索・絞り込み・カード詳細確認・デッキ構築ができる非公式ファンメイドツールです。'

export const DEFAULT_OG_IMAGE_URL = `${SITE_ORIGIN}/og-image.png`
