import { toDerivedCardCandidate } from '../derive/deriveCardEffects'
import { buildDiffSnapshot } from '../diff/buildDiffSnapshot'
import { diffCardCollections } from '../diff/diffCardCollections'
import { enrichPrintingMetadata } from '../discovery/enrichPrintingMetadata'
import type { DiscoveredCard } from '../discovery/types'
import { buildCardsDataFile } from '../generate/buildCardsDataFile'
import { buildGenerationReport } from '../generate/buildGenerationReport'
import { buildRestrictionsDataFile } from '../generate/buildRestrictionsDataFile'
import { selectCardsForPublication } from '../generate/selectCardsForPublication'
import { serializeDataFile } from '../generate/serializeDataFile'
import { toPublicCard } from '../generate/toPublicCard'
import {
  compareUnicodeCodePoints,
  stableStringify,
} from '../hash/stableStringify'
import { mergeCardCandidates } from '../merge/mergeCardCandidates'
import type { MergeConflict, MergedCardCandidate } from '../merge/types'
import { normalizeCardDetail } from '../normalize/normalizeCardDetail'
import type { PrintingAwareNormalizedCardCandidate } from '../normalize/types'
import { parseCardDetailHtml } from '../parser/parseCardDetail'
import { toSearchIndexedCardCandidate } from '../searchIndex/buildSearchText'
import type {
  CardPipelineAuditIssue,
  CardPipelineAuditReport,
  CardPipelineDryRunArtifacts,
  CardPipelineDryRunInput,
  CardPipelineDryRunResult,
} from './types'

const CONFLICT_SAMPLE_LIMIT = 20

function emptyReport(input: CardPipelineDryRunInput): CardPipelineAuditReport {
  return {
    input: {
      discoveredCards: input.discovery.cards.length,
      specialEntries: input.discovery.specialEntries.length,
      detailResults: input.details.length,
    },
    processing: {
      parsed: 0,
      normalized: 0,
      enriched: 0,
      logicalCards: 0,
      printings: 0,
      snapshots: 0,
    },
    variants: {
      parallelPrintings: 0,
      nonParallelPrintings: 0,
      cardsWithMultiplePrintings: 0,
      cardsWithNormalAndParallel: 0,
      normalOnlyCards: 0,
      parallelOnlyCards: 0,
    },
    conflicts: {
      logicalCards: 0,
      total: 0,
      semantic: 0,
      qa: 0,
      byKind: {},
      byField: {},
      samples: [],
    },
    representativeImages: {
      fromParallelPrinting: 0,
      fromNonParallelPrinting: 0,
      missing: 0,
      ambiguousSource: 0,
    },
    canonicalPrintings: { parallel: 0, nonParallel: 0, missing: 0 },
    qas: {
      cardsWithQa: 0,
      cardsWithoutQa: 0,
      beforeMerge: 0,
      afterMerge: 0,
      conflicts: 0,
    },
    issues: [],
    isPublishable: false,
  }
}

function compareIssues(
  left: CardPipelineAuditIssue,
  right: CardPipelineAuditIssue,
): number {
  for (const [a, b] of [
    [left.severity, right.severity],
    [left.stage, right.stage],
    [left.code, right.code],
    [left.cardNumber ?? '', right.cardNumber ?? ''],
    [left.officialId ?? '', right.officialId ?? ''],
    [left.path ?? '', right.path ?? ''],
    [left.message, right.message],
  ] as const) {
    const compared = compareUnicodeCodePoints(a, b)
    if (compared !== 0) return compared
  }
  return 0
}

function addIssues(
  report: CardPipelineAuditReport,
  issues: CardPipelineAuditIssue[],
) {
  report.issues.push(...issues)
}

function fatal(
  stage: CardPipelineAuditIssue['stage'],
  code: string,
  message: string,
  identity: Pick<
    CardPipelineAuditIssue,
    'officialId' | 'cardNumber' | 'path'
  > = {},
): CardPipelineAuditIssue {
  return { severity: 'fatal', stage, code, message, ...identity }
}

