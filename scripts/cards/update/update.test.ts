// @vitest-environment node

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import type {
  Card,
  CardPrintingsDataFile,
  CardsDataFile,
} from '../../../src/domain/cards/types'
import { buildSitemap } from '../../seo/buildSitemap'
import { buildCardsDataFile } from '../generate/buildCardsDataFile'
import { buildDataVersion } from '../generate/buildDataVersion'
import { serializeDataFile } from '../generate/serializeDataFile'
import { auditProductionUpdate } from './auditProductionUpdate'
import {
  buildHistoryCandidate,
  hasReviewedHistoryEntry,
} from './buildHistoryCandidate'
import { renderUpdateReportMarkdown, writeUpdateReports } from './report'
import type { UpdateAuditInput, UpdatePreparationHealth } from './types'
import type { DiscoveryResult } from '../discovery/types'
import { hasCompletePageCoverage } from './workflow'

let baselineCardsText: string
let baselinePrintingsText: string
let baselineCards: CardsDataFile
let baselinePrintings: CardPrintingsDataFile

beforeAll(async () => {
  ;[baselineCardsText, baselinePrintingsText] = await Promise.all([
    readFile('public/cards.json', 'utf8'),
    readFile('public/card-printings.json', 'utf8'),
  ])
  baselineCards = JSON.parse(baselineCardsText) as CardsDataFile
  baselinePrintings = JSON.parse(baselinePrintingsText) as CardPrintingsDataFile
})

function serialize(value: unknown): string {
  const result = serializeDataFile(value)
  if (!result.ok)
    throw new Error(result.errors.map((error) => error.message).join('; '))
  return result.value
}

function buildCards(cards: readonly Card[]): CardsDataFile {
  const result = buildCardsDataFile(cards, {
    generatedAt: '2026-09-11T00:00:00.000Z',
  })
  if (!result.ok)
    throw new Error(result.errors.map((error) => error.message).join('; '))
  return result.value
}

function buildPrintings(
  cardsData: CardsDataFile,
  cards: CardPrintingsDataFile['cards'],
): CardPrintingsDataFile {
  const payload = {
    format: 'hlsieve-card-printings' as const,
    formatVersion: 1 as const,
    cards,
  }
  return {
    ...payload,
    cardsDataVersion: cardsData.dataVersion,
    dataVersion: buildDataVersion(payload),
  }
}

function safeHealth(printingCount: number): UpdatePreparationHealth {
  return {
    discoveryComplete: true,
    discoveryRetries: 0,
    expectedPageCoverageComplete: true,
    discoveredPrintings: printingCount,
    invalidOfficialIds: 0,
    duplicateOfficialIds: 0,
    detailExpected: printingCount,
    detailSucceeded: printingCount,
    detailFailed: 0,
    detailRetries: 0,
  }
}

function printingCount(data: CardPrintingsDataFile): number {
  return Object.values(data.cards).reduce(
    (total, group) => total + group.printings.length,
    0,
  )
}

function input(
  cards = baselineCards,
  printings = baselinePrintings,
  overrides: Partial<UpdateAuditInput> = {},
): UpdateAuditInput {
  const candidateCardsText = serialize(cards)
  const candidatePrintingsText = serialize(printings)
  return {
    baselineCardsText,
    baselinePrintingsText,
    candidateCardsText,
    candidatePrintingsText,
    candidateSitemap: buildSitemap(cards.cards.map((card) => card.cardNumber)),
    health: safeHealth(printingCount(printings)),
    generatedAt: '2026-09-11T00:00:00.000Z',
    ...overrides,
  }
}

function additiveCandidate() {
  const source = baselineCards.cards[0]
  const sourceGroup = baselinePrintings.cards[source.cardNumber]
  const cardNumber = 'hTEST-001'
  const officialId = '99999999'
  const imageUrl = `https://hololive-official-cardgame.com/wp-content/images/cardlist/${officialId}.png`
  const newCard: Card = {
    ...structuredClone(source),
    cardNumber,
    name: '更新テストカード',
    imageUrl,
    searchText: '更新テストカード htest-001',
    officialUrl: `https://hololive-official-cardgame.com/cardlist/?id=${officialId}`,
  }
  const cards = buildCards([...baselineCards.cards, newCard])
  const printings = buildPrintings(cards, {
    ...structuredClone(baselinePrintings.cards),
    [cardNumber]: {
      defaultPrintingOfficialId: officialId,
      printings: [
        {
          ...structuredClone(sourceGroup.printings[0]),
          officialId,
          officialUrl: newCard.officialUrl!,
          imageUrl,
        },
      ],
    },
  })
  return { cards, printings }
}

