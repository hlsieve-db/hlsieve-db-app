/** @vitest-environment node */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { toDerivedCardCandidate } from '../derive/deriveCardEffects'
import { fixtureManifest } from '../fixtures/manifest'
import { mergeCardCandidates } from '../merge/mergeCardCandidates'
import type { MergeResult } from '../merge/types'
import { normalizeCardDetail } from '../normalize/normalizeCardDetail'
import type {
  NormalizeResult,
  NormalizedCardCandidate,
} from '../normalize/types'
import { parseCardDetailHtml } from '../parser/parseCardDetail'
import type { ParseResult, RawCardDetail } from '../parser/types'
import { toSearchIndexedCardCandidate } from '../searchIndex/buildSearchText'
import type { SearchIndexedCardCandidate } from '../searchIndex/types'
import { buildDiffSnapshot } from './buildDiffSnapshot'
import { diffCardCollections } from './diffCardCollections'
import { diffCardSnapshots } from './diffCardSnapshots'
import type {
  CardCollectionDiffInput,
  CardDiffEntry,
  CardDiffSnapshot,
  CurrentCardFailure,
  DiffResult,
} from './types'

const fixtureRoot = resolve(process.cwd(), 'scripts/cards/fixtures')

function card(
  cardNumber = 'hTEST-001',
  overrides: Partial<SearchIndexedCardCandidate> = {},
): SearchIndexedCardCandidate {
  return {
    cardNumber,
    name: 'Test Card',
    cardType: 'holomem',
    isBuzz: false,
    colors: ['blue', 'red'],
    bloomLevel: 'first',
    hp: 100,
    tags: ['JP', '3期生'],
    isLimited: false,
    batonPass: [
      { color: 'blue', count: 1 },
      { color: 'red', count: 2 },
    ],
    abilities: [{ type: 'normal', text: 'Ability' }],
    arts: [
      {
        name: 'Art',
        requiredCheers: [
          { color: 'blue', count: 1 },
          { color: 'any', count: 1 },
        ],
        damage: 50,
        effectText: 'Effect',
      },
    ],
    qas: [
      {
        question: 'Question',
        answer: 'Answer',
        qNumber: 100,
        publishedDate: '2026-01-01',
        relatedCardNumbers: ['hMETA-001'],
        sourceIndex: 0,
      },
    ],
    imageUrl: 'https://example.com/card.png',
    officialUrl: 'https://example.com/card/2',
    rarities: ['SR', 'R'],
    products: ['Product B', 'Product A'],
    illustrators: ['Artist B', 'Artist A'],
    releaseDate: '2026-01-01',
    printings: [
      {
        officialId: '2',
        officialUrl: 'https://example.com/card/2',
        imageUrl: 'https://example.com/card-2.png',
        rarity: 'SR',
        products: [{ name: 'Product B', releaseDate: '2026-02-01' }],
        illustrator: 'Artist B',
      },
      {
        officialId: '1',
        officialUrl: 'https://example.com/card/1',
        imageUrl: 'https://example.com/card-1.png',
        products: [{ name: 'Product A' }],
      },
    ],
    conflicts: [],
    effectTags: ['draw'],
    criticalColors: ['red'],
    searchText: 'test card',
    ...overrides,
  }
}

function changedCard(
  update: (value: SearchIndexedCardCandidate) => void,
  base = card(),
): SearchIndexedCardCandidate {
  const value = structuredClone(base)
  update(value)
  return value
}

function expectSuccess<T>(result: DiffResult<T>): T
function expectSuccess<T>(
  result: ParseResult<T> | NormalizeResult<T> | MergeResult<T>,
): T
function expectSuccess<T>(
  result: DiffResult<T> | ParseResult<T> | NormalizeResult<T> | MergeResult<T>,
): T {
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.value
}

function diff(
  previous: CardDiffSnapshot | undefined,
  current: CardDiffSnapshot | undefined,
  options: {
    failure?: CurrentCardFailure
    discoveryComplete?: boolean
  } = {},
): CardDiffEntry {
  return expectSuccess(
    diffCardSnapshots({
      previous,
      current,
      failure: options.failure,
      discoveryComplete: options.discoveryComplete ?? true,
    }),
  )
}

function changedDiff(
  update: (value: SearchIndexedCardCandidate) => void,
): CardDiffEntry {
  const before = card()
  return diff(
    buildDiffSnapshot(before),
    buildDiffSnapshot(changedCard(update, before)),
  )
}

