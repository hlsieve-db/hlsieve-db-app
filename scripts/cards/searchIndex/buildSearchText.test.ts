/** @vitest-environment node */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { normalizeSearchText } from '../../../src/domain/search/normalizeSearchText'
import { toDerivedCardCandidate } from '../derive/deriveCardEffects'
import type { DerivedCardCandidate } from '../derive/types'
import { fixtureManifest } from '../fixtures/manifest'
import { mergeCardCandidates } from '../merge/mergeCardCandidates'
import type { MergeResult, MergedCardCandidate } from '../merge/types'
import { normalizeCardDetail } from '../normalize/normalizeCardDetail'
import type {
  NormalizeResult,
  PrintingAwareNormalizedCardCandidate,
} from '../normalize/types'
import { parseCardDetailHtml } from '../parser/parseCardDetail'
import type { ParseResult, RawCardDetail } from '../parser/types'
import {
  buildSearchText,
  toSearchIndexedCardCandidate,
} from './buildSearchText'

const fixtureRoot = resolve(process.cwd(), 'scripts/cards/fixtures')

function expectSuccess<T>(
  result: ParseResult<T> | NormalizeResult<T> | MergeResult<T>,
): T {
  if (!result.ok) {
    throw new Error(`Expected success: ${JSON.stringify(result.errors)}`)
  }
  return result.value
}

function card(
  overrides: Partial<DerivedCardCandidate> = {},
): DerivedCardCandidate {
  return {
    cardNumber: 'hTEST-001',
    name: 'Card Name',
    cardType: 'holomem',
    isBuzz: false,
    colors: ['blue'],
    tags: [],
    isLimited: false,
    batonPass: [],
    abilities: [],
    arts: [],
    qas: [],
    rarities: [],
    products: [],
    illustrators: [],
    printings: [],
    conflicts: [],
    effectTags: [],
    criticalColors: [],
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

describe('buildSearchText', () => {
  it('uses the explicit field order and includes every searchable text field', () => {
    const target = card({
      abilities: [{ type: 'normal', text: 'Ability Text' }],
      arts: [
        {
          name: 'Art Name',
          requiredCheers: [{ color: 'blue', count: 2 }],
          damage: 50,
          effectText: 'Art Effect',
          critical: { color: 'red', bonusDamage: 30 },
        },
      ],
      extraText: 'Extra Text',
      qas: [
        {
          question: 'Question',
          answer: 'Answer',
          qNumber: 999,
          publishedDate: '2099-01-02',
          relatedCardNumbers: ['hMETA-999'],
          sourceIndex: 0,
        },
      ],
    })

    expect(
      buildSearchText(target, {
        nameReading: 'かーど',
        aliases: ['Alias', 'ＣＡＲＤ　ＮＡＭＥ', ''],
      }),
    ).toBe(
      'card name htest-001 かーど alias ability text art name art effect extra text question answer',
    )
  })

  it('deduplicates exact normalized segments but not partial segments', () => {
    const target = card({
      name: '青エール',
      abilities: [
        { type: 'normal', text: '青 エール' },
        { type: 'normal', text: '青エール' },
        { type: 'normal', text: '青エール1枚' },
      ],
    })
    const text = buildSearchText(target, { aliases: ['青エール'] })

    expect(text).toBe('青えーる htest-001 青 えーる 青えーる1枚')
  })

  it('is deterministic and handles cards without Q&A or optional terms', () => {
    const target = card()
    expect(buildSearchText(target)).toBe('card name htest-001')
    expect(buildSearchText(target)).toBe(buildSearchText(target))
  })

  it('does not index filter, metadata, URL, Q&A metadata, or conflict fields', () => {
    const target = card({
      rarities: ['DoNotIndexRarity'],
      products: ['DoNotIndexProduct'],
      illustrators: ['DoNotIndexIllustrator'],
      imageUrl: 'https://excluded.example/image-marker',
      officialUrl: 'https://excluded.example/official-marker',
      effectTags: ['draw'],
      criticalColors: ['yellow'],
      qas: [
        {
          question: 'Visible Question',
          answer: 'Visible Answer',
          qNumber: 987654,
          publishedDate: '2099-12-31',
          relatedCardNumbers: ['hMETA-999'],
          sourceIndex: 123,
        },
      ],
      printings: [
        {
          officialId: 'DoNotIndexOfficialId',
          officialUrl: 'https://excluded.example/printing-marker',
          isParallel: false,
          imageUrl: 'https://excluded.example/printing-image-marker',
          products: [],
        },
      ],
      conflicts: [
        {
          kind: 'semantic_conflict',
          cardNumber: 'hTEST-001',
          field: 'name',
          canonicalOfficialId: '1',
          conflictingOfficialId: '2',
          canonicalValue: 'Card Name',
          conflictingValue: 'DoNotIndexConflict',
        },
      ],
    })
    const text = buildSearchText(target)

    expect(text).toContain('visible question visible answer')
    for (const excluded of [
      'donotindexrarity',
      'donotindexproduct',
      'donotindexillustrator',
      'image-marker',
      'official-marker',
      'donotindexofficialid',
      'printing-marker',
      'printing-image-marker',
      'donotindexconflict',
      'どろー',
      'yellow',
      '987654',
      '2099-12-31',
      'hmeta-999',
      '123',
    ]) {
      expect(text).not.toContain(excluded)
    }
  })

  it('returns a SearchIndexedCardCandidate without mutating its input', () => {
    const target = card()
    const indexed = toSearchIndexedCardCandidate(target, {
      nameReading: 'かーどねーむ',
      aliases: ['Card Alias'],
    })

    expect(indexed.searchText).toBe(
      'card name htest-001 かーどねーむ card alias',
    )
    expect(target).not.toHaveProperty('searchText')
  })
})

describe('FUWAMOCO official fixture pipeline integration', () => {
  it('indexes canonical semantics and merged Q&A without unioning old art text', async () => {
    const original = await normalizedFixture('detail-multicolor-fuwamoco')
    const reprint = await normalizedFixture(
      'detail-multicolor-fuwamoco-reprint',
    )
    const merged: MergedCardCandidate = expectSuccess(
      mergeCardCandidates([original, reprint]),
    )
    const derived = toDerivedCardCandidate(merged)
    const searchText = buildSearchText(derived)
    const semanticOnlyText = buildSearchText({ ...derived, qas: [] })

    expect(searchText).toContain('fuwamoco')
    expect(searchText).toContain('hbp03-050')
    expect(searchText).toContain(
      normalizeSearchText(reprint.arts[0]?.effectText ?? ''),
    )
    expect(semanticOnlyText).not.toContain(normalizeSearchText('1枚を公開し'))

    const firstQa = merged.qas[0]
    expect(firstQa).toBeDefined()
    expect(searchText).toContain(normalizeSearchText(firstQa?.question ?? ''))
    expect(searchText).toContain(normalizeSearchText(firstQa?.answer ?? ''))

    const qaOnlyTerm = normalizeSearchText('ステージ以外にある場合でも')
    expect(searchText).toContain(qaOnlyTerm)
    expect(semanticOnlyText).not.toContain(qaOnlyTerm)
  })
})
