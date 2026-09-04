/** @vitest-environment node */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { fixtureManifest } from '../fixtures/manifest'
import { normalizeCardDetail } from '../normalize/normalizeCardDetail'
import type {
  NormalizeResult,
  PrintingAwareNormalizedCardCandidate,
} from '../normalize/types'
import { parseCardDetailHtml } from '../parser/parseCardDetail'
import type { ParseResult, RawCardDetail } from '../parser/types'
import type { NormalizedQaEntry } from '../qa/types'
import { mergeCardCandidates } from './mergeCardCandidates'
import {
  canonicalizeForSemanticComparison,
  semanticEqual,
} from './semanticComparison'
import type { MergeResult, MergedCardCandidate } from './types'

const fixtureRoot = resolve(process.cwd(), 'scripts/cards/fixtures')

function expectSuccess<T>(
  result: ParseResult<T> | NormalizeResult<T> | MergeResult<T>,
): T {
  if (!result.ok) {
    throw new Error(`Expected success: ${JSON.stringify(result.errors)}`)
  }
  return result.value
}

function candidate(
  overrides: Partial<PrintingAwareNormalizedCardCandidate> = {},
): PrintingAwareNormalizedCardCandidate {
  return {
    officialId: '1',
    officialUrl: 'https://example.com/card?id=1',
    isParallel: false,
    cardNumber: 'hTEST-001',
    name: 'Test Card',
    imageUrl: 'https://example.com/1.png',
    cardType: 'holomem',
    isBuzz: false,
    colors: ['blue'],
    bloomLevel: 'first',
    hp: 100,
    tags: ['#A'],
    isLimited: false,
    batonPass: [],
    abilities: [],
    arts: [],
    rarity: 'R',
    products: [
      {
        name: 'Original Product',
        releaseDate: '2025-01-01',
      },
    ],
    illustrator: 'Artist A',
    qas: [],
    ...overrides,
  }
}

function qa(
  question: string,
  answer: string,
  overrides: Partial<NormalizedQaEntry> = {},
): NormalizedQaEntry {
  return {
    question,
    answer,
    relatedCardNumbers: [],
    sourceIndex: 0,
    ...overrides,
  }
}

async function rawDetail(id: string): Promise<RawCardDetail> {
  const fixture = fixtureManifest.find((entry) => entry.id === id)
  if (!fixture || fixture.kind !== 'detail') {
    throw new Error(`Unknown detail fixture: ${id}`)
  }
  const html = await readFile(resolve(fixtureRoot, fixture.file), 'utf8')
  return expectSuccess(parseCardDetailHtml(html, fixture.sourceUrl))
}

async function normalizedFixture(
  id: string,
): Promise<PrintingAwareNormalizedCardCandidate> {
  return {
    ...expectSuccess(normalizeCardDetail(await rawDetail(id))),
    isParallel: false,
  }
}

function semanticConflicts(merged: MergedCardCandidate) {
  return merged.conflicts.filter(
    (conflict) => conflict.kind === 'semantic_conflict',
  )
}

