/** @vitest-environment node */

import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildDiffSnapshot } from '../diff/buildDiffSnapshot'
import type { DiscoveredCard, DiscoveryResult } from '../discovery/types'
import type { FetchedCardDetail } from '../detailFetch/types'
import { fixtureManifest } from '../fixtures/manifest'
import { parseCardDetailHtml } from '../parser/parseCardDetail'
import type { RawCardDetail } from '../parser/types'
import { runCardPipelineDryRun } from './runCardPipelineDryRun'

const GENERATED_AT = '2026-09-04T00:00:00.000Z'
const fixtureRoot = resolve(process.cwd(), 'scripts/cards/fixtures')
const fixtureIds = [
  'detail-oshi-kiara-multiple-qa',
  'detail-buzz-houshou-marine',
  'detail-tool-stone-axe',
  'detail-cheer-white',
  'detail-spot-kanata',
  'detail-multicolor-fuwamoco',
  'detail-multicolor-fuwamoco-reprint',
] as const

afterEach(() => vi.unstubAllGlobals())

function parseSuccess(html: string, sourceUrl: string): RawCardDetail {
  const parsed = parseCardDetailHtml(html, sourceUrl)
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors))
  return parsed.value
}

async function fixtureInput() {
  const records = await Promise.all(
    fixtureIds.map(async (id) => {
      const fixture = fixtureManifest.find((entry) => entry.id === id)
      if (!fixture || fixture.kind !== 'detail') throw new Error(id)
      const html = await readFile(resolve(fixtureRoot, fixture.file), 'utf8')
      const parsed = parseSuccess(html, fixture.sourceUrl)
      const isParallel = parsed.officialId === '2545'
      const card: DiscoveredCard = {
        kind: 'card',
        officialId: parsed.officialId,
        detailUrl: fixture.sourceUrl,
        cardNumber: parsed.cardNumberRaw ?? '',
        name: parsed.nameRaw,
        ...(parsed.cardImage?.resolvedUrl
          ? { imageUrl: parsed.cardImage.resolvedUrl }
          : {}),
        isParallel,
        sourceSearchUrl:
          'https://hololive-official-cardgame.com/cardlist/cardsearch/?parallel%5B0%5D=all&view=text',
      }
      const detail: FetchedCardDetail = {
        card,
        html,
        parsed,
        source: 'cache',
      }
      return { card, detail }
    }),
  )
  const cards = records.map((record) => record.card)
  const discovery: DiscoveryResult = {
    pages: {},
    cards,
    specialEntries: [
      {
        kind: 'special',
        name: '説明entry',
        sourceSearchUrl:
          'https://hololive-official-cardgame.com/cardlist/cardsearch/',
      },
    ],
    counts: {
      totalCards: cards.length,
      uniqueCardNumbers: new Set(cards.map((card) => card.cardNumber)).size,
      parallelCards: cards.filter((card) => card.isParallel).length,
      nonParallelCards: cards.filter((card) => !card.isParallel).length,
      specialEntries: 1,
      multipleOfficialIdCardNumbers: 1,
      normalAndParallelCardNumbers: 1,
      duplicateOfficialIds: 0,
      classificationConflicts: 0,
      unclassifiedOfficialIds: 0,
    },
    isComplete: true,
    issues: [],
    requestCount: 0,
    retryCount: 0,
  }
  return {
    discovery,
    details: records.map((record) => record.detail),
    restrictions: [],
    generatedAt: GENERATED_AT,
    qaRelationScope: 'partial' as const,
  }
}

