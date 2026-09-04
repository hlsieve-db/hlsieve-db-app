import type {
  NormalizedCardCandidate,
  PrintingAwareNormalizedCardCandidate,
} from '../normalize/types'
import { compareSemanticFields } from './compareCandidates'
import { deepEqual } from './deepEqual'
import { mergeCandidateQas } from './mergeQa'
import type {
  MergeIssue,
  MergeResult,
  MergedCardCandidate,
  MergedPrinting,
} from './types'

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    return false
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1 || month < 1 || month > 12 || day < 1) {
    return false
  }

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ]
  return day <= (daysInMonth[month - 1] ?? 0)
}

function candidateLatestReleaseDate(
  candidate: NormalizedCardCandidate,
): string | undefined {
  return candidate.products
    .map((product) => product.releaseDate)
    .filter(
      (date): date is string => date !== undefined && isValidIsoDate(date),
    )
    .reduce<string | undefined>(
      (latest, date) => (!latest || date > latest ? date : latest),
      undefined,
    )
}

function compareOfficialIdsDescending(left: string, right: string): number {
  if (/^\d+$/.test(left) && /^\d+$/.test(right)) {
    const leftNumeric = BigInt(left)
    const rightNumeric = BigInt(right)
    if (leftNumeric !== rightNumeric) {
      return leftNumeric > rightNumeric ? -1 : 1
    }
  }

  if (left === right) {
    return 0
  }
  return left > right ? -1 : 1
}

export function rankCardCandidates(
  candidates: readonly PrintingAwareNormalizedCardCandidate[],
): PrintingAwareNormalizedCardCandidate[] {
  return [...candidates].sort((left, right) => {
    const leftDate = candidateLatestReleaseDate(left)
    const rightDate = candidateLatestReleaseDate(right)
    if (leftDate !== rightDate) {
      if (!leftDate) return 1
      if (!rightDate) return -1
      return leftDate > rightDate ? -1 : 1
    }
    return compareOfficialIdsDescending(left.officialId, right.officialId)
  })
}

function dedupePrintings(
  candidates: readonly PrintingAwareNormalizedCardCandidate[],
): MergeResult<PrintingAwareNormalizedCardCandidate[]> {
  const unique: PrintingAwareNormalizedCardCandidate[] = []
  const byOfficialId = new Map<string, PrintingAwareNormalizedCardCandidate>()
  const warnings: MergeIssue[] = []

  for (const candidate of candidates) {
    const existing = byOfficialId.get(candidate.officialId)
    if (!existing) {
      byOfficialId.set(candidate.officialId, candidate)
      unique.push(candidate)
      continue
    }
    if (!deepEqual(existing, candidate)) {
      return {
        ok: false,
        errors: [
          {
            code: 'DUPLICATE_OFFICIAL_ID_CONFLICT',
            message: `officialId ${candidate.officialId} has different candidate data.`,
          },
        ],
      }
    }
    warnings.push({
      code: 'DUPLICATE_OFFICIAL_ID_DEDUPED',
      message: `Duplicate officialId ${candidate.officialId} was deduplicated.`,
    })
  }

  return { ok: true, value: unique, warnings }
}

function aggregateStrings(
  candidates: readonly PrintingAwareNormalizedCardCandidate[],
  values: (
    candidate: PrintingAwareNormalizedCardCandidate,
  ) => readonly (string | undefined)[],
): string[] {
  const result: string[] = []
  for (const candidate of candidates) {
    for (const value of values(candidate)) {
      if (value?.trim() && !result.includes(value)) {
        result.push(value)
      }
    }
  }
  return result
}

function earliestReleaseDate(
  candidates: readonly PrintingAwareNormalizedCardCandidate[],
): string | undefined {
  return candidates
    .flatMap((candidate) =>
      candidate.products.map((product) => product.releaseDate),
    )
    .filter(
      (date): date is string => date !== undefined && isValidIsoDate(date),
    )
    .reduce<string | undefined>(
      (earliest, date) => (!earliest || date < earliest ? date : earliest),
      undefined,
    )
}

function toPrinting(
  candidate: PrintingAwareNormalizedCardCandidate,
): MergedPrinting {
  return {
    officialId: candidate.officialId,
    officialUrl: candidate.officialUrl,
    isParallel: candidate.isParallel,
    ...(candidate.imageUrl ? { imageUrl: candidate.imageUrl } : {}),
    ...(candidate.rarity ? { rarity: candidate.rarity } : {}),
    products: candidate.products,
    ...(candidate.illustrator ? { illustrator: candidate.illustrator } : {}),
  }
}