describe('mergeCardCandidates fundamentals', () => {
  it('merges one candidate normally', () => {
    const merged = expectSuccess(mergeCardCandidates([candidate()]))

    expect(merged.cardNumber).toBe('hTEST-001')
    expect(merged.printings).toHaveLength(1)
    expect(merged.conflicts).toEqual([])
  })

  it('merges two printings into one logical card', () => {
    const merged = expectSuccess(
      mergeCardCandidates([
        candidate(),
        candidate({
          officialId: '2',
          officialUrl: 'https://example.com/card?id=2',
        }),
      ]),
    )

    expect(merged.printings.map((printing) => printing.officialId)).toEqual([
      '2',
      '1',
    ])
  })

  it('keeps normal and parallel variants as separate printings without a semantic conflict', () => {
    const merged = expectSuccess(
      mergeCardCandidates([
        candidate({ officialId: '1', isParallel: false }),
        candidate({
          officialId: '2',
          officialUrl: 'https://example.com/card?id=2',
          isParallel: true,
        }),
      ]),
    )

    expect(merged.printings).toEqual([
      expect.objectContaining({ officialId: '2', isParallel: true }),
      expect.objectContaining({ officialId: '1', isParallel: false }),
    ])
    expect(semanticConflicts(merged)).toEqual([])
  })

  it('fails an empty input', () => {
    const result = mergeCardCandidates([])
    expect(result.ok).toBe(false)
    expect(!result.ok && result.errors[0]?.code).toBe('EMPTY_MERGE_INPUT')
  })

  it('fails mixed card numbers instead of grouping them implicitly', () => {
    const result = mergeCardCandidates([
      candidate(),
      candidate({ officialId: '2', cardNumber: 'hTEST-002' }),
    ])
    expect(result.ok).toBe(false)
    expect(!result.ok && result.errors[0]?.code).toBe('MIXED_CARD_NUMBERS')
  })

  it('selects the canonical candidate independently of input order', () => {
    const older = candidate({ officialId: '100' })
    const newer = candidate({
      officialId: '2',
      officialUrl: 'https://example.com/newer',
      products: [{ name: 'New', releaseDate: '2026-01-01' }],
    })

    const forward = expectSuccess(mergeCardCandidates([older, newer]))
    const reversed = expectSuccess(mergeCardCandidates([newer, older]))
    expect(forward).toEqual(reversed)
    expect(forward.officialUrl).toBe('https://example.com/newer')
    expect(forward.printings[0]?.officialId).toBe('2')
  })

  it('uses numeric officialId descending for an equal latest date', () => {
    const merged = expectSuccess(
      mergeCardCandidates([
        candidate({ officialId: '9' }),
        candidate({ officialId: '10' }),
      ]),
    )
    expect(merged.printings[0]?.officialId).toBe('10')
  })

  it('uses officialId string descending when numeric comparison is unavailable', () => {
    const merged = expectSuccess(
      mergeCardCandidates([
        candidate({ officialId: 'alpha' }),
        candidate({ officialId: 'beta' }),
      ]),
    )
    expect(merged.printings[0]?.officialId).toBe('beta')
  })

  it('places candidates without a valid release date after dated candidates', () => {
    const merged = expectSuccess(
      mergeCardCandidates([
        candidate({ officialId: '100', products: [] }),
        candidate({ officialId: '1' }),
      ]),
    )
    expect(merged.printings[0]?.officialId).toBe('1')
  })

  it('uses the earliest valid product date as logical releaseDate', () => {
    const merged = expectSuccess(
      mergeCardCandidates([
        candidate(),
        candidate({
          officialId: '2',
          products: [{ name: 'Reprint', releaseDate: '2026-08-01' }],
        }),
      ]),
    )
    expect(merged.releaseDate).toBe('2025-01-01')
  })

  it('uses the canonical image and keeps every printing image', () => {
    const merged = expectSuccess(
      mergeCardCandidates([
        candidate(),
        candidate({
          officialId: '2',
          imageUrl: 'https://example.com/2.png',
          products: [{ name: 'New', releaseDate: '2026-01-01' }],
        }),
      ]),
    )

    expect(merged.imageUrl).toBe('https://example.com/2.png')
    expect(merged.representativeImageOfficialId).toBe('2')
    expect(merged.printings.map((printing) => printing.imageUrl)).toEqual([
      'https://example.com/2.png',
      'https://example.com/1.png',
    ])
  })

  it('falls back to the next ranked image without changing officialUrl', () => {
    const canonical = candidate({
      officialId: '2',
      officialUrl: 'https://example.com/canonical',
      imageUrl: undefined,
      products: [{ name: 'New', releaseDate: '2026-01-01' }],
    })
    const result = mergeCardCandidates([candidate(), canonical])
    const merged = expectSuccess(result)

    expect(merged.imageUrl).toBe('https://example.com/1.png')
    expect(merged.representativeImageOfficialId).toBe('1')
    expect(merged.officialUrl).toBe('https://example.com/canonical')
    expect(result.ok && result.warnings).toContainEqual(
      expect.objectContaining({ code: 'REPRESENTATIVE_IMAGE_FALLBACK' }),
    )
  })

  it('separates canonical semantics and officialUrl from a normal representative image', () => {
    const normal = candidate({
      officialId: '1',
      imageUrl: 'https://example.com/normal.png',
      hp: 100,
    })
    const parallel = candidate({
      officialId: '2',
      officialUrl: 'https://example.com/parallel',
      isParallel: true,
      imageUrl: 'https://example.com/parallel.png',
      hp: 120,
      products: [{ name: 'New', releaseDate: '2026-01-01' }],
    })
    const merged = expectSuccess(mergeCardCandidates([normal, parallel]))

    expect(merged.printings.map((printing) => printing.officialId)).toEqual([
      '2',
      '1',
    ])
    expect(merged.imageUrl).toBe('https://example.com/normal.png')
    expect(merged.representativeImageOfficialId).toBe('1')
    expect(merged.officialUrl).toBe('https://example.com/parallel')
    expect(merged.hp).toBe(120)
    expect(semanticConflicts(merged)).toContainEqual(
      expect.objectContaining({
        field: 'hp',
        canonicalOfficialId: '2',
        conflictingOfficialId: '1',
      }),
    )
  })

  it('uses canonical ranking within normal image candidates independently of input order', () => {
    const olderNormal = candidate({
      officialId: '1',
      imageUrl: 'https://example.com/normal-old.png',
    })
    const newerNormal = candidate({
      officialId: '2',
      imageUrl: 'https://example.com/normal-new.png',
      products: [{ name: 'New normal', releaseDate: '2026-01-01' }],
    })
    const newestParallel = candidate({
      officialId: '3',
      isParallel: true,
      imageUrl: 'https://example.com/parallel.png',
      products: [{ name: 'New parallel', releaseDate: '2027-01-01' }],
    })
    const input = [olderNormal, newestParallel, newerNormal]
    const forward = expectSuccess(mergeCardCandidates(input))
    const reversed = expectSuccess(mergeCardCandidates([...input].reverse()))

    expect(forward).toEqual(reversed)
    expect(forward.printings[0]?.officialId).toBe('3')
    expect(forward.imageUrl).toBe('https://example.com/normal-new.png')
    expect(forward.representativeImageOfficialId).toBe('2')
  })

  it('falls back deterministically to a ranked parallel image when normal images are missing', () => {
    const normalWithoutImage = candidate({
      officialId: '1',
      imageUrl: undefined,
    })
    const olderParallel = candidate({
      officialId: '2',
      isParallel: true,
      imageUrl: 'https://example.com/parallel-old.png',
    })
    const newerParallel = candidate({
      officialId: '3',
      isParallel: true,
      imageUrl: 'https://example.com/parallel-new.png',
      products: [{ name: 'New parallel', releaseDate: '2026-01-01' }],
    })
    const input = [olderParallel, normalWithoutImage, newerParallel]
    const forward = expectSuccess(mergeCardCandidates(input))
    const reversed = expectSuccess(mergeCardCandidates([...input].reverse()))

    expect(forward).toEqual(reversed)
    expect(forward.imageUrl).toBe('https://example.com/parallel-new.png')
    expect(forward.representativeImageOfficialId).toBe('3')
  })

  it('supports parallel-only, normal-only, and all-images-missing cards', () => {
    const parallelOnly = expectSuccess(
      mergeCardCandidates([candidate({ officialId: '2', isParallel: true })]),
    )
    const normalOnly = expectSuccess(mergeCardCandidates([candidate()]))
    const missing = expectSuccess(
      mergeCardCandidates([candidate({ imageUrl: undefined })]),
    )

    expect(parallelOnly.representativeImageOfficialId).toBe('2')
    expect(parallelOnly.imageUrl).toBe('https://example.com/1.png')
    expect(normalOnly.representativeImageOfficialId).toBe('1')
    expect(normalOnly.imageUrl).toBe('https://example.com/1.png')
    expect(missing.imageUrl).toBeUndefined()
    expect(missing.representativeImageOfficialId).toBeUndefined()
  })
})

