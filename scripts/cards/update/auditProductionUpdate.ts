import { createHash } from 'node:crypto'

import { EFFECT_TAG_LABELS } from '../../../src/domain/cards/constants'
import {
  hasNoSingleProductReleaseDate,
  PRODUCT_RELEASE_DATES,
} from '../../../src/domain/cards/originalPrinting'
import type {
  Card,
  CardPrintingPublic,
  CardPrintingsDataFile,
  CardsDataFile,
  EffectTag,
} from '../../../src/domain/cards/types'
import {
  CURRENT_DECK_RESTRICTIONS,
  DECK_RULES_EFFECTIVE_FROM,
} from '../../../src/domain/decks/restrictions'
import { buildSitemap } from '../../seo/buildSitemap'
import { stableStringify } from '../hash/stableStringify'
import { semanticEqual } from '../merge/semanticComparison'
import { validateCardPrintingsSnapshotText } from '../publish/validateCardPrintingsSnapshot'
import { validateCardsSnapshotText } from '../publish/validateCardsSnapshot'
import type {
  UpdateAuditInput,
  UpdateAuditMessage,
  UpdateAuditReport,
  UpdateChangedCard,
} from './types'

const AUDITED_CARD_FIELDS = [
  'name',
  'cardType',
  'colors',
  'bloomLevel',
  'debutType',
  'isBuzz',
  'hp',
  'life',
  'supportType',
  'isLimited',
  'abilities',
  'arts',
  'effectTags',
  'criticalColors',
  'rarities',
  'products',
  'illustrators',
  'qas',
  'deckLimit',
  'releaseDate',
  'imageUrl',
] as const satisfies readonly (keyof Card)[]

const EFFECT_TAGS = Object.keys(EFFECT_TAG_LABELS) as EffectTag[]
const EXPECTED_IMAGE_HOST = 'hololive-official-cardgame.com'

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function delta(oldValue: number, nextValue: number) {
  return { old: oldValue, next: nextValue, delta: nextValue - oldValue }
}

function addMessage(
  target: UpdateAuditMessage[],
  code: string,
  message: string,
) {
  target.push({ code, message })
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right, 'en'))
}

function printingMap(data: CardPrintingsDataFile) {
  const values = new Map<string, CardPrintingPublic & { cardNumber: string }>()
  for (const [cardNumber, group] of Object.entries(data.cards)) {
    for (const printing of group.printings) {
      values.set(printing.officialId, { ...printing, cardNumber })
    }
  }
  return values
}

function countParallel(data: CardPrintingsDataFile, parallel: boolean): number {
  return Object.values(data.cards)
    .flatMap((group) => group.printings)
    .filter((printing) => printing.isParallel === parallel).length
}

function countProductAssociations(data: CardPrintingsDataFile): number {
  return Object.values(data.cards)
    .flatMap((group) => group.printings)
    .reduce((total, printing) => total + printing.products.length, 0)
}

function cardChanges(
  oldCard: Card,
  nextCard: Card,
): UpdateChangedCard | undefined {
  const fields = AUDITED_CARD_FIELDS.flatMap((field) =>
    semanticEqual(oldCard[field], nextCard[field])
      ? []
      : [
          {
            field,
            before: oldCard[field] ?? null,
            after: nextCard[field] ?? null,
          },
        ],
  )
  return fields.length > 0
    ? { cardNumber: nextCard.cardNumber, fields }
    : undefined
}

function effectTagCounts(cards: readonly Card[]) {
  return Object.fromEntries(
    EFFECT_TAGS.map((tag) => [
      tag,
      cards.filter((card) => card.effectTags.includes(tag)).length,
    ]),
  ) as Record<EffectTag, number>
}

function releaseDateForPrinting(printing: CardPrintingPublic) {
  const dates = printing.products.flatMap((product) => {
    const date = (PRODUCT_RELEASE_DATES as Readonly<Record<string, string>>)[
      product
    ]
    return date ? [date] : []
  })
  return dates.sort()[0]
}

