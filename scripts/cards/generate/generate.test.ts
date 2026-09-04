/** @vitest-environment node */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import type { Card } from '../../../src/domain/cards/types'
import type { CardRestriction } from '../../../src/domain/decks/types'
import { buildDiffSnapshot } from '../diff/buildDiffSnapshot'
import { diffCardSnapshots } from '../diff/diffCardSnapshots'
import type { CardDiffEntry, DiffResult } from '../diff/types'
import { toDerivedCardCandidate } from '../derive/deriveCardEffects'
import { fixtureManifest } from '../fixtures/manifest'
import { computeCardContentHash } from '../hash/computeContentHash'
import { mergeCardCandidates } from '../merge/mergeCardCandidates'
import type { MergeResult } from '../merge/types'
import { normalizeCardDetail } from '../normalize/normalizeCardDetail'
import type {
  NormalizeResult,
  PrintingAwareNormalizedCardCandidate,
} from '../normalize/types'
import { parseCardDetailHtml } from '../parser/parseCardDetail'
import type { ParseResult, RawCardDetail } from '../parser/types'
import { toSearchIndexedCardCandidate } from '../searchIndex/buildSearchText'
import type { SearchIndexedCardCandidate } from '../searchIndex/types'
import { buildCardsDataFile } from './buildCardsDataFile'
import { buildGenerationReport } from './buildGenerationReport'
import { buildRestrictionsDataFile } from './buildRestrictionsDataFile'
import { selectCardsForPublication } from './selectCardsForPublication'
import { serializeDataFile } from './serializeDataFile'
import { toPublicCard } from './toPublicCard'
import type { GenerationResult } from './types'

const GENERATED_AT = '2026-09-03T10:00:00.000Z'
const fixtureRoot = resolve(process.cwd(), 'scripts/cards/fixtures')

function candidate(
  cardNumber = 'hTEST-001',
  overrides: Partial<SearchIndexedCardCandidate> = {},
): SearchIndexedCardCandidate {
  return {
    cardNumber,
    name: 'テストカード',
    cardType: 'oshi',
    isBuzz: false,
    colors: ['blue', 'red'],
    bloomLevel: 'first',
    debutType: 'extra',
    hp: 100,
    life: 6,
    tags: ['JP', '3期生'],
    supportType: 'tool',
    isLimited: true,
    supportSearchCategory: 'limited',
    batonPass: [{ color: 'blue', count: 1 }],
    abilities: [{ type: 'bloom', text: '能力本文' }],
    arts: [
      {
        name: 'アーツ名',
        requiredCheers: [{ color: 'red', count: 2 }],
        damage: 50,
        effectText: 'アーツ効果本文',
        critical: { color: 'red', bonusDamage: 20 },
      },
    ],
    extraText: 'エクストラ本文',
    deckLimit: 2,
    qas: [
      {
        question: '質問ですか？',
        answer: '回答です。',
        qNumber: 100,
        publishedDate: '2026-01-01',
        relatedCardNumbers: ['hMETA-001'],
        sourceIndex: 3,
      },
    ],
    imageUrl: 'https://example.com/card.png',
    officialUrl: 'https://example.com/card/1',
    rarities: ['SR'],
    products: ['商品A'],
    illustrators: ['絵師A'],
    releaseDate: '2026-01-01',
    printings: [
      {
        officialId: '1',
        officialUrl: 'https://example.com/card/1',
        isParallel: false,
        imageUrl: 'https://example.com/printing.png',
        products: [{ name: '商品A' }],
      },
    ],
    conflicts: [],
    effectTags: ['bloom_effect', 'draw'],
    criticalColors: ['red'],
    searchText: 'てすとかーど ability',
    ...overrides,
  }
}

function changedCard(
  update: (value: SearchIndexedCardCandidate) => void,
  base = candidate(),
): SearchIndexedCardCandidate {
  const value = structuredClone(base)
  update(value)
  return value
}

function expectSuccess<T>(result: GenerationResult<T>): T
function expectSuccess<T>(result: DiffResult<T>): T
function expectSuccess<T>(
  result: ParseResult<T> | NormalizeResult<T> | MergeResult<T>,
): T
function expectSuccess<T>(
  result:
    | GenerationResult<T>
    | DiffResult<T>
    | ParseResult<T>
    | NormalizeResult<T>
    | MergeResult<T>,
): T {
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.value
}

function publicCard(
  source = candidate(),
  options: { nameReading?: string } = {},
): Card {
  return expectSuccess(toPublicCard(source, options))
}