describe('metadata, semantic, and Q&A merge rules', () => {
  it.each([
    ['digit width', '1', '１'],
    ['colon width', ':', '：'],
    ['colon in text', '効果:テキスト', '効果：テキスト'],
    ['digit in text', '1ダメージ', '１ダメージ'],
  ])(
    'treats %s as equal after NFKC for comparison only',
    (_label, left, right) => {
      expect(semanticEqual(left, right)).toBe(true)
    },
  )

  it.each([
    ['meaningful wording', '～の時', '～なら'],
    ['removed clause', '公開し、アーカイブする', 'アーカイブする'],
  ])('retains %s as a semantic difference', (_label, left, right) => {
    expect(semanticEqual(left, right)).toBe(false)
  })

  it('recursively canonicalizes string leaves without mutating source values', () => {
    const source = {
      abilities: [{ type: 'normal', text: '効果：１ダメージ' }],
      values: [null, true, 1],
    }
    const canonicalized = canonicalizeForSemanticComparison(source)

    expect(canonicalized).toEqual({
      abilities: [{ type: 'normal', text: '効果:1ダメージ' }],
      values: [null, true, 1],
    })
    expect(canonicalized).not.toBe(source)
    expect(source.abilities[0]?.text).toBe('効果：１ダメージ')
  })

  it.each([
    ['hBP01-104', 'abilities', 'このターンに1回', 'このターンに１回'],
    ['hBP04-055', 'arts', '効果:テキスト', '効果：テキスト'],
    ['hBP06-034', 'abilities', '条件:ドロー', '条件：ドロー'],
    ['hSD14-010', 'arts', '追加効果:回収', '追加効果：回収'],
  ] as const)(
    'does not emit a format-only conflict for %s',
    (cardNumber, field, halfWidth, fullWidth) => {
      const canonical = candidate({
        officialId: '2',
        cardNumber,
        products: [{ name: 'New', releaseDate: '2026-01-01' }],
        ...(field === 'abilities'
          ? { abilities: [{ type: 'normal', text: halfWidth }] }
          : {
              arts: [
                {
                  name: 'Art',
                  requiredCheers: [],
                  effectText: halfWidth,
                },
              ],
            }),
      })
      const variant = candidate({
        officialId: '1',
        cardNumber,
        ...(field === 'abilities'
          ? { abilities: [{ type: 'normal', text: fullWidth }] }
          : {
              arts: [
                {
                  name: 'Art',
                  requiredCheers: [],
                  effectText: fullWidth,
                },
              ],
            }),
      })
      const merged = expectSuccess(mergeCardCandidates([variant, canonical]))

      expect(semanticConflicts(merged)).toEqual([])
      expect(merged[field][0]).toEqual(canonical[field][0])
      expect(variant[field][0]).not.toEqual(canonical[field][0])
    },
  )

  it('keeps array length, order, requiredCheers, and Buzz differences', () => {
    const canonical = candidate({
      officialId: '2',
      isBuzz: false,
      abilities: [
        { type: 'normal', text: 'First' },
        { type: 'normal', text: 'Second' },
      ],
      arts: [
        {
          name: 'Art',
          requiredCheers: [{ color: 'any', count: 1 }],
        },
      ],
      products: [{ name: 'New', releaseDate: '2026-01-01' }],
    })
    const reordered = candidate({
      officialId: '1',
      isBuzz: true,
      abilities: [
        { type: 'normal', text: 'Second' },
        { type: 'normal', text: 'First' },
      ],
      arts: [
        {
          name: 'Art',
          requiredCheers: [
            { color: 'green', count: 1 },
            { color: 'any', count: 1 },
          ],
        },
      ],
    })
    const shorter = { ...reordered, officialId: '0', abilities: [] }
    const merged = expectSuccess(
      mergeCardCandidates([reordered, shorter, canonical]),
    )

    expect(semanticConflicts(merged).map((conflict) => conflict.field)).toEqual(
      ['isBuzz', 'abilities', 'arts', 'isBuzz', 'abilities', 'arts'],
    )
  })

  it('keeps the hBP01-050 requiredCheers change as an arts conflict', () => {
    const canonical = candidate({
      officialId: '2',
      cardNumber: 'hBP01-050',
      arts: [
        {
          name: 'Art',
          requiredCheers: [{ color: 'any', count: 1 }],
        },
      ],
      products: [{ name: 'New', releaseDate: '2026-01-01' }],
    })
    const older = candidate({
      officialId: '1',
      cardNumber: 'hBP01-050',
      arts: [
        {
          name: 'Art',
          requiredCheers: [
            { color: 'green', count: 1 },
            { color: 'any', count: 1 },
          ],
        },
      ],
    })
    const merged = expectSuccess(mergeCardCandidates([older, canonical]))

    expect(semanticConflicts(merged)).toEqual([
      expect.objectContaining({ field: 'arts' }),
    ])
  })

  it.each(['hBP07-019', 'hBP07-048', 'hBP07-076'])(
    'keeps the %s raw Buzz source inconsistency as a conflict',
    (cardNumber) => {
      const merged = expectSuccess(
        mergeCardCandidates([
          candidate({ officialId: '1', cardNumber, isBuzz: true }),
          candidate({
            officialId: '2',
            cardNumber,
            isBuzz: false,
            products: [{ name: 'New', releaseDate: '2026-01-01' }],
          }),
        ]),
      )

      expect(semanticConflicts(merged)).toEqual([
        expect.objectContaining({ field: 'isBuzz' }),
      ])
    },
  )

  it('aggregates tags, rarities, products, and illustrators in canonical rank order', () => {
    const original = candidate({
      tags: ['#A', '#Original'],
      products: [{ name: 'Original Product', releaseDate: '2025-01-01' }],
    })
    const reprint = candidate({
      officialId: '2',
      tags: ['#A', '#Reprint'],
      rarity: 'SR',
      products: [
        { name: 'Reprint Product', releaseDate: '2026-01-01' },
        { name: 'Original Product', releaseDate: '2025-01-01' },
      ],
      illustrator: 'Artist B',
    })
    const merged = expectSuccess(mergeCardCandidates([original, reprint]))

    expect(merged.tags).toEqual(['#A', '#Reprint', '#Original'])
    expect(merged.rarities).toEqual(['SR', 'R'])
    expect(merged.products).toEqual(['Reprint Product', 'Original Product'])
    expect(merged.illustrators).toEqual(['Artist B', 'Artist A'])
  })

  it('deduplicates exact Q&A while keeping first metadata', () => {
    const canonicalQa = qa('Question', 'Answer', {
      qNumber: 2,
      publishedDate: '2026-01-01',
      relatedCardNumbers: ['hTEST-001'],
    })
    const metadataVariant = qa('Question', 'Answer', {
      qNumber: 1,
      publishedDate: '2025-01-01',
      relatedCardNumbers: [],
    })
    const merged = expectSuccess(
      mergeCardCandidates([
        candidate({ qas: [metadataVariant] }),
        candidate({
          officialId: '2',
          qas: [canonicalQa],
          products: [{ name: 'New', releaseDate: '2026-01-01' }],
        }),
      ]),
    )

    expect(merged.qas).toEqual([canonicalQa])
    expect(
      merged.conflicts.some((conflict) => conflict.kind === 'qa_conflict'),
    ).toBe(false)
  })

  it('keeps canonical DOM order before unseen lower-ranked Q&A', () => {
    const first = qa('First', 'A', { sourceIndex: 0 })
    const second = qa('Second', 'B', { sourceIndex: 1 })
    const third = qa('Third', 'C', { sourceIndex: 0 })
    const merged = expectSuccess(
      mergeCardCandidates([
        candidate({ qas: [second, third] }),
        candidate({
          officialId: '2',
          qas: [first, second],
          products: [{ name: 'New', releaseDate: '2026-01-01' }],
        }),
      ]),
    )

    expect(merged.qas.map((entry) => entry.question)).toEqual([
      'First',
      'Second',
      'Third',
    ])
  })

  it('retains different answers and records a qa_conflict', () => {
    const merged = expectSuccess(
      mergeCardCandidates([
        candidate({ qas: [qa('Same question', 'Old answer')] }),
        candidate({
          officialId: '2',
          qas: [qa('Same question', 'New answer')],
          products: [{ name: 'New', releaseDate: '2026-01-01' }],
        }),
      ]),
    )
    const conflict = merged.conflicts.find(
      (entry) => entry.kind === 'qa_conflict',
    )

    expect(merged.qas.map((entry) => entry.answer)).toEqual([
      'New answer',
      'Old answer',
    ])
    expect(conflict).toMatchObject({
      kind: 'qa_conflict',
      question: 'Same question',
      variants: [
        { answer: 'New answer', officialIds: ['2'] },
        { answer: 'Old answer', officialIds: ['1'] },
      ],
    })
  })

  it('does not report conflicts for equal semantic values', () => {
    const merged = expectSuccess(
      mergeCardCandidates([candidate(), candidate({ officialId: '2' })]),
    )
    expect(semanticConflicts(merged)).toEqual([])
  })

  it.each([
    ['colors', { colors: ['red'] }],
    ['hp', { hp: 120 }],
    ['abilities', { abilities: [{ type: 'normal', text: 'Changed' }] }],
    [
      'arts',
      {
        arts: [
          {
            name: 'Changed art',
            requiredCheers: [],
            damage: 50,
            effectText: 'Changed effect',
          },
        ],
      },
    ],
  ] as const)(
    'records a %s semantic conflict without unioning',
    (field, change) => {
      const canonical = candidate({
        officialId: '2',
        products: [{ name: 'New', releaseDate: '2026-01-01' }],
      })
      const merged = expectSuccess(
        mergeCardCandidates([
          candidate(change as Partial<PrintingAwareNormalizedCardCandidate>),
          canonical,
        ]),
      )

      expect(semanticConflicts(merged)).toContainEqual(
        expect.objectContaining({ field, canonicalOfficialId: '2' }),
      )
      expect(merged[field as 'colors' | 'hp' | 'abilities' | 'arts']).toEqual(
        canonical[field as 'colors' | 'hp' | 'abilities' | 'arts'],
      )
    },
  )

  it('deduplicates an identical officialId deterministically', () => {
    const duplicate = candidate()
    const result = mergeCardCandidates([duplicate, { ...duplicate }])
    const merged = expectSuccess(result)

    expect(merged.printings).toHaveLength(1)
    expect(result.ok && result.warnings).toContainEqual(
      expect.objectContaining({ code: 'DUPLICATE_OFFICIAL_ID_DEDUPED' }),
    )
  })

  it('fails when a duplicate officialId has different content', () => {
    const result = mergeCardCandidates([candidate(), candidate({ hp: 120 })])

    expect(result.ok).toBe(false)
    expect(!result.ok && result.errors[0]?.code).toBe(
      'DUPLICATE_OFFICIAL_ID_CONFLICT',
    )
  })

  it('fails when the same officialId has contradictory parallel metadata', () => {
    const result = mergeCardCandidates([
      candidate({ isParallel: false }),
      candidate({ isParallel: true }),
    ])

    expect(result).toMatchObject({
      ok: false,
      errors: [
        expect.objectContaining({ code: 'DUPLICATE_OFFICIAL_ID_CONFLICT' }),
      ],
    })
  })
})