function collection(
  overrides: Partial<CardCollectionDiffInput> = {},
): CardCollectionDiffInput {
  return {
    previous: [],
    current: [],
    failures: [],
    discoveryComplete: true,
    ...overrides,
  }
}

async function normalizedFixture(id: string): Promise<NormalizedCardCandidate> {
  const fixture = fixtureManifest.find((entry) => entry.id === id)
  if (!fixture || fixture.kind !== 'detail') throw new Error(id)
  const html = await readFile(resolve(fixtureRoot, fixture.file), 'utf8')
  const raw: RawCardDetail = expectSuccess(
    parseCardDetailHtml(html, fixture.sourceUrl),
  )
  return expectSuccess(normalizeCardDetail(raw))
}

async function fuwamocoSnapshot(): Promise<CardDiffSnapshot> {
  const original = await normalizedFixture('detail-multicolor-fuwamoco')
  const reprint = await normalizedFixture('detail-multicolor-fuwamoco-reprint')
  const merged = expectSuccess(mergeCardCandidates([original, reprint]))
  return buildDiffSnapshot(
    toSearchIndexedCardCandidate(toDerivedCardCandidate(merged)),
  )
}

describe('card snapshot status', () => {
  it('classifies a current-only card as added', () => {
    const current = buildDiffSnapshot(card())
    expect(diff(undefined, current)).toMatchObject({
      status: 'added',
      changedCategories: [],
      afterHash: current.contentHash,
    })
  })

  it('classifies equal hashes as unchanged without comparing searchText', () => {
    const previous = buildDiffSnapshot(card())
    const current = structuredClone(previous)
    current.card.searchText = 'new aliases only'
    expect(diff(previous, current)).toMatchObject({
      status: 'unchanged',
      changedCategories: [],
      changedFields: [],
    })
  })

  it('classifies a missing previous card as disappeared_candidate only after complete discovery', () => {
    const previous = buildDiffSnapshot(card())
    const result = diff(previous, undefined)
    expect(result.status).toBe('disappeared_candidate')
    expect(result.before).toBe(previous)
  })

  it('prioritizes an explicit failure and keeps previous', () => {
    const previous = buildDiffSnapshot(card())
    const failure: CurrentCardFailure = {
      cardNumber: previous.cardNumber,
      stage: 'parse',
      message: 'invalid detail',
    }
    const result = diff(previous, undefined, { failure })
    expect(result).toMatchObject({
      status: 'failed',
      failure,
      before: previous,
    })
  })

  it('uses failed for a missing card when discovery is incomplete', () => {
    const result = diff(buildDiffSnapshot(card()), undefined, {
      discoveryComplete: false,
    })
    expect(result).toMatchObject({
      status: 'failed',
      failure: {
        stage: 'unknown',
        message: expect.stringContaining('DISCOVERY_INCOMPLETE'),
      },
    })
  })

  it('reports a failure without a previous or current snapshot', () => {
    const failure: CurrentCardFailure = {
      cardNumber: 'hNEW-001',
      stage: 'fetch',
      message: 'timeout',
    }
    expect(diff(undefined, undefined, { failure })).toMatchObject({
      cardNumber: 'hNEW-001',
      status: 'failed',
      failure,
    })
  })
})