function snapshotDiff(
  previous: SearchIndexedCardCandidate | undefined,
  current: SearchIndexedCardCandidate | undefined,
  options: {
    failure?: CardDiffEntry['failure']
    discoveryComplete?: boolean
  } = {},
): CardDiffEntry {
  return expectSuccess(
    diffCardSnapshots({
      previous: previous ? buildDiffSnapshot(previous) : undefined,
      current: current ? buildDiffSnapshot(current) : undefined,
      failure: options.failure,
      discoveryComplete: options.discoveryComplete ?? true,
    }),
  )
}

async function normalizedFixture(
  id: string,
): Promise<PrintingAwareNormalizedCardCandidate> {
  const fixture = fixtureManifest.find((entry) => entry.id === id)
  if (!fixture || fixture.kind !== 'detail') throw new Error(id)
  const html = await readFile(resolve(fixtureRoot, fixture.file), 'utf8')
  const raw: RawCardDetail = expectSuccess(
    parseCardDetailHtml(html, fixture.sourceUrl),
  )
  return { ...expectSuccess(normalizeCardDetail(raw)), isParallel: false }
}

async function fuwamocoCandidate(): Promise<SearchIndexedCardCandidate> {
  const original = await normalizedFixture('detail-multicolor-fuwamoco')
  const reprint = await normalizedFixture('detail-multicolor-fuwamoco-reprint')
  const merged = expectSuccess(mergeCardCandidates([original, reprint]))
  return toSearchIndexedCardCandidate(toDerivedCardCandidate(merged))
}

describe('toPublicCard', () => {
  it('explicitly maps every basic Card field and optional nameReading', () => {
    const source = candidate()
    const result = publicCard(source, { nameReading: 'てすとかーど' })
    expect(result).toEqual({
      cardNumber: source.cardNumber,
      name: source.name,
      imageUrl: source.imageUrl,
      nameReading: 'てすとかーど',
      cardType: source.cardType,
      colors: source.colors,
      bloomLevel: source.bloomLevel,
      isBuzz: source.isBuzz,
      debutType: source.debutType,
      hp: source.hp,
      life: source.life,
      tags: source.tags,
      supportType: source.supportType,
      isLimited: source.isLimited,
      supportSearchCategory: source.supportSearchCategory,
      abilities: source.abilities,
      arts: source.arts,
      batonPass: source.batonPass,
      extraText: source.extraText,
      effectTags: source.effectTags,
      criticalColors: source.criticalColors,
      rarities: source.rarities,
      products: source.products,
      illustrators: source.illustrators,
      qas: [{ question: '質問ですか？', answer: '回答です。' }],
      deckLimit: source.deckLimit,
      releaseDate: source.releaseDate,
      searchText: source.searchText,
      officialUrl: source.officialUrl,
    })
  })

  it('does not infer nameReading', () => {
    expect(publicCard()).not.toHaveProperty('nameReading')
  })

  it('keeps the public Card shape free of printing parallel metadata', () => {
    const result = publicCard()
    expect(result).not.toHaveProperty('isParallel')
    expect(result).not.toHaveProperty('printings')
  })

  it.each([
    ['life', (value: Card) => value.life, 6],
    [
      'batonPass',
      (value: Card) => value.batonPass,
      [{ color: 'blue', count: 1 }],
    ],
    ['extraText', (value: Card) => value.extraText, 'エクストラ本文'],
    [
      'Art.effectText',
      (value: Card) => value.arts[0]?.effectText,
      'アーツ効果本文',
    ],
    [
      'imageUrl',
      (value: Card) => value.imageUrl,
      'https://example.com/card.png',
    ],
    ['effectTags', (value: Card) => value.effectTags, ['bloom_effect', 'draw']],
    ['criticalColors', (value: Card) => value.criticalColors, ['red']],
    ['searchText', (value: Card) => value.searchText, 'てすとかーど ability'],
  ])('preserves %s', (_label, read, expected) => {
    expect(read(publicCard())).toEqual(expected)
  })

  it('publishes only Q&A question and answer in original order', () => {
    const result = publicCard(
      candidate('hTEST-001', {
        qas: [
          ...candidate().qas,
          {
            question: '二問目',
            answer: '二答目',
            relatedCardNumbers: [],
            sourceIndex: 4,
          },
        ],
      }),
    )
    expect(result.qas).toEqual([
      { question: '質問ですか？', answer: '回答です。' },
      { question: '二問目', answer: '二答目' },
    ])
    expect(result.qas[0]).not.toHaveProperty('qNumber')
    expect(result.qas[0]).not.toHaveProperty('publishedDate')
    expect(result.qas[0]).not.toHaveProperty('relatedCardNumbers')
    expect(result.qas[0]).not.toHaveProperty('sourceIndex')
  })

  it('does not expose printings or conflicts', () => {
    const result = publicCard(
      candidate('hTEST-001', {
        conflicts: [
          {
            kind: 'qa_conflict',
            cardNumber: 'hTEST-001',
            question: 'Q',
            variants: [],
          },
        ],
      }),
    )
    expect(result).not.toHaveProperty('printings')
    expect(result).not.toHaveProperty('conflicts')
  })

  it.each([
    ['invalid image URL', { imageUrl: 'file:///card.png' }],
    ['non-HTTPS official URL', { officialUrl: 'http://example.com/card' }],
  ])('rejects %s', (_label, overrides) => {
    expect(toPublicCard(candidate('hTEST-001', overrides))).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: 'INVALID_PUBLIC_CARD' })],
    })
  })
})

