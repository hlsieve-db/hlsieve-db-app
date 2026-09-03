import { computeCardContentHash } from '../hash/computeContentHash'
import type { SearchIndexedCardCandidate } from '../searchIndex/types'
import type { CardDiffSnapshot } from './types'

export function buildDiffSnapshot(
  card: SearchIndexedCardCandidate,
): CardDiffSnapshot {
  return {
    cardNumber: card.cardNumber,
    contentHash: computeCardContentHash(card),
    card,
  }
}
