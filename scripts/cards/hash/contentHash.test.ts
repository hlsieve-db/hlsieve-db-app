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
import { buildContentHashPayload } from './buildContentHashPayload'
import {
  computeCardContentHash,
  computeContentHash,
} from './computeContentHash'
import { stableStringify } from './stableStringify'
import type { CardContentHashPayload } from './types'

const fixtureRoot = resolve(process.cwd(), 'scripts/cards/fixtures')

function candidate(
  overrides: Partial<SearchIndexedCardCandidate> = {},
): SearchIndexedCardCandidate {
  return {
    cardNumber: 'hTEST-001',
    name: 'Test Card',
    cardType: 'holomem',
    isBuzz: false,
    colors: ['blue', 'red'],
    bloomLevel: 'first',
    hp: 100,
    tags: ['JP', '3期生'],
    isLimited: false,
    batonPass: [{ color: 'blue', count: 1 }],
    abilities: [{ type: 'normal', text: 'Ability A' }],
    arts: [
      {
        name: 'Art A',
        requiredCheers: [
          { color: 'blue', count: 1 },
          { color: 'any', count: 1 },
        ],
        damage: 50,
        effectText: 'Effect A',
        critical: { color: 'red', bonusDamage: 20 },
      },
    ],
    deckLimit: null,
    qas: [
      {
        question: 'Question A',
        answer: 'Answer A',
        qNumber: 1,
        publishedDate: '2026-01-01',
        relatedCardNumbers: ['hMETA-001'],
        sourceIndex: 0,
      },
      {
        question: 'Question B',
        answer: 'Answer B',
        relatedCardNumbers: [],
        sourceIndex: 1,
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
        products: [
          {
            name: 'Product B',
            category: 'Booster',
            releaseDate: '2026-02-01',
            detailUrl: 'https://example.com/product/b',
          },
        ],
        illustrator: 'Artist B',
      },
      {
        officialId: '01',
        officialUrl: 'https://example.com/card/1',
        imageUrl: 'https://example.com/card-1.png',
        products: [{ name: 'Product A' }],
      },
    ],
    conflicts: [
      {
        kind: 'semantic_conflict',
        cardNumber: 'hTEST-001',
        field: 'colors',
        canonicalOfficialId: '2',
        conflictingOfficialId: '01',
        canonicalValue: { blue: true, nested: { b: 2, a: 1 } },
        conflictingValue: ['blue', 'red'],
      },
      {
        kind: 'qa_conflict',
        cardNumber: 'hTEST-001',
        question: 'Question C',
        variants: [
          { answer: 'Answer Z', officialIds: ['2', '01', '2'] },
          { answer: 'Answer C', officialIds: ['x', '10'] },
        ],
      },
    ],
    effectTags: ['draw', 'bloom_effect'],
    criticalColors: ['red'],
    searchText: 'test card htest-001',
    ...overrides,
  }
}

function hash(card: SearchIndexedCardCandidate): string {
  return computeCardContentHash(card)
}

function changed(
  update: (card: SearchIndexedCardCandidate) => void,
): SearchIndexedCardCandidate {
  const value = structuredClone(candidate())
  update(value)
  return value
}