describe('publication selection', () => {
  const oldCard = candidate()
  const newCard = changedCard((value) => (value.name = '新カード'), oldCard)

  it.each([
    ['added', snapshotDiff(undefined, oldCard), oldCard.name],
    ['changed', snapshotDiff(oldCard, newCard), newCard.name],
    [
      'unchanged',
      snapshotDiff(oldCard, structuredClone(oldCard)),
      oldCard.name,
    ],
  ])('uses current for %s', (_status, entry, expectedName) => {
    const selected = expectSuccess(selectCardsForPublication([entry]))
    expect(selected.map((value) => value.name)).toEqual([expectedName])
  })

  it.each([
    [
      'failed',
      snapshotDiff(oldCard, undefined, {
        failure: {
          cardNumber: oldCard.cardNumber,
          stage: 'fetch',
          message: 'timeout',
        },
      }),
    ],
    ['disappeared_candidate', snapshotDiff(oldCard, undefined)],
  ])('keeps previous for %s', (_status, entry) => {
    const selected = expectSuccess(selectCardsForPublication([entry]))
    expect(selected).toEqual([oldCard])
    const data = expectSuccess(
      buildCardsDataFile(
        selected.map((value) => publicCard(value)),
        {
          generatedAt: GENERATED_AT,
        },
      ),
    )
    expect(data.cards.map((value) => value.cardNumber)).toEqual([
      oldCard.cardNumber,
    ])
  })

  it('omits a failed new card instead of creating an empty Card', () => {
    const entry = snapshotDiff(undefined, undefined, {
      failure: { cardNumber: 'hNEW-001', stage: 'fetch', message: 'timeout' },
    })
    expect(expectSuccess(selectCardsForPublication([entry]))).toEqual([])
  })

  it('rejects duplicate publication cardNumbers', () => {
    const entry = snapshotDiff(undefined, oldCard)
    expect(selectCardsForPublication([entry, entry])).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: 'DUPLICATE_PUBLICATION_CARD' })],
    })
  })
})