function warning(
  stage: CardPipelineAuditIssue['stage'],
  code: string,
  message: string,
  identity: Pick<
    CardPipelineAuditIssue,
    'officialId' | 'cardNumber' | 'path'
  > = {},
): CardPipelineAuditIssue {
  return { severity: 'warning', stage, code, message, ...identity }
}

function finishFailure(
  report: CardPipelineAuditReport,
): CardPipelineDryRunResult {
  report.issues.sort(compareIssues)
  report.isPublishable = false
  return { report }
}

function dedupeDiscoveryCards(
  cards: readonly DiscoveredCard[],
  report: CardPipelineAuditReport,
): DiscoveredCard[] | undefined {
  const byId = new Map<string, DiscoveredCard>()
  for (const card of cards) {
    const previous = byId.get(card.officialId)
    if (!previous) {
      byId.set(card.officialId, card)
    } else if (stableStringify(previous) !== stableStringify(card)) {
      addIssues(report, [
        fatal(
          'input',
          'DISCOVERY_OFFICIAL_ID_CONFLICT',
          `Discovery contains contradictory officialId ${card.officialId}.`,
          { officialId: card.officialId },
        ),
      ])
      return undefined
    } else {
      addIssues(report, [
        warning(
          'input',
          'DISCOVERY_OFFICIAL_ID_DEDUPED',
          `Identical Discovery officialId ${card.officialId} was deduplicated.`,
          { officialId: card.officialId, cardNumber: card.cardNumber },
        ),
      ])
    }
  }
  return [...byId.values()]
}

function reconcileDetails(
  cards: readonly DiscoveredCard[],
  input: CardPipelineDryRunInput,
  report: CardPipelineAuditReport,
) {
  const discoveryIds = new Set(cards.map((card) => card.officialId))
  const byId = new Map<string, CardPipelineDryRunInput['details'][number]>()
  for (const detail of input.details) {
    if (!discoveryIds.has(detail.card.officialId)) {
      addIssues(report, [
        fatal(
          'input',
          'DETAIL_UNKNOWN_OFFICIAL_ID',
          `Detail officialId ${detail.card.officialId} is absent from Discovery.`,
          { officialId: detail.card.officialId },
        ),
      ])
      continue
    }
    const previous = byId.get(detail.card.officialId)
    if (!previous) {
      byId.set(detail.card.officialId, detail)
      continue
    }
    const previousComparable = {
      card: previous.card,
      html: previous.html,
      parsed: previous.parsed,
    }
    const currentComparable = {
      card: detail.card,
      html: detail.html,
      parsed: detail.parsed,
    }
    if (
      stableStringify(previousComparable) !== stableStringify(currentComparable)
    ) {
      addIssues(report, [
        fatal(
          'input',
          'DETAIL_DUPLICATE_CONFLICT',
          `Contradictory detail results exist for officialId ${detail.card.officialId}.`,
          { officialId: detail.card.officialId },
        ),
      ])
    } else {
      addIssues(report, [
        warning(
          'input',
          'DETAIL_DUPLICATE_DEDUPED',
          `Identical detail result for officialId ${detail.card.officialId} was deduplicated.`,
          {
            officialId: detail.card.officialId,
            cardNumber: detail.card.cardNumber,
          },
        ),
      ])
    }
  }
  for (const card of cards) {
    if (!byId.has(card.officialId)) {
      addIssues(report, [
        fatal(
          'input',
          'DETAIL_MISSING',
          `Detail result is missing for officialId ${card.officialId}.`,
          { officialId: card.officialId, cardNumber: card.cardNumber },
        ),
      ])
    }
  }
  return byId
}

function increment(record: Record<string, number>, key: string) {
  record[key] = (record[key] ?? 0) + 1
}

function sortedRecord(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) =>
      compareUnicodeCodePoints(left, right),
    ),
  )
}