describe('changed categories', () => {
  it.each([
    [
      'colors',
      (value: SearchIndexedCardCandidate) => (value.colors = ['blue']),
      'game_content',
    ],
    [
      'tags',
      (value: SearchIndexedCardCandidate) => (value.tags = ['EN']),
      'game_content',
    ],
    [
      'Q&A',
      (value: SearchIndexedCardCandidate) => (value.qas[0]!.answer = 'Other'),
      'qa',
    ],
    [
      'representative image',
      (value: SearchIndexedCardCandidate) => (value.imageUrl = 'other'),
      'printing',
    ],
    [
      'printing image',
      (value: SearchIndexedCardCandidate) =>
        (value.printings[0]!.imageUrl = 'other'),
      'printing',
    ],
    [
      'name',
      (value: SearchIndexedCardCandidate) => (value.name = 'Other'),
      'metadata',
    ],
    [
      'aggregate illustrator',
      (value: SearchIndexedCardCandidate) => (value.illustrators = ['Other']),
      'metadata',
    ],
    [
      'effectTags',
      (value: SearchIndexedCardCandidate) =>
        (value.effectTags = ['deck_search']),
      'derived',
    ],
    [
      'criticalColors',
      (value: SearchIndexedCardCandidate) => (value.criticalColors = ['blue']),
      'derived',
    ],
  ])('classifies %s changes as %s', (_label, update, category) => {
    expect(changedDiff(update)).toMatchObject({
      status: 'changed',
      changedCategories: [category],
    })
  })

  it('returns all simultaneous categories in fixed order', () => {
    const result = changedDiff((value) => {
      value.hp = 110
      value.qas[0]!.answer = 'Other'
      value.imageUrl = 'other'
      value.name = 'Other'
      value.effectTags = ['deck_search']
    })
    expect(result.changedCategories).toEqual([
      'game_content',
      'qa',
      'printing',
      'metadata',
      'derived',
    ])
  })

  it('classifies semantic conflict-only changes as printing', () => {
    const baseConflict = {
      kind: 'semantic_conflict' as const,
      cardNumber: 'hTEST-001',
      field: 'colors',
      canonicalOfficialId: '2',
      conflictingOfficialId: '1',
      canonicalValue: ['blue'],
      conflictingValue: ['blue', 'red'],
    }
    const previous = card('hTEST-001', { conflicts: [baseConflict] })
    const current = changedCard((value) => {
      const conflict = value.conflicts[0]
      if (conflict?.kind === 'semantic_conflict')
        conflict.conflictingValue = ['red']
    }, previous)
    expect(
      diff(buildDiffSnapshot(previous), buildDiffSnapshot(current))
        .changedCategories,
    ).toEqual(['printing'])
  })

  it('classifies qa_conflict-only changes as qa', () => {
    const previous = card('hTEST-001', {
      conflicts: [
        {
          kind: 'qa_conflict',
          cardNumber: 'hTEST-001',
          question: 'Question',
          variants: [{ answer: 'A', officialIds: ['1'] }],
        },
      ],
    })
    const current = changedCard((value) => {
      const conflict = value.conflicts[0]
      if (conflict?.kind === 'qa_conflict') conflict.variants[0]!.answer = 'B'
    }, previous)
    expect(
      diff(buildDiffSnapshot(previous), buildDiffSnapshot(current))
        .changedCategories,
    ).toEqual(['qa'])
  })

  it('classifies a printing addition and its optional aggregate metadata change', () => {
    const printingOnly = changedDiff((value) => {
      value.printings.push({
        officialId: '3',
        officialUrl: 'https://example.com/card/3',
        products: [{ name: 'Product C' }],
      })
    })
    const withMetadata = changedDiff((value) => {
      value.printings.push({
        officialId: '3',
        officialUrl: 'https://example.com/card/3',
        products: [{ name: 'Product C' }],
      })
      value.products.push('Product C')
    })
    expect(printingOnly.changedCategories).toEqual(['printing'])
    expect(withMetadata.changedCategories).toEqual(['printing', 'metadata'])
  })
})