function expectSuccess<T>(
  result: ParseResult<T> | NormalizeResult<T> | MergeResult<T>,
): T {
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.value
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

async function fuwamocoCandidate(): Promise<SearchIndexedCardCandidate> {
  const original = await normalizedFixture('detail-multicolor-fuwamoco')
  const reprint = await normalizedFixture('detail-multicolor-fuwamoco-reprint')
  const merged = expectSuccess(mergeCardCandidates([original, reprint]))
  return toSearchIndexedCardCandidate(toDerivedCardCandidate(merged))
}

describe('stable card content hash', () => {
  it('returns the same hash for the same payload', () => {
    const payload = buildContentHashPayload(candidate())
    expect(computeContentHash(payload)).toBe(computeContentHash(payload))
    expect(
      new Set(Array.from({ length: 100 }, () => hash(candidate()))).size,
    ).toBe(1)
  })

  it('uses the sha256:<64 lowercase hex> format', () => {
    expect(hash(candidate())).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('is independent of object insertion order', () => {
    expect(stableStringify({ z: 1, a: { y: 2, b: 3 } })).toBe(
      stableStringify({ a: { b: 3, y: 2 }, z: 1 }),
    )
  })

  it('excludes searchText', () => {
    expect(hash(candidate())).toBe(
      hash(changed((card) => (card.searchText = 'other'))),
    )
    expect(buildContentHashPayload(candidate())).not.toHaveProperty(
      'searchText',
    )
  })

  it.each([
    ['name', (card: SearchIndexedCardCandidate) => (card.name = 'Other')],
    ['colors', (card: SearchIndexedCardCandidate) => (card.colors = ['green'])],
    [
      'bloomLevel',
      (card: SearchIndexedCardCandidate) => (card.bloomLevel = 'second'),
    ],
    ['hp', (card: SearchIndexedCardCandidate) => (card.hp = 110)],
    [
      'ability text',
      (card: SearchIndexedCardCandidate) => (card.abilities[0]!.text = 'Other'),
    ],
    [
      'art damage',
      (card: SearchIndexedCardCandidate) => (card.arts[0]!.damage = 60),
    ],
    [
      'art effect',
      (card: SearchIndexedCardCandidate) =>
        (card.arts[0]!.effectText = 'Other'),
    ],
    [
      'critical',
      (card: SearchIndexedCardCandidate) =>
        (card.arts[0]!.critical = { color: 'blue' }),
    ],
    [
      'extra text',
      (card: SearchIndexedCardCandidate) => (card.extraText = 'Extra'),
    ],
    ['deck limit', (card: SearchIndexedCardCandidate) => (card.deckLimit = 1)],
    ['isBuzz', (card: SearchIndexedCardCandidate) => (card.isBuzz = true)],
  ])('changes when semantic %s changes', (_label, update) => {
    expect(hash(candidate())).not.toBe(hash(changed(update)))
  })

  it('changes when effectTags change', () => {
    expect(hash(candidate())).not.toBe(
      hash(changed((card) => (card.effectTags = ['draw']))),
    )
  })

  it('changes when criticalColors change', () => {
    expect(hash(candidate())).not.toBe(
      hash(changed((card) => (card.criticalColors = ['blue']))),
    )
  })

  it('changes when a Q&A question changes', () => {
    expect(hash(candidate())).not.toBe(
      hash(changed((card) => (card.qas[0]!.question = 'Other'))),
    )
  })

  it('changes when a Q&A answer changes', () => {
    expect(hash(candidate())).not.toBe(
      hash(changed((card) => (card.qas[0]!.answer = 'Other'))),
    )
  })

  it('changes when Q&A order changes', () => {
    expect(hash(candidate())).not.toBe(
      hash(changed((card) => card.qas.reverse())),
    )
  })

  it('changes when Q&A is added or removed', () => {
    const added = changed((card) =>
      card.qas.push({
        question: 'Question C',
        answer: 'Answer C',
        relatedCardNumbers: [],
        sourceIndex: 2,
      }),
    )
    const removed = changed((card) => card.qas.pop())
    expect(hash(candidate())).not.toBe(hash(added))
    expect(hash(candidate())).not.toBe(hash(removed))
  })

  it('excludes Q&A metadata', () => {
    const other = changed((card) => {
      card.qas[0]!.qNumber = 999
      card.qas[0]!.publishedDate = '2099-12-31'
      card.qas[0]!.relatedCardNumbers = ['hOTHER-999']
      card.qas[0]!.sourceIndex = 999
    })
    expect(hash(candidate())).toBe(hash(other))
  })

  it('changes when the representative image changes', () => {
    expect(hash(candidate())).not.toBe(
      hash(changed((card) => (card.imageUrl = 'other'))),
    )
  })

  it('changes when a printing image changes', () => {
    expect(hash(candidate())).not.toBe(
      hash(changed((card) => (card.printings[0]!.imageUrl = 'other'))),
    )
  })

  it('changes when a printing is added', () => {
    expect(hash(candidate())).not.toBe(
      hash(
        changed((card) =>
          card.printings.push({
            officialId: '3',
            officialUrl: 'u',
            products: [],
          }),
        ),
      ),
    )
  })

  it.each([
    [
      'official URL',
      (card: SearchIndexedCardCandidate) =>
        (card.printings[0]!.officialUrl = 'other'),
    ],
    [
      'rarity',
      (card: SearchIndexedCardCandidate) => (card.printings[0]!.rarity = 'UR'),
    ],
    [
      'product addition',
      (card: SearchIndexedCardCandidate) =>
        card.printings[0]!.products.push({ name: 'Other' }),
    ],
    [
      'product release date',
      (card: SearchIndexedCardCandidate) =>
        (card.printings[0]!.products[0]!.releaseDate = '2099-01-01'),
    ],
    [
      'illustrator',
      (card: SearchIndexedCardCandidate) =>
        (card.printings[0]!.illustrator = 'Other'),
    ],
  ])('changes when printing %s changes', (_label, update) => {
    expect(hash(candidate())).not.toBe(hash(changed(update)))
  })

  it('ignores printing input order', () => {
    expect(hash(candidate())).toBe(
      hash(changed((card) => card.printings.reverse())),
    )
  })

  it('ignores tag order and duplicates', () => {
    expect(hash(candidate())).toBe(
      hash(changed((card) => (card.tags = ['3期生', 'JP', 'JP']))),
    )
  })

  it('uses fixed color order and deduplicates colors', () => {
    expect(hash(candidate())).toBe(
      hash(changed((card) => (card.colors = ['red', 'blue', 'red']))),
    )
  })

  it('ignores rarity, product, and illustrator set order', () => {
    const other = changed((card) => {
      card.rarities = ['R', 'SR', 'R']
      card.products = ['Product A', 'Product B', 'Product A']
      card.illustrators = ['Artist A', 'Artist B', 'Artist A']
    })
    expect(hash(candidate())).toBe(hash(other))
  })

  it('ignores critical color set order and duplicates', () => {
    const base = candidate({ criticalColors: ['red', 'blue'] })
    expect(hash(base)).toBe(
      hash({ ...base, criticalColors: ['blue', 'red', 'blue'] }),
    )
  })

  it('preserves ability order', () => {
    const base = candidate({ abilities: [{ text: 'A' }, { text: 'B' }] })
    expect(hash(base)).not.toBe(
      hash({ ...base, abilities: [...base.abilities].reverse() }),
    )
  })

  it('preserves art order', () => {
    const base = candidate({
      arts: [
        { name: 'A', requiredCheers: [] },
        { name: 'B', requiredCheers: [] },
      ],
    })
    expect(hash(base)).not.toBe(
      hash({ ...base, arts: [...base.arts].reverse() }),
    )
  })

  it('ignores RequiredCheer order', () => {
    expect(hash(candidate())).toBe(
      hash(changed((card) => card.arts[0]!.requiredCheers.reverse())),
    )
  })

  it('aggregates split same-color RequiredCheer costs', () => {
    const split = changed((card) => {
      card.batonPass = [
        { color: 'blue', count: 1 },
        { color: 'blue', count: 2 },
      ]
    })
    const combined = changed((card) => {
      card.batonPass = [{ color: 'blue', count: 3 }]
    })
    expect(hash(split)).toBe(hash(combined))
  })

  it('distinguishes an undefined deckLimit from null', () => {
    const absent = candidate()
    delete absent.deckLimit
    expect(hash(absent)).not.toBe(hash(candidate({ deckLimit: null })))
  })

  it('changes when conflict content changes', () => {
    expect(hash(candidate())).not.toBe(
      hash(
        changed((card) => {
          const conflict = card.conflicts[0]
          if (conflict?.kind === 'semantic_conflict')
            conflict.conflictingValue = ['blue']
        }),
      ),
    )
  })

  it('ignores conflict, variant, and variant officialId order', () => {
    const other = changed((card) => {
      card.conflicts.reverse()
      const conflict = card.conflicts.find(
        (entry) => entry.kind === 'qa_conflict',
      )
      if (conflict?.kind === 'qa_conflict') {
        conflict.variants.reverse()
        conflict.variants.forEach((variant) => variant.officialIds.reverse())
      }
    })
    expect(hash(candidate())).toBe(hash(other))
  })

  it('ignores object key order inside semantic conflict values', () => {
    const other = changed((card) => {
      const conflict = card.conflicts[0]
      if (conflict?.kind === 'semantic_conflict') {
        conflict.canonicalValue = { nested: { a: 1, b: 2 }, blue: true }
      }
    })
    expect(hash(candidate())).toBe(hash(other))
  })

  it('rejects NaN', () => {
    expect(() => hash(candidate({ hp: Number.NaN }))).toThrow(/non-finite/)
  })

  it('rejects Infinity', () => {
    expect(() => hash(candidate({ hp: Number.POSITIVE_INFINITY }))).toThrow(
      /non-finite/,
    )
  })
})

describe('FUWAMOCO full fixture pipeline', () => {
  it('hashes all merged public data deterministically', async () => {
    const indexed = await fuwamocoCandidate()
    const secondRun = await fuwamocoCandidate()
    const payload: CardContentHashPayload = buildContentHashPayload(indexed)
    const contentHash = computeContentHash(payload)

    expect(contentHash).toBe(
      'sha256:add519a5a08fd3a2b071a81e678189420970ede3f3c63a14c9725ec00666c789',
    )
    expect(contentHash).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(computeCardContentHash(secondRun)).toBe(contentHash)
    expect(payload.printings).toHaveLength(2)
    expect(
      payload.printings.filter((printing) => printing.imageUrl),
    ).toHaveLength(2)
    expect(payload.conflicts).toHaveLength(2)
    expect(payload.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'semantic_conflict', field: 'arts' }),
        expect.objectContaining({ kind: 'semantic_conflict', field: 'colors' }),
      ]),
    )
    expect(payload.qas).toHaveLength(12)
    expect(payload.effectTags).toEqual(['cheer_acceleration'])
    expect(payload.criticalColors).toEqual([])
    expect(payload).not.toHaveProperty('searchText')
  })
})
