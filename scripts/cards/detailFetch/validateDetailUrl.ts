import type { DiscoveredCard } from '../discovery/types'
import type { DetailFetchIssue } from './types'

export const OFFICIAL_CARD_ORIGIN = 'https://hololive-official-cardgame.com'

export type ValidatedDetailUrl =
  { ok: true; url: string } | { ok: false; issue: DetailFetchIssue }

export function validateDetailUrl(card: DiscoveredCard): ValidatedDetailUrl {
  if (!/^\d+$/.test(card.officialId)) {
    return {
      ok: false,
      issue: {
        code: 'DETAIL_URL_INVALID',
        message: `officialId must be numeric before detail fetch: ${card.officialId}.`,
        officialId: card.officialId,
        url: card.detailUrl,
      },
    }
  }
  let url: URL
  try {
    url = new URL(card.detailUrl)
  } catch {
    return {
      ok: false,
      issue: {
        code: 'DETAIL_URL_INVALID',
        message: `Invalid detail URL for officialId ${card.officialId}.`,
        officialId: card.officialId,
        url: card.detailUrl,
      },
    }
  }
  if (url.username || url.password) {
    return {
      ok: false,
      issue: {
        code: 'DETAIL_URL_CREDENTIALS',
        message: `Credentials are not allowed in detail URL for officialId ${card.officialId}.`,
        officialId: card.officialId,
        url: card.detailUrl,
      },
    }
  }
  if (url.protocol !== 'https:' || url.origin !== OFFICIAL_CARD_ORIGIN) {
    return {
      ok: false,
      issue: {
        code: 'DETAIL_URL_EXTERNAL',
        message: `Detail URL must use the official HTTPS origin for officialId ${card.officialId}.`,
        officialId: card.officialId,
        url: card.detailUrl,
      },
    }
  }
  if (url.searchParams.get('id') !== card.officialId) {
    return {
      ok: false,
      issue: {
        code: 'DETAIL_URL_ID_MISMATCH',
        message: `Detail URL id does not match officialId ${card.officialId}.`,
        officialId: card.officialId,
        url: card.detailUrl,
      },
    }
  }
  url.hash = ''
  return { ok: true, url: url.toString() }
}

export function validateFinalResponseUrl(
  responseUrl: string,
  requestedUrl: string,
  card: DiscoveredCard,
): ValidatedDetailUrl {
  if (!responseUrl) return { ok: true, url: requestedUrl }
  const candidate = validateDetailUrl({ ...card, detailUrl: responseUrl })
  if (!candidate.ok && candidate.issue.code === 'DETAIL_URL_EXTERNAL') {
    return {
      ok: false,
      issue: {
        ...candidate.issue,
        code: 'DETAIL_REDIRECT_EXTERNAL',
        message: `Detail response redirected outside the official HTTPS origin for officialId ${card.officialId}.`,
      },
    }
  }
  return candidate
}