describe('canonical diff boundaries', () => {
  it('ignores Q&A metadata-only changes', () => {
    const previous = buildDiffSnapshot(card())
    const currentCard = changedCard((value) => {
      value.qas[0]!.qNumber = 101
      value.qas[0]!.publishedDate = '2099-01-01'
      value.qas[0]!.relatedCardNumbers = ['hOTHER-001']
      value.qas[0]!.sourceIndex = 99
    })
    expect(diff(previous, buildDiffSnapshot(currentCard)).status).toBe(
      'unchanged',
    )
  })

  it('ignores semantic set order and duplicates', () => {
    const current = changedCard((value) => {
      value.colors = ['red', 'blue', 'red']
      value.tags = ['3期生', 'JP', 'JP']
      value.rarities = ['R', 'SR', 'R']
      value.products = ['Product A', 'Product B']
      value.illustrators = ['Artist A', 'Artist B']
    })
    expect(
      diff(buildDiffSnapshot(card()), buildDiffSnapshot(current)).status,
    ).toBe('unchanged')
  })

  it('ignores RequiredCheer order', () => {
    const current = changedCard((value) => {
      value.batonPass.reverse()
      value.arts[0]!.requiredCheers.reverse()
    })
    expect(
      diff(buildDiffSnapshot(card()), buildDiffSnapshot(current)).status,
    ).toBe('unchanged')
  })

  it('ignores printing order', () => {
    const current = changedCard((value) => value.printings.reverse())
    expect(
      diff(buildDiffSnapshot(card()), buildDiffSnapshot(current)).status,
    ).toBe('unchanged')
  })

  it('returns changedFields in category then lexicographical path order', () => {
    const result = changedDiff((value) => {
      value.tags = ['EN']
      value.hp = 120
      value.name = 'Other'
      value.products = ['Other']
    })
    expect(
      result.changedFields.map(({ category, path }) => [category, path]),
    ).toEqual([
      ['game_content', 'hp'],
      ['game_content', 'tags'],
      ['metadata', 'name'],
      ['metadata', 'products'],
    ])
    expect(
      changedDiff((value) => {
        value.tags = ['EN']
        value.hp = 120
        value.name = 'Other'
        value.products = ['Other']
      }).changedFields,
    ).toEqual(result.changedFields)
  })

  it('rejects a hash change with no category change', () => {
    const previous = buildDiffSnapshot(card())
    const current = {
      ...structuredClone(previous),
      contentHash: 'sha256:tampered',
    }
    const result = diffCardSnapshots({
      previous,
      current,
      discoveryComplete: true,
    })
    expect(result).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: 'UNCLASSIFIED_HASH_CHANGE' })],
    })
  })
})

describe('collection validation and ordering', () => {
  it('rejects current snapshot and failure for the same card', () => {
    const current = buildDiffSnapshot(card())
    const result = diffCardCollections(
      collection({
        current: [current],
        failures: [
          { cardNumber: current.cardNumber, stage: 'hash', message: 'bad' },
        ],
      }),
    )
    expect(result).toMatchObject({
      ok: false,
      errors: [
        expect.objectContaining({ code: 'CURRENT_AND_FAILURE_CONFLICT' }),
      ],
    })
  })

  it.each([
    ['previous', 'DUPLICATE_PREVIOUS_CARD'],
    ['current', 'DUPLICATE_CURRENT_CARD'],
  ] as const)('rejects duplicate %s snapshots', (field, code) => {
    const snapshot = buildDiffSnapshot(card())
    const result = diffCardCollections(
      collection({ [field]: [snapshot, snapshot] }),
    )
    expect(result).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code })],
    })
  })

  it('rejects contradictory failures', () => {
    const result = diffCardCollections(
      collection({
        failures: [
          { cardNumber: 'hTEST-001', stage: 'fetch', message: 'one' },
          { cardNumber: 'hTEST-001', stage: 'parse', message: 'two' },
        ],
      }),
    )
    expect(result).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: 'CONTRADICTORY_FAILURES' })],
    })
  })

  it('sorts entries by cardNumber regardless of input order', () => {
    const snapshots = ['hTEST-010', 'hTEST-002', 'hTEST-001'].map((number) =>
      buildDiffSnapshot(card(number)),
    )
    const report = expectSuccess(
      diffCardCollections(collection({ current: snapshots })),
    )
    expect(report.entries.map((entry) => entry.cardNumber)).toEqual([
      'hTEST-001',
      'hTEST-002',
      'hTEST-010',
    ])
  })
})

describe('FUWAMOCO fixture integration', () => {
  it('reports unchanged for two full pipeline runs and preserves the TASK-017 hash', async () => {
    const previous = await fuwamocoSnapshot()
    const current = await fuwamocoSnapshot()
    expect(previous.contentHash).toBe(
      'sha256:add519a5a08fd3a2b071a81e678189420970ede3f3c63a14c9725ec00666c789',
    )
    expect(current.contentHash).toBe(previous.contentHash)
    expect(diff(previous, current)).toMatchObject({
      cardNumber: 'hBP03-050',
      status: 'unchanged',
      changedCategories: [],
    })
  })

  it('reports a canonical colors change as game_content', async () => {
    const previous = await fuwamocoSnapshot()
    const currentCard = structuredClone(previous.card)
    currentCard.colors = ['green']
    const result = diff(previous, buildDiffSnapshot(currentCard))
    expect(result).toMatchObject({
      status: 'changed',
      changedCategories: ['game_content'],
      changedFields: [
        {
          category: 'game_content',
          path: 'colors',
          before: ['blue'],
          after: ['green'],
        },
      ],
    })
  })
})
