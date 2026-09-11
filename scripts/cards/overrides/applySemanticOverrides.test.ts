/** @vitest-environment node */

import { describe, expect, it } from 'vitest'

import { toDerivedCardCandidate } from '../derive/deriveCardEffects'
import { buildDiffSnapshot } from '../diff/buildDiffSnapshot'
import { diffCardSnapshots } from '../diff/diffCardSnapshots'
import { toPublicCard } from '../generate/toPublicCard'
import type { MergedCardCandidate } from '../merge/types'
import { toSearchIndexedCardCandidate } from '../searchIndex/buildSearchText'
import { applySemanticOverrides } from './applySemanticOverrides'
import { BUZZ_SEMANTIC_OVERRIDE_DATA } from './buzzOverrides'

function card(
  cardNumber: string,
  overrides: Partial<MergedCardCandidate> = {},
): MergedCardCandidate {
  return {
    cardNumber,
    name: 'テストカード',
    cardType: 'holomem',
    isBuzz: false,
    colors: ['red'],
    bloomLevel: 'first',
    tags: [],
    isLimited: false,
    batonPass: [],
    abilities: [],
    arts: [],
    qas: [],
    imageUrl: 'https://example.com/representative.png',
    representativeImageOfficialId: '1929',
    officialUrl: 'https://example.com/card/1929',
    rarities: ['SR'],
    products: ['テスト商品'],
    illustrators: [],
    printings: [
      {
        officialId: '1929',
        officialUrl: 'https://example.com/card/1929',
        isParallel: true,
        imageUrl: 'https://example.com/printing.png',
        products: [{ name: 'テスト商品' }],
      },
    ],
    conflicts: [
      {
        kind: 'semantic_conflict',
        cardNumber,
        field: 'isBuzz',
        canonicalOfficialId: '1929',
        conflictingOfficialId: '1805',
        canonicalValue: false,
        conflictingValue: true,
      },
    ],
    ...overrides,
  }
}

function apply(cards: readonly MergedCardCandidate[], data?: unknown) {
  const result = applySemanticOverrides(cards, data)
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result
}

describe('Buzz semantic override configuration', () => {
  it('contains only the three independently confirmed cards', () => {
    expect(BUZZ_SEMANTIC_OVERRIDE_DATA).toEqual([
      expect.objectContaining({ cardNumber: 'hBP07-019', isBuzz: true }),
      expect.objectContaining({ cardNumber: 'hBP07-048', isBuzz: true }),
      expect.objectContaining({ cardNumber: 'hBP07-076', isBuzz: true }),
    ])
  })

  it('rejects duplicate targets instead of applying last-wins', () => {
    const duplicate = [
      { id: 'one', cardNumber: 'hBP07-019', isBuzz: true, reason: 'one' },
      { id: 'two', cardNumber: 'hBP07-019', isBuzz: false, reason: 'two' },
    ]
    expect(applySemanticOverrides([card('hBP07-019')], duplicate)).toEqual({
      ok: false,
      errors: [expect.objectContaining({ code: 'DUPLICATE_BUZZ_OVERRIDE' })],
    })
  })

  it.each([
    [{ id: 'bad', cardNumber: 'hBP07-019', isBuzz: 'true', reason: 'bad' }],
    [
      {
        id: 'bad',
        cardNumber: 'hBP07-019',
        isBuzz: true,
        reason: 'bad',
        colors: ['red'],
      },
    ],
  ])('rejects invalid values and unknown fields', (invalid) => {
    expect(applySemanticOverrides([card('hBP07-019')], invalid)).toEqual({
      ok: false,
      errors: [expect.objectContaining({ code: 'INVALID_BUZZ_OVERRIDE' })],
    })
  })

  it('reports a missing target instead of silently ignoring it', () => {
    const result = apply(
      [card('hOTHER-001')],
      [
        {
          id: 'missing',
          cardNumber: 'hMISSING-001',
          isBuzz: true,
          reason: 'test',
        },
      ],
    )
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'BUZZ_OVERRIDE_TARGET_MISSING' }),
    ])
    expect(result.applications).toEqual([])
  })
})

describe('Buzz semantic override application', () => {
  it.each(['hBP07-019', 'hBP07-048', 'hBP07-076'])(
    '%s changes false to true',
    (number) => {
      const input = card(number)
      const result = apply([input])
      expect(result.value[0]?.isBuzz).toBe(true)
      expect(result.value[0]).not.toBe(input)
      expect(input.isBuzz).toBe(false)
      expect(result.applications).toEqual([
        expect.objectContaining({
          cardNumber: number,
          field: 'isBuzz',
          before: false,
          after: true,
        }),
      ])
    },
  )

  it('does not infer an override for an unrelated card', () => {
    const unrelated = card('hOTHER-001', { conflicts: [] })
    const result = apply([unrelated])
    expect(result.value).toEqual([unrelated])
    expect(result.value[0]).toBe(unrelated)
    expect(unrelated.isBuzz).toBe(false)
  })

  it('preserves printing semantics, conflicts, canonical identity, and URLs', () => {
    const input = card('hBP07-019')
    const output = apply([input]).value[0]!
    expect(output.printings).toBe(input.printings)
    expect(output.printings[0]?.isParallel).toBe(true)
    expect(output.conflicts).toBe(input.conflicts)
    expect(output.conflicts).toHaveLength(1)
    expect(output.printings[0]?.officialId).toBe('1929')
    expect(output.representativeImageOfficialId).toBe(
      input.representativeImageOfficialId,
    )
    expect(output.imageUrl).toBe(input.imageUrl)
    expect(output.officialUrl).toBe(input.officialUrl)
  })

  it('is deterministic regardless of override configuration order', () => {
    const cards = [card('hBP07-019'), card('hBP07-048'), card('hBP07-076')]
    const overrides = BUZZ_SEMANTIC_OVERRIDE_DATA as unknown[]
    expect(apply(cards, overrides).value).toEqual(
      apply(cards, [...overrides].reverse()).value,
    )
  })

  it('changes contentHash and diff only as game_content, then publishes isBuzz', () => {
    const before = toSearchIndexedCardCandidate(
      toDerivedCardCandidate(card('hBP07-019')),
    )
    const overridden = apply([card('hBP07-019')]).value[0]!
    const after = toSearchIndexedCardCandidate(
      toDerivedCardCandidate(overridden),
    )
    const beforeSnapshot = buildDiffSnapshot(before)
    const afterSnapshot = buildDiffSnapshot(after)
    const repeatedSnapshot = buildDiffSnapshot(
      toSearchIndexedCardCandidate(toDerivedCardCandidate(overridden)),
    )
    const diff = diffCardSnapshots({
      previous: beforeSnapshot,
      current: afterSnapshot,
      discoveryComplete: true,
    })
    const publicCard = toPublicCard(after)

    expect(afterSnapshot.contentHash).not.toBe(beforeSnapshot.contentHash)
    expect(repeatedSnapshot.contentHash).toBe(afterSnapshot.contentHash)
    expect(diff).toMatchObject({
      ok: true,
      value: {
        status: 'changed',
        changedCategories: ['game_content'],
        changedFields: [
          {
            category: 'game_content',
            path: 'isBuzz',
            before: false,
            after: true,
          },
        ],
      },
    })
    expect(publicCard).toMatchObject({ ok: true, value: { isBuzz: true } })
    if (publicCard.ok) {
      expect(publicCard.value).not.toHaveProperty('overrideId')
      expect(publicCard.value).not.toHaveProperty('reason')
      expect(publicCard.value).not.toHaveProperty('sources')
    }
  })
})