export function mergeCardCandidates(
  candidates: readonly PrintingAwareNormalizedCardCandidate[],
): MergeResult<MergedCardCandidate> {
  if (candidates.length === 0) {
    return {
      ok: false,
      errors: [
        { code: 'EMPTY_MERGE_INPUT', message: 'No candidates to merge.' },
      ],
    }
  }

  if (
    candidates.some((candidate) => typeof candidate.isParallel !== 'boolean')
  ) {
    return {
      ok: false,
      errors: [
        {
          code: 'MISSING_PARALLEL_METADATA',
          message:
            'Every merge candidate must contain explicit Discovery parallel metadata.',
        },
      ],
    }
  }

  const cardNumber = candidates[0]?.cardNumber
  if (
    !cardNumber ||
    candidates.some((candidate) => candidate.cardNumber !== cardNumber)
  ) {
    return {
      ok: false,
      errors: [
        {
          code: 'MIXED_CARD_NUMBERS',
          message: 'All candidates must have the same non-empty cardNumber.',
        },
      ],
    }
  }

  const deduplicated = dedupePrintings(candidates)
  if (!deduplicated.ok) {
    return deduplicated
  }
  const ranked = rankCardCandidates(deduplicated.value)
  const canonical = ranked[0]
  if (!canonical) {
    return {
      ok: false,
      errors: [
        { code: 'EMPTY_MERGE_INPUT', message: 'No candidates to merge.' },
      ],
    }
  }

  const warnings = [...deduplicated.warnings]
  const representative =
    ranked.find((candidate) => !candidate.isParallel && candidate.imageUrl) ??
    ranked.find((candidate) => candidate.imageUrl)
  if (!canonical.imageUrl && representative) {
    warnings.push({
      code: 'REPRESENTATIVE_IMAGE_FALLBACK',
      message: `Used image from officialId ${representative.officialId} because canonical officialId ${canonical.officialId} has no image.`,
    })
  }

  const semanticConflicts = ranked
    .slice(1)
    .flatMap((candidate) => compareSemanticFields(canonical, candidate))
  const mergedQa = mergeCandidateQas(ranked)
  const releaseDate = earliestReleaseDate(ranked)

  return {
    ok: true,
    warnings,
    value: {
      cardNumber,
      name: canonical.name,
      cardType: canonical.cardType,
      isBuzz: canonical.isBuzz,
      colors: canonical.colors,
      ...(canonical.bloomLevel ? { bloomLevel: canonical.bloomLevel } : {}),
      ...(canonical.debutType ? { debutType: canonical.debutType } : {}),
      ...(canonical.hp !== undefined ? { hp: canonical.hp } : {}),
      ...(canonical.life !== undefined ? { life: canonical.life } : {}),
      tags: aggregateStrings(ranked, (candidate) => candidate.tags),
      ...(canonical.supportType ? { supportType: canonical.supportType } : {}),
      isLimited: canonical.isLimited,
      ...(canonical.supportSearchCategory
        ? { supportSearchCategory: canonical.supportSearchCategory }
        : {}),
      batonPass: canonical.batonPass,
      abilities: canonical.abilities,
      arts: canonical.arts,
      ...(canonical.extraText ? { extraText: canonical.extraText } : {}),
      ...(canonical.deckLimit !== undefined
        ? { deckLimit: canonical.deckLimit }
        : {}),
      qas: mergedQa.qas,
      ...(representative?.imageUrl
        ? {
            imageUrl: representative.imageUrl,
            representativeImageOfficialId: representative.officialId,
          }
        : {}),
      officialUrl: canonical.officialUrl,
      rarities: aggregateStrings(ranked, (candidate) => [candidate.rarity]),
      products: aggregateStrings(ranked, (candidate) =>
        candidate.products.map((product) => product.name),
      ),
      illustrators: aggregateStrings(ranked, (candidate) => [
        candidate.illustrator,
      ]),
      ...(releaseDate ? { releaseDate } : {}),
      printings: ranked.map(toPrinting),
      conflicts: [...semanticConflicts, ...mergedQa.conflicts],
    },
  }
}