describe('FUWAMOCO official fixture integration', () => {
  it('merges both real printings without losing images or hiding colors conflict', async () => {
    const original = await normalizedFixture('detail-multicolor-fuwamoco')
    const reprint = {
      ...(await normalizedFixture('detail-multicolor-fuwamoco-reprint')),
      isParallel: true,
    }
    const merged = expectSuccess(mergeCardCandidates([original, reprint]))

    expect(merged.cardNumber).toBe('hBP03-050')
    expect(merged.printings.map((printing) => printing.officialId)).toEqual([
      '2545',
      '614',
    ])
    expect(merged.imageUrl).toBe(original.imageUrl)
    expect(merged.representativeImageOfficialId).toBe('614')
    expect(merged.officialUrl).toBe(reprint.officialUrl)
    expect(merged.printings.map((printing) => printing.isParallel)).toEqual([
      true,
      false,
    ])
    expect(merged.printings.map((printing) => printing.imageUrl)).toEqual([
      reprint.imageUrl,
      original.imageUrl,
    ])
    expect(merged.printings[0]?.products).toEqual(reprint.products)
    expect(merged.printings[1]?.products).toEqual(original.products)
    expect(merged.colors).toEqual(['blue'])
    const canonicalEffectText =
      '自分のエールデッキから、[赤エールか青エール]1枚を自分の#Adventを持つホロメンに送る。そしてエールデッキをシャッフルする。'
    expect(original.arts[0]?.effectText).toContain('1枚を公開し')
    expect(reprint.arts[0]?.effectText).toBe(canonicalEffectText)
    expect(merged.arts[0]?.effectText).toBe(canonicalEffectText)
    expect(merged.releaseDate).toBe('2025-03-21')
    expect(merged.rarities).toEqual(['R'])
    expect(merged.products).toEqual([
      'エクストラブースター サマー・ホログラム',
      '【使用可能カード】hGS 2026 大阪 セレクションロード',
      'ブースターパック「エリートスパーク」',
    ])
    expect(merged.illustrators).toEqual(['赤木渉', '© 2016 COVER Corp. MariA'])
    expect(original.qas).toHaveLength(12)
    expect(reprint.qas).toHaveLength(12)
    expect(merged.qas).toHaveLength(12)
    expect(merged.qas.map((entry) => entry.qNumber)).toEqual(
      reprint.qas.map((entry) => entry.qNumber),
    )
    expect(semanticConflicts(merged)).toContainEqual(
      expect.objectContaining({
        field: 'colors',
        canonicalOfficialId: '2545',
        conflictingOfficialId: '614',
        canonicalValue: ['blue'],
        conflictingValue: ['blue', 'red'],
      }),
    )
    expect(semanticConflicts(merged).map((conflict) => conflict.field)).toEqual(
      ['colors', 'arts'],
    )
    expect(
      merged.conflicts.some((conflict) => conflict.kind === 'qa_conflict'),
    ).toBe(false)
  })
})
