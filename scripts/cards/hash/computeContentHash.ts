import { createHash } from 'node:crypto'

import type { SearchIndexedCardCandidate } from '../searchIndex/types'
import { buildContentHashPayload } from './buildContentHashPayload'
import { stableStringify } from './stableStringify'
import type { CardContentHashPayload } from './types'

export function computeContentHash(payload: CardContentHashPayload): string {
  const digest = createHash('sha256')
    .update(stableStringify(payload), 'utf8')
    .digest('hex')
  return `sha256:${digest}`
}

export function computeCardContentHash(
  card: SearchIndexedCardCandidate,
): string {
  return computeContentHash(buildContentHashPayload(card))
}