describe('card pipeline dry-run audit', () => {
  it('runs official fixtures end-to-end in memory without network access', async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('Network must not be used by the core audit runner.')
    })
    vi.stubGlobal('fetch', fetchSpy)
    const publicBefore = (
      await readdir(resolve(process.cwd(), 'public'))
    ).sort()
    const input = await fixtureInput()
    const result = runCardPipelineDryRun(input)
    const publicAfter = (await readdir(resolve(process.cwd(), 'public'))).sort()

    expect(result.report.isPublishable).toBe(true)
    expect(result.report.input).toEqual({
      discoveredCards: 7,
      specialEntries: 1,
      detailResults: 7,
    })
    expect(result.report.processing).toEqual({
      parsed: 7,
      normalized: 7,
      enriched: 7,
      logicalCards: 6,
      printings: 7,
      snapshots: 6,
    })
    expect(result.report.output).toMatchObject({
      publicCards: 6,
      restrictions: 0,
      cardsDataVersion: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    })
    expect(result.report.semanticOverrides).toMatchObject({
      configured: 3,
      applied: 0,
      missingTargets: 3,
      applications: [],
      dataVersionBefore: result.report.output?.cardsDataVersion,
      dataVersionAfter: result.report.output?.cardsDataVersion,
    })
    expect(result.artifacts?.serializedCards.endsWith('\n')).toBe(true)
    expect(JSON.parse(result.artifacts?.serializedCards ?? '')).toEqual(
      result.artifacts?.cardsDataFile,
    )
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(publicAfter).toEqual(publicBefore)
  })

  it('preserves FUWAMOCO printings, current canonical semantics, derive, search, and hash', async () => {
    const result = runCardPipelineDryRun(await fixtureInput())
    const candidate = result.artifacts?.candidates.find(
      (card) => card.cardNumber === 'hBP03-050',
    )
    const publicCard = result.artifacts?.cardsDataFile.cards.find(
      (card) => card.cardNumber === 'hBP03-050',
    )

    expect(candidate?.printings.map((printing) => printing.officialId)).toEqual(
      ['2545', '614'],
    )
    expect(candidate?.printings.map((printing) => printing.isParallel)).toEqual(
      [true, false],
    )
    expect(candidate).toMatchObject({
      imageUrl:
        'https://hololive-official-cardgame.com/wp-content/images/cardlist/hBP03/hBP03-050_R.png',
      representativeImageOfficialId: '614',
      officialUrl:
        'https://hololive-official-cardgame.com/cardlist/?faq=&id=2545',
      effectTags: ['cheer_acceleration'],
      criticalColors: [],
      searchText: expect.stringContaining('fuwamoco'),
    })
    expect(candidate?.qas).toHaveLength(12)
    expect(candidate?.conflicts.length).toBeGreaterThan(0)
    expect(
      result.artifacts?.snapshots.find(
        (snapshot) => snapshot.cardNumber === 'hBP03-050',
      )?.contentHash,
    ).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(publicCard).not.toHaveProperty('printings')
    expect(publicCard).not.toHaveProperty('conflicts')
    expect(publicCard).not.toHaveProperty('isParallel')
    expect(publicCard).not.toHaveProperty('representativeImageOfficialId')
    expect(publicCard?.imageUrl).toBe(candidate?.imageUrl)
  })

  it('audits parallel, canonical, representative image, Q&A, and conflicts', async () => {
    const { report } = runCardPipelineDryRun(await fixtureInput())

    expect(report.variants).toEqual({
      parallelPrintings: 1,
      nonParallelPrintings: 6,
      cardsWithMultiplePrintings: 1,
      cardsWithNormalAndParallel: 1,
      normalOnlyCards: 5,
      parallelOnlyCards: 0,
    })
    expect(report.canonicalPrintings).toEqual({
      parallel: 1,
      nonParallel: 5,
      missing: 0,
    })
    expect(report.representativeImages).toEqual({
      fromParallelPrinting: 0,
      fromNonParallelPrinting: 6,
      missing: 0,
      ambiguousSource: 0,
      normalAndParallelFromNonParallel: 1,
      normalAndParallelFromParallel: 0,
      parallelOnlyFromParallel: 0,
      normalOnlyFromNonParallel: 5,
      normalImageAvailableButParallel: 0,
    })
    expect(report.qas.cardsWithQa + report.qas.cardsWithoutQa).toBe(6)
    expect(report.qas.beforeMerge).toBeGreaterThanOrEqual(report.qas.afterMerge)
    expect(report.conflicts.total).toBe(
      report.conflicts.semantic + report.conflicts.qa,
    )
    expect(
      report.issues
        .filter((issue) => issue.code.startsWith('MERGE_'))
        .every((issue) => issue.severity === 'warning'),
    ).toBe(true)
    expect(Object.keys(report.conflicts.byKind)).toEqual(
      [...Object.keys(report.conflicts.byKind)].sort(),
    )
    expect(Object.keys(report.conflicts.byField)).toEqual(
      [...Object.keys(report.conflicts.byField)].sort(),
    )
  })

  it('preserves officialId and printing counts through same-cardNumber merge', async () => {
    const input = await fixtureInput()
    const result = runCardPipelineDryRun(input)
    const expectedIds = input.discovery.cards
      .map((card) => card.officialId)
      .sort()
    const actualIds =
      result.artifacts?.candidates
        .flatMap((card) =>
          card.printings.map((printing) => printing.officialId),
        )
        .sort() ?? []

    expect(actualIds).toEqual(expectedIds)
    expect(result.report.processing.printings).toBe(
      input.discovery.cards.length,
    )
    expect(result.report.processing.logicalCards).toBeLessThan(
      result.report.processing.printings,
    )
  })

  it('applies a confirmed Buzz correction between merge and derive', async () => {
    const input = await fixtureInput()
    const detailIndex = input.details.findIndex(
      (detail) => detail.card.cardNumber === 'hSD09-003',
    )
    const original = input.details[detailIndex]!
    const html = original.html
      .replaceAll('hSD09-003', 'hBP07-019')
      .replace('<dd>Buzzホロメン</dd>', '<dd>ホロメン</dd>')
    const parsed = parseSuccess(html, original.card.detailUrl)
    const card = { ...original.card, cardNumber: 'hBP07-019' }
    input.details[detailIndex] = { ...original, card, html, parsed }
    input.discovery.cards = input.discovery.cards.map((candidate) =>
      candidate.officialId === card.officialId ? card : candidate,
    )

    const result = runCardPipelineDryRun(input)
    const candidate = result.artifacts?.candidates.find(
      (item) => item.cardNumber === 'hBP07-019',
    )
    const publicCard = result.artifacts?.cardsDataFile.cards.find(
      (item) => item.cardNumber === 'hBP07-019',
    )

    expect(result.report.isPublishable).toBe(true)
    expect(result.report.semanticOverrides).toMatchObject({
      configured: 3,
      applied: 1,
      missingTargets: 2,
      applications: [
        {
          overrideId: 'confirmed-buzz-hbp07-019',
          cardNumber: 'hBP07-019',
          field: 'isBuzz',
          before: false,
          after: true,
          reason: expect.any(String),
        },
      ],
      dataVersionBefore: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      dataVersionAfter: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    })
    expect(result.report.semanticOverrides.dataVersionAfter).not.toBe(
      result.report.semanticOverrides.dataVersionBefore,
    )
    expect(candidate).toMatchObject({
      isBuzz: true,
      officialUrl: original.card.detailUrl,
      printings: [expect.objectContaining({ officialId: card.officialId })],
    })
    expect(publicCard?.isBuzz).toBe(true)
    expect(publicCard).not.toHaveProperty('semanticOverrides')
  })

  it('produces a deterministic report and output for the same input', async () => {
    const input = await fixtureInput()
    const first = runCardPipelineDryRun(input)
    const second = runCardPipelineDryRun({
      ...input,
      details: [...input.details].reverse(),
    })

    expect(second.report).toEqual(first.report)
    expect(second.artifacts?.serializedCards).toBe(
      first.artifacts?.serializedCards,
    )
  })

  it('connects previous snapshots to unchanged/changed diff and publication selection', async () => {
    const input = await fixtureInput()
    const initial = runCardPipelineDryRun(input)
    const snapshots = initial.artifacts?.snapshots ?? []
    const unchanged = runCardPipelineDryRun({
      ...input,
      previousSnapshots: snapshots,
    })
    expect(unchanged.report.diff).toMatchObject({
      unchanged: 6,
      changed: 0,
      added: 0,
    })

    const previous = snapshots.map((snapshot, index) => {
      if (index !== 0) return snapshot
      const changed = structuredClone(snapshot.card)
      changed.name = '以前の名称'
      return buildDiffSnapshot(changed)
    })
    const changed = runCardPipelineDryRun({
      ...input,
      previousSnapshots: previous,
    })
    expect(changed.report.diff).toMatchObject({ changed: 1, unchanged: 5 })
    expect(changed.artifacts?.cardsDataFile.cards).toHaveLength(6)
  })
})