function chronologyAudit(
  baseline: CardPrintingsDataFile,
  candidate: CardPrintingsDataFile,
) {
  const oldProducts = new Set(
    Object.values(baseline.cards).flatMap((group) =>
      group.printings.flatMap((printing) => printing.products),
    ),
  )
  const products = new Set(
    Object.values(candidate.cards).flatMap((group) =>
      group.printings.flatMap((printing) => printing.products),
    ),
  )
  const missingDates = new Set(
    [...products].filter(
      (product) =>
        !(
          product in (PRODUCT_RELEASE_DATES as Readonly<Record<string, string>>)
        ) && !hasNoSingleProductReleaseDate(product),
    ),
  )
  const intentionallyNoSingleReleaseDate = new Set(
    [...products].filter(hasNoSingleProductReleaseDate),
  )
  const ambiguousCards: string[] = []
  let multipleNonParallelCards = 0
  let fallbackCount = 0
  for (const [cardNumber, group] of Object.entries(candidate.cards)) {
    const nonParallel = group.printings.filter(
      (printing) => !printing.isParallel && printing.imageUrl,
    )
    if (nonParallel.length === 0) {
      fallbackCount += 1
      continue
    }
    if (nonParallel.length === 1) continue
    multipleNonParallelCards += 1
    const dated = nonParallel.map((printing) => ({
      imageUrl: printing.imageUrl as string,
      releaseDate: releaseDateForPrinting(printing),
    }))
    if (dated.some((item) => !item.releaseDate)) {
      ambiguousCards.push(cardNumber)
      fallbackCount += 1
      continue
    }
    const earliest = dated
      .map((item) => item.releaseDate as string)
      .sort()[0] as string
    const earliestImages = new Set(
      dated
        .filter((item) => item.releaseDate === earliest)
        .map((item) => item.imageUrl),
    )
    if (earliestImages.size !== 1) {
      ambiguousCards.push(cardNumber)
      fallbackCount += 1
    }
  }
  return {
    products: products.size,
    newProducts: sorted(
      [...products].filter((product) => !oldProducts.has(product)),
    ),
    missingProductReleaseDates: sorted(missingDates),
    intentionallyNoSingleReleaseDate: sorted(intentionallyNoSingleReleaseDate),
    multipleNonParallelCards,
    ambiguousCards: sorted(ambiguousCards),
    fallbackCount,
  }
}