describe('production Card update audit', () => {
  it('requires every expected page in all three Discovery modes', () => {
    const page = (mode: 'all' | 'parallel_only' | 'non_parallel') => ({
      mode,
      searchUrl: 'https://example.test',
      rawEntryCount: 30,
      parsedEntryCount: 30,
      cards: [],
      specialEntries: [],
      duplicateOfficialIdCount: 0,
      partitionCount: 1,
      pagination: {
        currentPage: 1,
        maxPage: 3,
        fetchedPages: [1, 2, 3],
        pageEntryCounts: [15, 15, 0],
      },
      isComplete: true,
      issues: [],
    })
    const discovery = {
      pages: {
        all: page('all'),
        parallel_only: page('parallel_only'),
        non_parallel: page('non_parallel'),
      },
    } as unknown as DiscoveryResult
    expect(hasCompletePageCoverage(discovery)).toBe(true)
    discovery.pages.all!.pagination!.fetchedPages = [1, 2]
    expect(hasCompletePageCoverage(discovery)).toBe(false)
  })

  it('accepts a safe additive update and reports count/printing deltas', () => {
    const candidate = additiveCandidate()
    const report = auditProductionUpdate(
      input(candidate.cards, candidate.printings),
    )
    expect(report.status).toBe('safe')
    expect(report.exitCode).toBe(0)
    expect(report.cards.added).toContain('hTEST-001')
    expect(report.summary.logicalCards.delta).toBe(1)
    expect(report.summary.printings.delta).toBe(1)
  }, 15_000)

  it('reports PRカード as intentionally without a single date, not unknown', () => {
    const report = auditProductionUpdate(input())

    expect(report.chronology).toMatchObject({
      products: 37,
      missingProductReleaseDates: [],
      intentionallyNoSingleReleaseDate: ['PRカード'],
      multipleNonParallelCards: 111,
      ambiguousCards: [],
      fallbackCount: 67,
    })
    expect(report.status).toBe('safe')
  }, 15_000)

  it('audits the confirmed hBP07-076 Buzz correction as the only semantic change', () => {
    const original = baselineCards.cards.find(
      (card) => card.cardNumber === 'hBP07-076',
    )!
    const oldCards = buildCards(
      baselineCards.cards.map((card) =>
        card.cardNumber === original.cardNumber
          ? { ...card, isBuzz: false }
          : card,
      ),
    )
    const nextCards = buildCards(
      oldCards.cards.map((card) =>
        card.cardNumber === original.cardNumber
          ? { ...card, isBuzz: true }
          : card,
      ),
    )
    const groups = structuredClone(baselinePrintings.cards)
    const report = auditProductionUpdate({
      ...input(nextCards, buildPrintings(nextCards, groups)),
      baselineCardsText: serialize(oldCards),
      baselinePrintingsText: serialize(buildPrintings(oldCards, groups)),
    })

    expect(report.status).toBe('safe')
    expect(report.cards.changed).toEqual([
      {
        cardNumber: 'hBP07-076',
        fields: [{ field: 'isBuzz', before: false, after: true }],
      },
    ])
    expect(report.cards.semanticDeltaByField).toEqual({ isBuzz: 1 })
    expect(report.buzz.confirmedOverrides['hBP07-076']).toBe(true)
  }, 15_000)

  it('blocks a confirmed Buzz classification regression after publication', () => {
    const oldCards = buildCards(
      baselineCards.cards.map((card) =>
        card.cardNumber === 'hBP07-076' ? { ...card, isBuzz: true } : card,
      ),
    )
    const nextCards = buildCards(
      oldCards.cards.map((card) =>
        card.cardNumber === 'hBP07-076' ? { ...card, isBuzz: false } : card,
      ),
    )
    const groups = structuredClone(baselinePrintings.cards)
    const report = auditProductionUpdate({
      ...input(nextCards, buildPrintings(nextCards, groups)),
      baselineCardsText: serialize(oldCards),
      baselinePrintingsText: serialize(buildPrintings(oldCards, groups)),
    })

    expect(report.status).toBe('blocked')
    expect(report.blocks).toContainEqual(
      expect.objectContaining({ code: 'BUZZ_OVERRIDE_REGRESSION' }),
    )
  }, 15_000)

  it('blocks incomplete Discovery and maps it to exit 3', () => {
    const report = auditProductionUpdate(
      input(undefined, undefined, {
        health: {
          ...safeHealth(printingCount(baselinePrintings)),
          discoveryComplete: false,
        },
      }),
    )
    expect(report.exitCode).toBe(3)
    expect(report.blocks.map((item) => item.code)).toContain(
      'DISCOVERY_INCOMPLETE',
    )
  })

  it('blocks logical Card removals', () => {
    const removedNumber = baselineCards.cards[0].cardNumber
    const cards = buildCards(baselineCards.cards.slice(1))
    const groups = structuredClone(baselinePrintings.cards)
    delete groups[removedNumber]
    const report = auditProductionUpdate(
      input(cards, buildPrintings(cards, groups)),
    )
    expect(report.blocks.map((item) => item.code)).toContain('LOGICAL_REMOVAL')
  })

  it('blocks printing removals even when the logical Card remains', () => {
    const [cardNumber, group] = Object.entries(baselinePrintings.cards).find(
      ([, value]) => value.printings.length > 1,
    )!
    const groups = structuredClone(baselinePrintings.cards)
    groups[cardNumber].printings = group.printings.slice(0, -1)
    groups[cardNumber].defaultPrintingOfficialId =
      groups[cardNumber].printings[0].officialId
    const printings = buildPrintings(baselineCards, groups)
    const report = auditProductionUpdate(input(baselineCards, printings))
    expect(report.blocks.map((item) => item.code)).toContain('PRINTING_REMOVAL')
  })

  it('reports field-level semantic and EffectTag changes', () => {
    const original = baselineCards.cards.find(
      (card) => !card.effectTags.includes('gift'),
    )!
    const cards = buildCards(
      baselineCards.cards.map((card) =>
        card.cardNumber === original.cardNumber
          ? {
              ...card,
              name: `${card.name} 改訂`,
              releaseDate: '2026-09-11',
              effectTags: [...card.effectTags, 'gift'],
            }
          : card,
      ),
    )
    const printings = buildPrintings(
      cards,
      structuredClone(baselinePrintings.cards),
    )
    const report = auditProductionUpdate(input(cards, printings))
    const changed = report.cards.changed.find(
      (card) => card.cardNumber === original.cardNumber,
    )!
    expect(changed.fields.map((field) => field.field)).toEqual(
      expect.arrayContaining(['name', 'releaseDate', 'effectTags']),
    )
    expect(report.effectTags.gift.delta).toBe(1)
  })

  it('does not report NFKC format-only changes as semantic changes', () => {
    const original = baselineCards.cards.find(
      (card) => card.name !== card.name.normalize('NFKC'),
    )
    expect(original).toBeDefined()
    if (!original)
      throw new Error('Expected an NFKC-sensitive production name.')
    const cards = buildCards(
      baselineCards.cards.map((card) =>
        card.cardNumber === original.cardNumber
          ? { ...card, name: card.name.normalize('NFKC') }
          : card,
      ),
    )
    const printings = buildPrintings(
      cards,
      structuredClone(baselinePrintings.cards),
    )
    const report = auditProductionUpdate(input(cards, printings))
    expect(
      report.cards.changed.find(
        (card) => card.cardNumber === original.cardNumber,
      ),
    ).toBeUndefined()
  })

  it('blocks cardsDataVersion linkage mismatch', () => {
    const parsed = structuredClone(baselinePrintings)
    parsed.cardsDataVersion = 'sha256:wrong'
    const report = auditProductionUpdate(
      input(undefined, undefined, {
        candidatePrintingsText: serialize(parsed),
      }),
    )
    expect(report.status).toBe('blocked')
    expect(report.blocks.map((item) => item.code)).toContain(
      'CARDS_DATA_VERSION_MISMATCH',
    )
  })

  it('blocks a sitemap count/content mismatch', () => {
    const report = auditProductionUpdate(
      input(undefined, undefined, { candidateSitemap: buildSitemap([]) }),
    )
    expect(report.blocks.map((item) => item.code)).toContain('SITEMAP_MISMATCH')
  })

  it('warns about newly ambiguous original-printing chronology', () => {
    const [cardNumber, group] = Object.entries(baselinePrintings.cards).find(
      ([, value]) => value.printings.some((printing) => !printing.isParallel),
    )!
    const groups = structuredClone(baselinePrintings.cards)
    groups[cardNumber].printings.push({
      ...structuredClone(
        group.printings.find((printing) => !printing.isParallel)!,
      ),
      officialId: '99999998',
      officialUrl:
        'https://hololive-official-cardgame.com/cardlist/?id=99999998',
      imageUrl:
        'https://hololive-official-cardgame.com/wp-content/images/cardlist/99999998.png',
      products: ['未登録の商品'],
    })
    const printings = buildPrintings(baselineCards, groups)
    const report = auditProductionUpdate(input(baselineCards, printings))
    expect(report.status).toBe('review_required')
    expect(report.chronology.ambiguousCards).toContain(cardNumber)
    expect(report.chronology.missingProductReleaseDates).toContain(
      '未登録の商品',
    )
    expect(report.chronology.intentionallyNoSingleReleaseDate).toEqual([
      'PRカード',
    ])
    expect(report.warnings.map((item) => item.code)).toContain(
      'CHRONOLOGY_REVIEW_REQUIRED',
    )
  })

  it('warns about an unexpected representative image host', () => {
    const original = baselineCards.cards[0]
    const cards = buildCards(
      baselineCards.cards.map((card) =>
        card.cardNumber === original.cardNumber
          ? { ...card, imageUrl: 'https://images.example.test/card.png' }
          : card,
      ),
    )
    const groups = structuredClone(baselinePrintings.cards)
    const defaultPrinting = groups[original.cardNumber].printings.find(
      (printing) =>
        printing.officialId ===
        groups[original.cardNumber].defaultPrintingOfficialId,
    )!
    defaultPrinting.imageUrl = 'https://images.example.test/card.png'
    const report = auditProductionUpdate(
      input(cards, buildPrintings(cards, groups)),
    )
    expect(report.exitCode).toBe(2)
    expect(report.warnings.map((item) => item.code)).toContain(
      'IMAGE_HOST_UNEXPECTED',
    )
  })

  it('renders and writes machine- and human-readable reports', async () => {
    const report = auditProductionUpdate(input())
    const directory = await mkdtemp(join(tmpdir(), 'card-update-'))
    try {
      const jsonPath = join(directory, 'report.json')
      const markdownPath = join(directory, 'report.md')
      await writeUpdateReports(report, jsonPath, markdownPath)
      expect(JSON.parse(await readFile(jsonPath, 'utf8')).status).toBe('safe')
      expect(await readFile(markdownPath, 'utf8')).toBe(
        renderUpdateReportMarkdown(report),
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('builds review-only user history candidates for additive and correction updates', () => {
    const additiveData = additiveCandidate()
    const additiveReport = auditProductionUpdate(
      input(additiveData.cards, additiveData.printings),
    )
    expect(buildHistoryCandidate(additiveReport)).toMatchObject({
      addedCards: 1,
      addedPrintings: 1,
      changedCards: 0,
      summary: 'カードデータを1件追加しました',
    })
    expect(hasReviewedHistoryEntry(additiveReport, [])).toBe(false)
    expect(
      hasReviewedHistoryEntry(additiveReport, [
        buildHistoryCandidate(additiveReport),
      ]),
    ).toBe(true)

    const original = baselineCards.cards[0]
    const cards = buildCards(
      baselineCards.cards.map((card) =>
        card.cardNumber === original.cardNumber
          ? { ...card, name: `${card.name} 修正` }
          : card,
      ),
    )
    const correctionReport = auditProductionUpdate(
      input(
        cards,
        buildPrintings(cards, structuredClone(baselinePrintings.cards)),
      ),
    )
    expect(buildHistoryCandidate(correctionReport)).toMatchObject({
      addedCards: 0,
      changedCards: 1,
      summary: 'カード情報を1件修正しました',
    })
  })
})