function conflictIssue(conflict: MergeConflict): CardPipelineAuditIssue {
  return warning(
    'merge',
    conflict.kind === 'semantic_conflict'
      ? 'MERGE_SEMANTIC_CONFLICT'
      : 'MERGE_QA_CONFLICT',
    conflict.kind === 'semantic_conflict'
      ? `Semantic conflict in ${conflict.field} between officialId ${conflict.canonicalOfficialId} and ${conflict.conflictingOfficialId}.`
      : `Q&A conflict for question: ${conflict.question}`,
    {
      cardNumber: conflict.cardNumber,
      ...(conflict.kind === 'semantic_conflict'
        ? { officialId: conflict.conflictingOfficialId, path: conflict.field }
        : {}),
    },
  )
}

function auditMergedCards(
  mergedCards: readonly MergedCardCandidate[],
  enriched: readonly PrintingAwareNormalizedCardCandidate[],
  report: CardPipelineAuditReport,
) {
  const byKind: Record<string, number> = {}
  const byField: Record<string, number> = {}
  const conflictIssues: CardPipelineAuditIssue[] = []
  report.qas.beforeMerge = enriched.reduce(
    (total, candidate) => total + candidate.qas.length,
    0,
  )

  for (const card of mergedCards) {
    const parallel = card.printings.filter((printing) => printing.isParallel)
    const normal = card.printings.filter((printing) => !printing.isParallel)
    report.variants.parallelPrintings += parallel.length
    report.variants.nonParallelPrintings += normal.length
    if (card.printings.length > 1)
      report.variants.cardsWithMultiplePrintings += 1
    if (parallel.length > 0 && normal.length > 0) {
      report.variants.cardsWithNormalAndParallel += 1
    } else if (parallel.length > 0) {
      report.variants.parallelOnlyCards += 1
    } else {
      report.variants.normalOnlyCards += 1
    }

    const canonical = card.printings[0]
    if (!canonical) report.canonicalPrintings.missing += 1
    else if (canonical.isParallel) report.canonicalPrintings.parallel += 1
    else report.canonicalPrintings.nonParallel += 1

    if (!card.imageUrl) {
      report.representativeImages.missing += 1
    } else {
      const sources = card.printings.filter(
        (printing) => printing.imageUrl === card.imageUrl,
      )
      const sourceKinds = new Set(
        sources.map((printing) => printing.isParallel),
      )
      if (sourceKinds.size !== 1) {
        report.representativeImages.ambiguousSource += 1
      } else if (sourceKinds.has(true)) {
        report.representativeImages.fromParallelPrinting += 1
      } else {
        report.representativeImages.fromNonParallelPrinting += 1
      }
    }

    report.qas.afterMerge += card.qas.length
    if (card.qas.length > 0) report.qas.cardsWithQa += 1
    else report.qas.cardsWithoutQa += 1
    if (card.conflicts.length > 0) report.conflicts.logicalCards += 1
    for (const conflict of card.conflicts) {
      report.conflicts.total += 1
      increment(byKind, conflict.kind)
      if (conflict.kind === 'semantic_conflict') {
        report.conflicts.semantic += 1
        increment(byField, conflict.field)
      } else {
        report.conflicts.qa += 1
        report.qas.conflicts += 1
      }
      conflictIssues.push(conflictIssue(conflict))
    }
  }
  report.conflicts.byKind = sortedRecord(byKind)
  report.conflicts.byField = sortedRecord(byField)
  conflictIssues.sort(compareIssues)
  report.conflicts.samples = conflictIssues.slice(0, CONFLICT_SAMPLE_LIMIT)
  addIssues(report, report.conflicts.samples)
}