describe('CardsDataFile', () => {
  it('builds format/version/time and sorts cards by cardNumber', () => {
    const data = expectSuccess(
      buildCardsDataFile(
        [
          publicCard(candidate('hTEST-010')),
          publicCard(candidate('hTEST-002')),
        ],
        { generatedAt: GENERATED_AT },
      ),
    )
    expect(data).toMatchObject({
      format: 'holocard-cards',
      formatVersion: 1,
      generatedAt: GENERATED_AT,
      dataVersion: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    })
    expect(data.cards.map((value) => value.cardNumber)).toEqual([
      'hTEST-002',
      'hTEST-010',
    ])
  })

  it('generates a deterministic version independent of input order and generatedAt', () => {
    const cards = [
      publicCard(candidate('hTEST-010')),
      publicCard(candidate('hTEST-002')),
    ]
    const first = expectSuccess(
      buildCardsDataFile(cards, { generatedAt: GENERATED_AT }),
    )
    const second = expectSuccess(
      buildCardsDataFile([...cards].reverse(), {
        generatedAt: '2027-01-01T00:00:00Z',
      }),
    )
    expect(first.dataVersion).toBe(second.dataVersion)
  })

  it.each([
    ['searchText', (value: Card) => (value.searchText = '別の検索索引')],
    [
      'imageUrl',
      (value: Card) => (value.imageUrl = 'https://example.com/other.png'),
    ],
    ['Q&A', (value: Card) => (value.qas[0]!.answer = '別回答')],
  ])('changes dataVersion when public %s changes', (_label, update) => {
    const before = publicCard()
    const after = structuredClone(before)
    update(after)
    const beforeFile = expectSuccess(
      buildCardsDataFile([before], { generatedAt: GENERATED_AT }),
    )
    const afterFile = expectSuccess(
      buildCardsDataFile([after], { generatedAt: GENERATED_AT }),
    )
    expect(beforeFile.dataVersion).not.toBe(afterFile.dataVersion)
  })

  it('changes public dataVersion but not contentHash for searchText-only changes', () => {
    const beforeCandidate = candidate()
    const afterCandidate = changedCard(
      (value) => (value.searchText = '別の検索索引'),
      beforeCandidate,
    )
    expect(computeCardContentHash(beforeCandidate)).toBe(
      computeCardContentHash(afterCandidate),
    )
    const before = expectSuccess(
      buildCardsDataFile([publicCard(beforeCandidate)], {
        generatedAt: GENERATED_AT,
      }),
    )
    const after = expectSuccess(
      buildCardsDataFile([publicCard(afterCandidate)], {
        generatedAt: GENERATED_AT,
      }),
    )
    expect(before.dataVersion).not.toBe(after.dataVersion)
  })

  it('rejects an invalid generatedAt and duplicate cardNumber', () => {
    expect(
      buildCardsDataFile([publicCard()], { generatedAt: 'not-a-date' }),
    ).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: 'INVALID_GENERATED_AT' })],
    })
    expect(
      buildCardsDataFile([publicCard(), publicCard()], {
        generatedAt: GENERATED_AT,
      }),
    ).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: 'DUPLICATE_PUBLICATION_CARD' })],
    })
  })
})

describe('RestrictionsDataFile', () => {
  const restrictions: CardRestriction[] = [
    {
      cardNumber: 'hTEST-010',
      maxCopies: 1,
      effectiveFrom: '2026-02-01',
      note: '制限',
    },
    { cardNumber: 'hTEST-002', maxCopies: 0, effectiveFrom: '2026-01-01' },
  ]

  it('accepts an explicit empty list', () => {
    const data = expectSuccess(
      buildRestrictionsDataFile([], { generatedAt: GENERATED_AT }),
    )
    expect(data).toMatchObject({
      format: 'holocard-restrictions',
      formatVersion: 1,
      generatedAt: GENERATED_AT,
      restrictions: [],
      dataVersion: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    })
  })

  it('sorts deterministically and permits maxCopies zero', () => {
    const data = expectSuccess(
      buildRestrictionsDataFile(restrictions, { generatedAt: GENERATED_AT }),
    )
    expect(data.restrictions.map((value) => value.cardNumber)).toEqual([
      'hTEST-002',
      'hTEST-010',
    ])
    expect(data.restrictions[0]?.maxCopies).toBe(0)
  })

  it('keeps dataVersion stable across input order and generatedAt', () => {
    const first = expectSuccess(
      buildRestrictionsDataFile(restrictions, { generatedAt: GENERATED_AT }),
    )
    const second = expectSuccess(
      buildRestrictionsDataFile([...restrictions].reverse(), {
        generatedAt: '2027-01-01T00:00:00Z',
      }),
    )
    expect(first.dataVersion).toBe(second.dataVersion)
  })

  it.each([
    ['negative maxCopies', { cardNumber: 'hTEST-001', maxCopies: -1 }],
    [
      'invalid date',
      { cardNumber: 'hTEST-001', maxCopies: 1, effectiveFrom: '2026-02-30' },
    ],
    [
      'reversed effective range',
      {
        cardNumber: 'hTEST-001',
        maxCopies: 1,
        effectiveFrom: '2026-03-01',
        effectiveTo: '2026-02-01',
      },
    ],
  ] as const)('rejects %s', (_label, restriction) => {
    expect(
      buildRestrictionsDataFile([restriction], { generatedAt: GENERATED_AT }),
    ).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: 'INVALID_RESTRICTION' })],
    })
  })
})