function imageAudit(cards: readonly Card[]) {
  const missing: string[] = []
  const byUrl = new Map<string, string[]>()
  const hosts: Record<string, number> = {}
  for (const card of cards) {
    if (!card.imageUrl) {
      missing.push(card.cardNumber)
      continue
    }
    const numbers = byUrl.get(card.imageUrl) ?? []
    numbers.push(card.cardNumber)
    byUrl.set(card.imageUrl, numbers)
    let host = '(invalid)'
    try {
      host = new URL(card.imageUrl).host
    } catch {
      // Invalid URLs are also reported as unexpected hosts.
    }
    hosts[host] = (hosts[host] ?? 0) + 1
  }
  const duplicateUrls = sorted(
    [...byUrl.entries()]
      .filter(([, cardNumbers]) => cardNumbers.length > 1)
      .map(([url]) => url),
  )
  return {
    present: cards.length - missing.length,
    missing: sorted(missing),
    unique: byUrl.size,
    duplicateUrls,
    hostDistribution: Object.fromEntries(
      Object.entries(hosts).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
    unexpectedHosts: sorted(
      Object.keys(hosts).filter((host) => host !== EXPECTED_IMAGE_HOST),
    ),
  }
}

function blockedReport(
  input: UpdateAuditInput,
  blocks: UpdateAuditMessage[],
): UpdateAuditReport {
  const emptyData = {
    format: 'holocard-cards',
    formatVersion: 1,
    dataVersion: '',
    generatedAt: input.generatedAt,
    cards: [],
  } as CardsDataFile
  const emptyPrintings = {
    format: 'hlsieve-card-printings',
    formatVersion: 1,
    cardsDataVersion: '',
    dataVersion: '',
    cards: {},
  } as CardPrintingsDataFile
  return buildReport(
    input,
    emptyData,
    emptyPrintings,
    emptyData,
    emptyPrintings,
    [],
    blocks,
  )
}

function buildReport(
  input: UpdateAuditInput,
  baselineCards: CardsDataFile,
  baselinePrintings: CardPrintingsDataFile,
  candidateCards: CardsDataFile,
  candidatePrintings: CardPrintingsDataFile,
  warnings: UpdateAuditMessage[],
  blocks: UpdateAuditMessage[],
): UpdateAuditReport {
  const oldCards = new Map(
    baselineCards.cards.map((card) => [card.cardNumber, card]),
  )
  const nextCards = new Map(
    candidateCards.cards.map((card) => [card.cardNumber, card]),
  )
  const added = sorted(
    [...nextCards.keys()].filter((cardNumber) => !oldCards.has(cardNumber)),
  )
  const removed = sorted(
    [...oldCards.keys()].filter((cardNumber) => !nextCards.has(cardNumber)),
  )
  const changed = sorted(
    [...nextCards.keys()].filter((cardNumber) => oldCards.has(cardNumber)),
  ).flatMap((cardNumber) => {
    const value = cardChanges(
      oldCards.get(cardNumber)!,
      nextCards.get(cardNumber)!,
    )
    return value ? [value] : []
  })
  const semanticDeltaByField: Record<string, number> = {}
  for (const card of changed) {
    for (const field of card.fields) {
      semanticDeltaByField[field.field] =
        (semanticDeltaByField[field.field] ?? 0) + 1
    }
  }
  const oldPrintingMap = printingMap(baselinePrintings)
  const nextPrintingMap = printingMap(candidatePrintings)
  const addedOfficialIds = sorted(
    [...nextPrintingMap.keys()].filter((id) => !oldPrintingMap.has(id)),
  )
  const removedOfficialIds = sorted(
    [...oldPrintingMap.keys()].filter((id) => !nextPrintingMap.has(id)),
  )
  const changedOfficialIds = sorted(
    [...nextPrintingMap.keys()].filter(
      (id) =>
        oldPrintingMap.has(id) &&
        stableStringify(oldPrintingMap.get(id)) !==
          stableStringify(nextPrintingMap.get(id)),
    ),
  )
  const oldEffects = effectTagCounts(baselineCards.cards)
  const nextEffects = effectTagCounts(candidateCards.cards)
  const effectTags = Object.fromEntries(
    EFFECT_TAGS.map((tag) => [tag, delta(oldEffects[tag], nextEffects[tag])]),
  ) as UpdateAuditReport['effectTags']
  const chronology = chronologyAudit(baselinePrintings, candidatePrintings)
  const images = imageAudit(candidateCards.cards)
  const expectedSitemap = buildSitemap(
    candidateCards.cards.map((card) => card.cardNumber),
  )
  const actualSitemapUrls = [
    ...input.candidateSitemap.matchAll(/<loc>[^<]+<\/loc>/g),
  ].length

  return {
    version: 1,
    generatedAt: input.generatedAt,
    status:
      blocks.length > 0
        ? 'blocked'
        : warnings.length > 0
          ? 'review_required'
          : 'safe',
    exitCode: blocks.length > 0 ? 3 : warnings.length > 0 ? 2 : 0,
    summary: {
      logicalCards: delta(
        baselineCards.cards.length,
        candidateCards.cards.length,
      ),
      printingGroups: delta(
        Object.keys(baselinePrintings.cards).length,
        Object.keys(candidatePrintings.cards).length,
      ),
      printings: delta(oldPrintingMap.size, nextPrintingMap.size),
      parallelPrintings: delta(
        countParallel(baselinePrintings, true),
        countParallel(candidatePrintings, true),
      ),
      nonParallelPrintings: delta(
        countParallel(baselinePrintings, false),
        countParallel(candidatePrintings, false),
      ),
    },
    versions: {
      oldCardsDataVersion: baselineCards.dataVersion,
      newCardsDataVersion: candidateCards.dataVersion,
      oldPrintingsDataVersion: baselinePrintings.dataVersion,
      newPrintingsDataVersion: candidatePrintings.dataVersion,
      cardsDataVersionLinkage:
        candidatePrintings.cardsDataVersion === candidateCards.dataVersion,
      files: {
        baselineCardsSha256: sha256(input.baselineCardsText),
        baselinePrintingsSha256: sha256(input.baselinePrintingsText),
        candidateCardsSha256: sha256(input.candidateCardsText),
        candidatePrintingsSha256: sha256(input.candidatePrintingsText),
      },
    },
    discovery: input.health,
    cards: {
      added,
      removed,
      changed,
      unchanged: candidateCards.cards.length - added.length - changed.length,
      semanticDeltaByField: Object.fromEntries(
        Object.entries(semanticDeltaByField).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
    },
    printings: {
      addedOfficialIds,
      removedOfficialIds,
      changedOfficialIds,
      productAssociations: delta(
        countProductAssociations(baselinePrintings),
        countProductAssociations(candidatePrintings),
      ),
    },
    effectTags,
    buzz: {
      confirmedOverrides: {
        'hBP07-019': nextCards.get('hBP07-019')?.isBuzz,
        'hBP07-048': nextCards.get('hBP07-048')?.isBuzz,
        'hBP07-076': nextCards.get('hBP07-076')?.isBuzz,
      },
    },
    chronology,
    images,
    seo: {
      expectedSitemapUrls: candidateCards.cards.length + 2,
      actualSitemapUrls,
      sitemapMatches: input.candidateSitemap === expectedSitemap,
    },
    restrictions: {
      effectiveFrom: DECK_RULES_EFFECTIVE_FROM,
      cardNumbers: CURRENT_DECK_RESTRICTIONS.map((item) => item.cardNumber),
      sourceReviewReminder:
        'Restricted-card rules are maintained separately; review the current official source before release.',
    },
    warnings,
    blocks,
  }
}

export function auditProductionUpdate(
  input: UpdateAuditInput,
): UpdateAuditReport {
  const blocks: UpdateAuditMessage[] = []
  const warnings: UpdateAuditMessage[] = []
  const baselineCardsValidation = validateCardsSnapshotText(
    input.baselineCardsText,
  )
  const candidateCardsValidation = validateCardsSnapshotText(
    input.candidateCardsText,
  )
  if (!baselineCardsValidation.ok) {
    addMessage(
      blocks,
      'BASELINE_CARDS_INVALID',
      baselineCardsValidation.errors.join('; '),
    )
  }
  if (!candidateCardsValidation.ok) {
    addMessage(
      blocks,
      'CANDIDATE_CARDS_INVALID',
      candidateCardsValidation.errors.join('; '),
    )
  }
  if (!baselineCardsValidation.ok || !candidateCardsValidation.ok) {
    return blockedReport(input, blocks)
  }
  try {
    const envelope = JSON.parse(input.candidatePrintingsText) as {
      cardsDataVersion?: unknown
    }
    if (
      typeof envelope.cardsDataVersion === 'string' &&
      envelope.cardsDataVersion !== candidateCardsValidation.value.dataVersion
    ) {
      addMessage(
        blocks,
        'CARDS_DATA_VERSION_MISMATCH',
        'card-printings.json cardsDataVersion does not match cards.json.',
      )
    }
  } catch {
    // The canonical printing validator below reports malformed JSON.
  }
  const baselinePrintingsValidation = validateCardPrintingsSnapshotText(
    input.baselinePrintingsText,
    baselineCardsValidation.value,
  )
  const candidatePrintingsValidation = validateCardPrintingsSnapshotText(
    input.candidatePrintingsText,
    candidateCardsValidation.value,
  )
  if (!baselinePrintingsValidation.ok) {
    addMessage(
      blocks,
      'BASELINE_PRINTINGS_INVALID',
      baselinePrintingsValidation.errors.join('; '),
    )
  }
  if (!candidatePrintingsValidation.ok) {
    addMessage(
      blocks,
      'CANDIDATE_PRINTINGS_INVALID',
      candidatePrintingsValidation.errors.join('; '),
    )
  }
  if (!baselinePrintingsValidation.ok || !candidatePrintingsValidation.ok) {
    return blockedReport(input, blocks)
  }

  const health = input.health
  if (!health.discoveryComplete) {
    addMessage(blocks, 'DISCOVERY_INCOMPLETE', 'Discovery is not complete.')
  }
  if (!health.expectedPageCoverageComplete) {
    addMessage(
      blocks,
      'PAGE_COVERAGE_INCOMPLETE',
      'Expected pagination coverage is incomplete.',
    )
  }
  if (health.discoveryRetries > 0 || health.detailRetries > 0) {
    addMessage(
      blocks,
      'RETRIES_REMAIN',
      'A production candidate must be prepared with zero retries.',
    )
  }
  if (
    health.detailFailed > 0 ||
    health.detailSucceeded !== health.detailExpected ||
    health.detailExpected !== health.discoveredPrintings
  ) {
    addMessage(
      blocks,
      'DETAIL_CACHE_INCOMPLETE',
      'Detail results do not cover every discovered printing.',
    )
  }
  if (health.invalidOfficialIds > 0 || health.duplicateOfficialIds > 0) {
    addMessage(
      blocks,
      'OFFICIAL_ID_INVALID',
      'Invalid or duplicate officialId values were reported.',
    )
  }

  const baselineCards = baselineCardsValidation.value
  const baselinePrintings = baselinePrintingsValidation.value
  const candidateCards = candidateCardsValidation.value
  const candidatePrintings = candidatePrintingsValidation.value
  const preliminary = buildReport(
    input,
    baselineCards,
    baselinePrintings,
    candidateCards,
    candidatePrintings,
    warnings,
    blocks,
  )
  if (preliminary.cards.removed.length > 0) {
    addMessage(
      blocks,
      'LOGICAL_REMOVAL',
      `${preliminary.cards.removed.length} logical Card removal(s) require manual approval.`,
    )
  }
  if (preliminary.printings.removedOfficialIds.length > 0) {
    addMessage(
      blocks,
      'PRINTING_REMOVAL',
      `${preliminary.printings.removedOfficialIds.length} printing removal(s) require manual approval.`,
    )
  }
  if (
    !preliminary.versions.cardsDataVersionLinkage &&
    !blocks.some((block) => block.code === 'CARDS_DATA_VERSION_MISMATCH')
  ) {
    addMessage(
      blocks,
      'CARDS_DATA_VERSION_MISMATCH',
      'card-printings.json cardsDataVersion does not match cards.json.',
    )
  }
  if (!preliminary.seo.sitemapMatches) {
    addMessage(
      blocks,
      'SITEMAP_MISMATCH',
      'Candidate sitemap does not exactly match logical Cards plus /cards and /updates.',
    )
  }
  if (preliminary.images.missing.length > 0) {
    addMessage(
      warnings,
      'IMAGE_URL_MISSING',
      `${preliminary.images.missing.length} logical Card image URL(s) are missing.`,
    )
  }
  if (preliminary.images.duplicateUrls.length > 0) {
    addMessage(
      warnings,
      'IMAGE_URL_DUPLICATE',
      `${preliminary.images.duplicateUrls.length} representative image URL(s) are duplicated.`,
    )
  }
  if (preliminary.images.unexpectedHosts.length > 0) {
    addMessage(
      warnings,
      'IMAGE_HOST_UNEXPECTED',
      `Unexpected image host(s): ${preliminary.images.unexpectedHosts.join(', ')}.`,
    )
  }
  const baselineChronology = chronologyAudit(
    baselinePrintings,
    baselinePrintings,
  )
  const newlyMissingDates =
    preliminary.chronology.missingProductReleaseDates.filter(
      (product) =>
        !baselineChronology.missingProductReleaseDates.includes(product),
    )
  const newlyAmbiguous = preliminary.chronology.ambiguousCards.filter(
    (cardNumber) => !baselineChronology.ambiguousCards.includes(cardNumber),
  )
  if (newlyMissingDates.length > 0 || newlyAmbiguous.length > 0) {
    addMessage(
      warnings,
      'CHRONOLOGY_REVIEW_REQUIRED',
      `New chronology gaps: ${newlyMissingDates.length} product date(s), ${newlyAmbiguous.length} ambiguous Card(s).`,
    )
  }
  if (preliminary.printings.productAssociations.delta < 0) {
    addMessage(
      warnings,
      'PRODUCT_ASSOCIATION_DECREASE',
      'Printing product associations decreased.',
    )
  }
  for (const [tag, counts] of Object.entries(preliminary.effectTags)) {
    if (
      counts.old > 0 &&
      Math.abs(counts.delta) >= Math.max(10, Math.ceil(counts.old * 0.25))
    ) {
      addMessage(
        warnings,
        'EFFECT_TAG_LARGE_DELTA',
        `${tag}: ${counts.old} -> ${counts.next} (${counts.delta}).`,
      )
    }
  }
  const baselineByNumber = new Map(
    baselineCards.cards.map((card) => [card.cardNumber, card]),
  )
  for (const cardNumber of ['hBP07-019', 'hBP07-048', 'hBP07-076'] as const) {
    if (
      baselineByNumber.get(cardNumber)?.isBuzz === true &&
      preliminary.buzz.confirmedOverrides[cardNumber] !== true
    ) {
      addMessage(
        blocks,
        'BUZZ_OVERRIDE_REGRESSION',
        `${cardNumber} must remain isBuzz=true.`,
      )
    }
  }
  return buildReport(
    input,
    baselineCards,
    baselinePrintings,
    candidateCards,
    candidatePrintings,
    warnings.sort((a, b) => a.code.localeCompare(b.code)),
    blocks.sort((a, b) => a.code.localeCompare(b.code)),
  )
}
