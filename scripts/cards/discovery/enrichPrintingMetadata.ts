import type {
  NormalizedCardCandidate,
  PrintingAwareNormalizedCardCandidate,
} from '../normalize/types'
import type { DiscoveredCard, DiscoveredSpecialEntry } from './types'

export type PrintingMetadataEnrichmentIssue = {
  code:
    | 'DISCOVERY_METADATA_MISSING'
    | 'DISCOVERY_METADATA_DUPLICATE'
    | 'DISCOVERY_ENTRY_NOT_CARD'
    | 'DISCOVERY_METADATA_CONFLICT'
  message: string
  officialId: string
}

export type PrintingMetadataEnrichmentResult =
  | {
      ok: true
      value: PrintingAwareNormalizedCardCandidate
      warnings: PrintingMetadataEnrichmentIssue[]
    }
  | { ok: false; errors: PrintingMetadataEnrichmentIssue[] }

export function enrichPrintingMetadata(
  candidate: NormalizedCardCandidate,
  discoveryEntries: readonly (DiscoveredCard | DiscoveredSpecialEntry)[],
): PrintingMetadataEnrichmentResult {
  const matches = discoveryEntries.filter(
    (entry) => entry.officialId === candidate.officialId,
  )
  if (matches.length === 0) {
    return {
      ok: false,
      errors: [
        {
          code: 'DISCOVERY_METADATA_MISSING',
          message: `No Discovery metadata exists for officialId ${candidate.officialId}.`,
          officialId: candidate.officialId,
        },
      ],
    }
  }
  if (matches.length !== 1) {
    return {
      ok: false,
      errors: [
        {
          code: 'DISCOVERY_METADATA_DUPLICATE',
          message: `Discovery metadata for officialId ${candidate.officialId} is not unique.`,
          officialId: candidate.officialId,
        },
      ],
    }
  }

  const discovery = matches[0]
  if (!discovery || discovery.kind !== 'card') {
    return {
      ok: false,
      errors: [
        {
          code: 'DISCOVERY_ENTRY_NOT_CARD',
          message: `Discovery entry for officialId ${candidate.officialId} is not a card.`,
          officialId: candidate.officialId,
        },
      ],
    }
  }
  if (discovery.cardNumber !== candidate.cardNumber) {
    return {
      ok: false,
      errors: [
        {
          code: 'DISCOVERY_METADATA_CONFLICT',
          message: `Discovery cardNumber ${discovery.cardNumber} contradicts normalized cardNumber ${candidate.cardNumber} for officialId ${candidate.officialId}.`,
          officialId: candidate.officialId,
        },
      ],
    }
  }

  return {
    ok: true,
    value: { ...candidate, isParallel: discovery.isParallel },
    warnings: [],
  }
}