function verifyPrintingIdentity(
  cards: readonly DiscoveredCard[],
  enriched: readonly PrintingAwareNormalizedCardCandidate[],
  mergedCards: readonly MergedCardCandidate[],
  report: CardPipelineAuditReport,
) {
  const expected = [...cards.map((card) => card.officialId)].sort(
    compareUnicodeCodePoints,
  )
  const actual = mergedCards
    .flatMap((card) => card.printings.map((printing) => printing.officialId))
    .sort(compareUnicodeCodePoints)
  if (stableStringify(expected) !== stableStringify(actual)) {
    addIssues(report, [
      fatal(
        'audit',
        'OFFICIAL_ID_SET_MISMATCH',
        'Merged printing officialIds do not match Discovery officialIds.',
      ),
    ])
  }
  if (actual.length !== cards.length) {
    addIssues(report, [
      fatal(
        'audit',
        'PRINTING_COUNT_MISMATCH',
        `Merged printing count ${actual.length} does not match discovered card count ${cards.length}.`,
      ),
    ])
  }
  const discoveryCardNumbers = new Map(
    cards.map((card) => [card.officialId, card.cardNumber]),
  )
  for (const candidate of enriched) {
    if (
      discoveryCardNumbers.get(candidate.officialId) !== candidate.cardNumber
    ) {
      addIssues(report, [
        fatal(
          'audit',
          'CARD_NUMBER_INVARIANT_FAILED',
          `cardNumber changed for officialId ${candidate.officialId}.`,
          {
            officialId: candidate.officialId,
            cardNumber: candidate.cardNumber,
          },
        ),
      ])
    }
  }
}

function generationIssues(
  stage: CardPipelineAuditIssue['stage'],
  errors: readonly {
    code: string
    message: string
    cardNumber?: string
    path?: string
  }[],
) {
  return errors.map((error) =>
    fatal(stage, error.code, error.message, {
      ...(error.cardNumber !== undefined
        ? { cardNumber: error.cardNumber }
        : {}),
      ...(error.path !== undefined ? { path: error.path } : {}),
    }),
  )
}