describe('generation report', () => {
  const previous = candidate()
  const current = changedCard((value) => {
    value.name = '変更後'
    value.conflicts = [
      {
        kind: 'semantic_conflict',
        cardNumber: value.cardNumber,
        field: 'colors',
        canonicalOfficialId: '2',
        conflictingOfficialId: '1',
        canonicalValue: ['blue'],
        conflictingValue: ['red'],
      },
      {
        kind: 'qa_conflict',
        cardNumber: value.cardNumber,
        question: 'Q',
        variants: [],
      },
    ]
  }, previous)

  it('reports counts, actions, change details, conflict summary, and sorted entries', () => {
    const entries = [
      snapshotDiff(undefined, candidate('hTEST-003')),
      snapshotDiff(previous, current),
      snapshotDiff(
        candidate('hTEST-002'),
        structuredClone(candidate('hTEST-002')),
      ),
      snapshotDiff(candidate('hTEST-004'), undefined),
      snapshotDiff(undefined, undefined, {
        failure: {
          cardNumber: 'hTEST-005',
          stage: 'fetch',
          message: 'timeout',
        },
      }),
      snapshotDiff(candidate('hTEST-006'), undefined, {
        failure: { cardNumber: 'hTEST-006', stage: 'parse', message: 'bad' },
      }),
    ]
    const report = expectSuccess(
      buildGenerationReport(entries, { generatedAt: GENERATED_AT }),
    )

    expect(report.counts).toEqual({
      total: 6,
      added: 1,
      changed: 1,
      unchanged: 1,
      failed: 2,
      disappearedCandidate: 1,
    })
    expect(report.entries.map((entry) => entry.cardNumber)).toEqual([
      'hTEST-001',
      'hTEST-002',
      'hTEST-003',
      'hTEST-004',
      'hTEST-005',
      'hTEST-006',
    ])
    expect(report.entries.map((entry) => entry.publicationAction)).toEqual([
      'use_current',
      'use_current',
      'use_current',
      'keep_previous',
      'omit_new_failure',
      'keep_previous',
    ])
    const changed = report.entries[0]
    expect(changed?.changedCategories).toEqual(['qa', 'printing', 'metadata'])
    expect(changed?.changedFields).toHaveLength(3)
    expect(changed?.conflictSummary).toEqual({
      semanticConflictCount: 1,
      semanticConflictFields: ['colors'],
      qaConflictCount: 1,
    })
  })
})

describe('serializeDataFile', () => {
  it('round-trips JSON, retains Japanese, and adds one trailing newline', () => {
    const data = expectSuccess(
      buildCardsDataFile([publicCard()], { generatedAt: GENERATED_AT }),
    )
    const serialized = expectSuccess(serializeDataFile(data))
    expect(JSON.parse(serialized)).toEqual(data)
    expect(serialized).toContain('テストカード')
    expect(serialized.endsWith('\n')).toBe(true)
    expect(serialized.endsWith('\n\n')).toBe(false)
  })

  it.each([
    ['NaN', { value: Number.NaN }],
    ['Infinity', { value: Number.POSITIVE_INFINITY }],
    ['undefined array item', { value: [undefined] }],
  ])('rejects invalid JSON value %s', (_label, value) => {
    expect(serializeDataFile(value)).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: 'INVALID_JSON_VALUE' })],
    })
  })
})

describe('FUWAMOCO fixture generation pipeline', () => {
  it('produces the final public Card without internal printing or conflict data', async () => {
    const previous = await fuwamocoCandidate()
    const current = await fuwamocoCandidate()
    const entry = snapshotDiff(previous, current)
    const selected = expectSuccess(selectCardsForPublication([entry]))
    const result = publicCard(selected[0])
    const dataFile = expectSuccess(
      buildCardsDataFile([result], { generatedAt: GENERATED_AT }),
    )

    expect(entry.afterHash).toBe(
      'sha256:095b92573b4444626fc7a4711fb4655eae14f28c1223d21bbbd89d576f11876b',
    )
    expect(result).toMatchObject({
      cardNumber: 'hBP03-050',
      name: 'FUWAMOCO',
      colors: ['blue'],
      imageUrl:
        'https://hololive-official-cardgame.com/wp-content/images/cardlist/hEB01/hBP03-050_R_02.png',
      releaseDate: '2025-03-21',
      qas: expect.any(Array),
      effectTags: ['cheer_acceleration'],
      criticalColors: [],
      officialUrl:
        'https://hololive-official-cardgame.com/cardlist/?faq=&id=2545',
    })
    expect(result.qas).toHaveLength(12)
    expect(result.rarities.length).toBeGreaterThan(0)
    expect(result.products.length).toBeGreaterThan(0)
    expect(result.illustrators.length).toBeGreaterThan(0)
    expect(result.searchText).toContain('fuwamoco')
    expect(result).not.toHaveProperty('printings')
    expect(result).not.toHaveProperty('conflicts')
    expect(dataFile.cards).toEqual([result])
  })
})