describe('card pipeline fatal gates', () => {
  it('stops before parsing when Discovery is incomplete', async () => {
    const input = await fixtureInput()
    input.discovery.isComplete = false
    const result = runCardPipelineDryRun(input)
    expect(result.report).toMatchObject({
      isPublishable: false,
      processing: { parsed: 0 },
      issues: [expect.objectContaining({ code: 'DISCOVERY_INCOMPLETE' })],
    })
    expect(result.artifacts).toBeUndefined()
  })

  it('rejects missing and unknown extra details by officialId', async () => {
    const missingInput = await fixtureInput()
    missingInput.details = missingInput.details.slice(1)
    const missing = runCardPipelineDryRun(missingInput)
    expect(missing.report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'DETAIL_MISSING' }),
      ]),
    )

    const extraInput = await fixtureInput()
    const original = extraInput.details[0]!
    extraInput.details = [
      ...extraInput.details,
      {
        ...original,
        card: {
          ...original.card,
          officialId: '999999',
          detailUrl:
            'https://hololive-official-cardgame.com/cardlist/?id=999999',
        },
      },
    ]
    const extra = runCardPipelineDryRun(extraInput)
    expect(extra.report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'DETAIL_UNKNOWN_OFFICIAL_ID' }),
      ]),
    )
  })

  it('rejects contradictory duplicate details', async () => {
    const input = await fixtureInput()
    input.details = [
      ...input.details,
      {
        ...input.details[0]!,
        html: `${input.details[0]!.html}\n<!-- conflict -->`,
      },
    ]
    const result = runCardPipelineDryRun(input)
    expect(result.report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'DETAIL_DUPLICATE_CONFLICT' }),
      ]),
    )
  })

  it('reports and deduplicates an identical detail result', async () => {
    const input = await fixtureInput()
    input.details = [...input.details, input.details[0]!]
    const result = runCardPipelineDryRun(input)
    expect(result.report.isPublishable).toBe(true)
    expect(result.report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          code: 'DETAIL_DUPLICATE_DEDUPED',
        }),
      ]),
    )
  })

  it('rejects fetched identity contradictions and parser failures', async () => {
    const identityInput = await fixtureInput()
    identityInput.details = identityInput.details.map((detail, index) =>
      index === 0
        ? {
            ...detail,
            parsed: { ...detail.parsed, cardNumberRaw: 'WRONG-001' },
          }
        : detail,
    )
    const identity = runCardPipelineDryRun(identityInput)
    expect(identity.report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'DETAIL_IDENTITY_MISMATCH' }),
      ]),
    )

    const parserInput = await fixtureInput()
    parserInput.details = parserInput.details.map((detail, index) =>
      index === 0 ? { ...detail, html: '<main>invalid</main>' } : detail,
    )
    const parser = runCardPipelineDryRun(parserInput)
    expect(parser.report.isPublishable).toBe(false)
    expect(parser.report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: 'parse',
          code: 'MISSING_CONTENT_ROOT',
        }),
      ]),
    )
  })

  it('reports normalize failures as fatal', async () => {
    const input = await fixtureInput()
    input.details = input.details.map((detail, index) =>
      index === 0
        ? {
            ...detail,
            html: detail.html.replace(
              '<dd>推しホロメン</dd>',
              '<dd>未知カード種別</dd>',
            ),
          }
        : detail,
    )
    const result = runCardPipelineDryRun(input)
    expect(result.report.isPublishable).toBe(false)
    expect(result.report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'fatal',
          stage: 'normalize',
          code: 'UNKNOWN_CARD_TYPE',
        }),
      ]),
    )
  })

  it('rejects missing explicit parallel metadata', async () => {
    const input = await fixtureInput()
    const invalid = {
      ...input.discovery.cards[0]!,
      isParallel: undefined,
    } as unknown as DiscoveredCard
    input.discovery.cards = [invalid, ...input.discovery.cards.slice(1)]
    input.details = input.details.map((detail, index) =>
      index === 0 ? { ...detail, card: invalid } : detail,
    )
    const result = runCardPipelineDryRun(input)
    expect(result.report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'DISCOVERY_PARALLEL_METADATA_MISSING',
        }),
      ]),
    )
  })

  it('rejects invalid generation input without writing output', async () => {
    const input = await fixtureInput()
    input.generatedAt = 'invalid'
    const result = runCardPipelineDryRun(input)
    expect(result.report.isPublishable).toBe(false)
    expect(result.report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_GENERATED_AT' }),
      ]),
    )
  })
})