function runCardPipelineDryRunCore(
  input: CardPipelineDryRunInput,
): CardPipelineDryRunResult {
  const report = emptyReport(input)
  if (!input.discovery.isComplete) {
    addIssues(report, [
      fatal(
        'input',
        'DISCOVERY_INCOMPLETE',
        'Complete DiscoveryResult is required for pipeline audit.',
      ),
    ])
    return finishFailure(report)
  }

  const cards = dedupeDiscoveryCards(input.discovery.cards, report)
  if (!cards) return finishFailure(report)
  const details = reconcileDetails(cards, input, report)
  if (report.issues.some((issue) => issue.severity === 'fatal')) {
    return finishFailure(report)
  }

  const enriched: PrintingAwareNormalizedCardCandidate[] = []
  for (const card of cards) {
    const detail = details.get(card.officialId)
    if (!detail) {
      addIssues(report, [
        fatal('input', 'DETAIL_MISSING', 'Detail reconciliation failed.', {
          officialId: card.officialId,
          cardNumber: card.cardNumber,
        }),
      ])
      continue
    }
    if (
      detail.card.officialId !== card.officialId ||
      detail.card.cardNumber !== card.cardNumber ||
      detail.parsed.officialId !== card.officialId ||
      detail.parsed.cardNumberRaw !== card.cardNumber
    ) {
      addIssues(report, [
        fatal(
          'input',
          'DETAIL_IDENTITY_MISMATCH',
          `Fetched detail identity contradicts Discovery for officialId ${card.officialId}.`,
          { officialId: card.officialId, cardNumber: card.cardNumber },
        ),
      ])
      continue
    }
    if (typeof card.isParallel !== 'boolean') {
      addIssues(report, [
        fatal(
          'enrichment',
          'DISCOVERY_PARALLEL_METADATA_MISSING',
          `Explicit isParallel metadata is missing for officialId ${card.officialId}.`,
          { officialId: card.officialId, cardNumber: card.cardNumber },
        ),
      ])
      continue
    }

    const parsed = parseCardDetailHtml(detail.html, card.detailUrl)
    if (!parsed.ok) {
      addIssues(
        report,
        parsed.errors.map((error) =>
          fatal('parse', error.code, error.message, {
            officialId: card.officialId,
            cardNumber: card.cardNumber,
          }),
        ),
      )
      continue
    }
    report.processing.parsed += 1
    addIssues(
      report,
      parsed.warnings.map((issue) =>
        warning('parse', issue.code, issue.message, {
          officialId: card.officialId,
          cardNumber: card.cardNumber,
        }),
      ),
    )
    if (
      parsed.value.officialId !== card.officialId ||
      parsed.value.cardNumberRaw !== card.cardNumber
    ) {
      addIssues(report, [
        fatal(
          'parse',
          'PARSED_IDENTITY_MISMATCH',
          `Parsed detail identity contradicts Discovery for officialId ${card.officialId}.`,
          { officialId: card.officialId, cardNumber: card.cardNumber },
        ),
      ])
      continue
    }

    const normalized = normalizeCardDetail(parsed.value)
    if (!normalized.ok) {
      addIssues(
        report,
        normalized.errors.map((error) =>
          fatal('normalize', error.code, error.message, {
            officialId: card.officialId,
            cardNumber: card.cardNumber,
          }),
        ),
      )
      continue
    }
    report.processing.normalized += 1
    addIssues(
      report,
      normalized.warnings.map((issue) =>
        warning('normalize', issue.code, issue.message, {
          officialId: card.officialId,
          cardNumber: card.cardNumber,
        }),
      ),
    )

    const enrichment = enrichPrintingMetadata(normalized.value, cards)
    if (!enrichment.ok) {
      addIssues(
        report,
        enrichment.errors.map((error) =>
          fatal('enrichment', error.code, error.message, {
            officialId: error.officialId,
            cardNumber: card.cardNumber,
          }),
        ),
      )
      continue
    }
    report.processing.enriched += 1
    enriched.push(enrichment.value)
    addIssues(
      report,
      enrichment.warnings.map((issue) =>
        warning('enrichment', issue.code, issue.message, {
          officialId: issue.officialId,
          cardNumber: card.cardNumber,
        }),
      ),
    )
  }
  if (report.issues.some((issue) => issue.severity === 'fatal')) {
    return finishFailure(report)
  }

  const groups = new Map<string, PrintingAwareNormalizedCardCandidate[]>()
  for (const candidate of enriched) {
    const group = groups.get(candidate.cardNumber) ?? []
    group.push(candidate)
    groups.set(candidate.cardNumber, group)
  }
  const mergedCards: MergedCardCandidate[] = []
  for (const cardNumber of [...groups.keys()].sort(compareUnicodeCodePoints)) {
    const merged = mergeCardCandidates(groups.get(cardNumber) ?? [])
    if (!merged.ok) {
      addIssues(
        report,
        merged.errors.map((error) =>
          fatal('merge', error.code, error.message, { cardNumber }),
        ),
      )
      continue
    }
    mergedCards.push(merged.value)
    addIssues(
      report,
      merged.warnings.map((issue) =>
        warning('merge', issue.code, issue.message, { cardNumber }),
      ),
    )
  }
  report.processing.logicalCards = mergedCards.length
  report.processing.printings = mergedCards.reduce(
    (total, card) => total + card.printings.length,
    0,
  )
  if (report.issues.some((issue) => issue.severity === 'fatal')) {
    return finishFailure(report)
  }

  auditMergedCards(mergedCards, enriched, report)
  verifyPrintingIdentity(cards, enriched, mergedCards, report)
  if (report.issues.some((issue) => issue.severity === 'fatal')) {
    return finishFailure(report)
  }

  let candidates
  let snapshots
  try {
    candidates = mergedCards.map((card) =>
      toSearchIndexedCardCandidate(toDerivedCardCandidate(card)),
    )
    snapshots = candidates.map(buildDiffSnapshot)
  } catch (error) {
    addIssues(report, [
      fatal(
        'hash',
        'CURRENT_SNAPSHOT_BUILD_FAILED',
        error instanceof Error ? error.message : String(error),
      ),
    ])
    return finishFailure(report)
  }
  report.processing.snapshots = snapshots.length
  const snapshotCardNumbers = new Set<string>()
  for (const snapshot of snapshots) {
    if (!/^sha256:[0-9a-f]{64}$/.test(snapshot.contentHash)) {
      addIssues(report, [
        fatal(
          'hash',
          'CONTENT_HASH_INVALID',
          `Missing or invalid contentHash for ${snapshot.cardNumber}.`,
          { cardNumber: snapshot.cardNumber },
        ),
      ])
    }
    if (snapshotCardNumbers.has(snapshot.cardNumber)) {
      addIssues(report, [
        fatal(
          'hash',
          'CONTENT_HASH_CARD_NUMBER_CONFLICT',
          `Multiple current hashes exist for ${snapshot.cardNumber}.`,
          { cardNumber: snapshot.cardNumber },
        ),
      ])
    }
    snapshotCardNumbers.add(snapshot.cardNumber)
  }
  if (report.issues.some((issue) => issue.severity === 'fatal')) {
    return finishFailure(report)
  }

  const diff = diffCardCollections({
    previous: [...(input.previousSnapshots ?? [])],
    current: snapshots,
    failures: [],
    discoveryComplete: true,
  })
  if (!diff.ok) {
    addIssues(
      report,
      diff.errors.map((error) =>
        fatal('diff', error.code, error.message, {
          ...(error.cardNumber !== undefined
            ? { cardNumber: error.cardNumber }
            : {}),
        }),
      ),
    )
    return finishFailure(report)
  }

  const generationReport = buildGenerationReport(diff.value.entries, {
    generatedAt: input.generatedAt,
  })
  const selected = selectCardsForPublication(diff.value.entries)
  if (!generationReport.ok || !selected.ok) {
    addIssues(
      report,
      generationIssues(
        'generation',
        !generationReport.ok ? generationReport.errors : selected.errors,
      ),
    )
    return finishFailure(report)
  }
  report.diff = { ...generationReport.value.counts }

  const publicCards = []
  for (const candidate of selected.value) {
    const converted = toPublicCard(candidate)
    if (!converted.ok) {
      addIssues(report, generationIssues('generation', converted.errors))
    } else {
      publicCards.push(converted.value)
    }
  }
  if (report.issues.some((issue) => issue.severity === 'fatal')) {
    return finishFailure(report)
  }

  const cardsData = buildCardsDataFile(publicCards, {
    generatedAt: input.generatedAt,
  })
  const restrictionsData = buildRestrictionsDataFile(input.restrictions, {
    generatedAt: input.generatedAt,
  })
  if (!cardsData.ok || !restrictionsData.ok) {
    addIssues(
      report,
      generationIssues(
        'generation',
        !cardsData.ok ? cardsData.errors : restrictionsData.errors,
      ),
    )
    return finishFailure(report)
  }
  const serializedCards = serializeDataFile(cardsData.value)
  const serializedRestrictions = serializeDataFile(restrictionsData.value)
  if (!serializedCards.ok || !serializedRestrictions.ok) {
    addIssues(
      report,
      generationIssues(
        'serialization',
        !serializedCards.ok
          ? serializedCards.errors
          : serializedRestrictions.errors,
      ),
    )
    return finishFailure(report)
  }

  report.output = {
    publicCards: cardsData.value.cards.length,
    cardsDataVersion: cardsData.value.dataVersion,
    restrictions: restrictionsData.value.restrictions.length,
    restrictionsDataVersion: restrictionsData.value.dataVersion,
    cardsSerializedBytes: new TextEncoder().encode(serializedCards.value)
      .length,
    restrictionsSerializedBytes: new TextEncoder().encode(
      serializedRestrictions.value,
    ).length,
  }
  report.issues.sort(compareIssues)
  report.isPublishable = true
  const reportSerialization = serializeDataFile(report)
  if (!reportSerialization.ok) {
    addIssues(
      report,
      generationIssues('serialization', reportSerialization.errors),
    )
    return finishFailure(report)
  }

  const artifacts: CardPipelineDryRunArtifacts = {
    candidates,
    snapshots,
    cardsDataFile: cardsData.value,
    restrictionsDataFile: restrictionsData.value,
    generationReport: generationReport.value,
    serializedCards: serializedCards.value,
    serializedRestrictions: serializedRestrictions.value,
  }
  return { report, artifacts }
}

export function runCardPipelineDryRun(
  input: CardPipelineDryRunInput,
): CardPipelineDryRunResult {
  try {
    return runCardPipelineDryRunCore(input)
  } catch (error) {
    const report = emptyReport(input)
    addIssues(report, [
      fatal(
        'audit',
        'UNCLASSIFIED_PIPELINE_FAILURE',
        error instanceof Error ? error.message : String(error),
      ),
    ])
    return finishFailure(report)
  }
}
