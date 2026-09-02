import type { RawCardListEntry } from '../parser/types'
import type {
  NormalizeIssue,
  NormalizeResult,
  NormalizedListEntry,
} from './types'
import { normalizeDisplayText, normalizeOptionalText } from './normalizeValues'

function httpUrl(value: string | undefined): string | undefined {
  const normalized = normalizeOptionalText(value)
  if (!normalized) {
    return undefined
  }

  try {
    const url = new URL(normalized)
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? normalized
      : undefined
  } catch {
    return undefined
  }
}

export function normalizeCardListEntry(
  raw: RawCardListEntry,
): NormalizeResult<NormalizedListEntry> {
  const name = normalizeDisplayText(raw.nameRaw)
  if (!name) {
    return {
      ok: false,
      errors: [
        {
          code: 'MISSING_LIST_ENTRY_NAME',
          message: 'A normalized list entry requires a name.',
        },
      ],
    }
  }

  const warnings: NormalizeIssue[] = []
  const rawOfficialId = normalizeOptionalText(raw.officialId)
  const officialId =
    rawOfficialId && /^\d+$/.test(rawOfficialId) ? rawOfficialId : undefined
  const detailUrl = httpUrl(raw.detailUrl)
  const imageUrl = httpUrl(raw.image?.resolvedUrl)
  const rawCardNumber = normalizeOptionalText(raw.cardNumberRaw)
  const cardNumber =
    rawCardNumber && rawCardNumber !== 'null' ? rawCardNumber : undefined

  if (raw.detailUrl && !detailUrl) {
    warnings.push({
      code: 'INVALID_LIST_DETAIL_URL',
      message: `List detail URL is not http(s): ${raw.detailUrl}`,
    })
  }
  if (rawOfficialId && !officialId) {
    warnings.push({
      code: 'INVALID_LIST_OFFICIAL_ID',
      message: `List officialId must be numeric: ${rawOfficialId}`,
    })
  }
  if (raw.image && !imageUrl) {
    warnings.push({
      code: 'UNRESOLVED_LIST_IMAGE',
      message: 'List image has no valid http(s) resolvedUrl.',
    })
  }

  if (officialId && cardNumber && detailUrl) {
    return {
      ok: true,
      warnings,
      value: {
        kind: 'card',
        officialId,
        cardNumber,
        name,
        detailUrl,
        ...(imageUrl ? { imageUrl } : {}),
      },
    }
  }

  if (cardNumber) {
    warnings.push({
      code: 'INCOMPLETE_CARD_LIST_ENTRY',
      message: 'A card number exists, but officialId or detailUrl is missing.',
    })
  }

  return {
    ok: true,
    warnings,
    value: {
      kind: 'special',
      ...(officialId ? { officialId } : {}),
      name,
      ...(detailUrl ? { detailUrl } : {}),
      ...(imageUrl ? { imageUrl } : {}),
    },
  }
}
