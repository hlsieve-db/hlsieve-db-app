/** @vitest-environment node */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

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
import { deriveCardEffects, toDerivedCardCandidate } from './deriveCardEffects'
import { deriveCriticalColors } from './deriveCriticalColors'
import { EFFECT_TAG_ORDER } from './deriveEffectTags'
import {
  matchesArchiveRecovery,
  matchesArtsBoost,
  matchesCheerAcceleration,
  matchesCheerRecovery,
  matchesDamageReduction,
  matchesDeckSearch,
  matchesDraw,
  matchesSecondTurnOne,
  matchesSpecialDamage,
  normalizeRuleText,
} from './effectTextRules'

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
  overrides: Partial<MergedCardCandidate> = {},
): MergedCardCandidate {
  return {
    cardNumber: 'hTEST-001',
    name: 'Test Card',
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
    ...overrides,
  }
}

function tags(overrides: Partial<MergedCardCandidate>) {
  return deriveCardEffects(card(overrides)).effectTags
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

async function mergedFixture(...ids: string[]): Promise<MergedCardCandidate> {
  return expectSuccess(
    mergeCardCandidates(await Promise.all(ids.map(normalizedFixture))),
  )
}

describe('structured EffectTag rules', () => {
  it.each([
    ['bloom', 'bloom_effect'],
    ['collab', 'collab_effect'],
    ['gift', 'gift'],
  ] as const)('derives %s ability as %s', (type, expected) => {
    const result = deriveCardEffects(
      card({ abilities: [{ type, text: '効果本文' }] }),
    )

    expect(result.effectTags).toEqual([expected])
    expect(result.evidence).toContainEqual(
      expect.objectContaining({
        tag: expected,
        source: 'ability_type',
        sourceIndex: 0,
      }),
    )
  })

  it.each([
    ['Bloomと書かれた通常能力', 'bloom_effect'],
    ['コラボポジションのホロメンを選ぶ', 'collab_effect'],
  ])('does not infer a structured tag from normal text: %s', (text, absent) => {
    expect(tags({ abilities: [{ type: 'normal', text }] })).not.toContain(
      absent,
    )
  })

  it('does not derive gift from the card name', () => {
    expect(tags({ name: 'Gift of Hope' })).not.toContain('gift')
  })
})

describe('individual semantic text rules', () => {
  it('normalizes NFKC and whitespace for matching only', () => {
    expect(normalizeRuleText('  後攻で\r\n１ターン目  ')).toBe(
      '後攻で 1ターン目',
    )
    expect(matchesSecondTurnOne('自分が後攻で最初のターンなら')).toBe(true)
    expect(matchesSecondTurnOne('後攻の１ターン目なら')).toBe(true)
  })

  it.each(['後攻なら', '後攻の場合', '最初のターンなら', '1ターン目なら'])(
    'rejects a partial second-turn-one signal: %s',
    (text) => expect(matchesSecondTurnOne(text)).toBe(false),
  )

  it('requires second-turn-one signals in the same semantic source', () => {
    expect(
      tags({
        abilities: [
          { type: 'normal', text: '自分が後攻なら使える。' },
          { type: 'normal', text: '最初のターンに使える。' },
        ],
      }),
    ).not.toContain('second_turn_one')
    expect(
      matchesSecondTurnOne(
        '自分が後攻ならカードを引く。最初のターンに使用できる。',
      ),
    ).toBe(false)
  })

  it('distinguishes draw from search and hand addition', () => {
    expect(matchesDraw('条件1つにつき、自分のデッキを1枚引く。')).toBe(true)
    expect(
      matchesDraw('自分のデッキからホロメン1枚を公開し、手札に加える。'),
    ).toBe(false)
    expect(matchesDraw('デッキの上から5枚を見る。')).toBe(false)
  })

  it('detects direct and top-card deck searches with destinations', () => {
    expect(
      matchesDeckSearch(
        '自分のデッキから、#4期生を持つDebutホロメン1枚を公開し、手札に加える。',
      ),
    ).toBe(true)
    expect(
      matchesDeckSearch(
        '自分のデッキの上から5枚を見る。その中から、ホロメン1枚を公開し、手札に加える。',
      ),
    ).toBe(true)
    expect(
      matchesDeckSearch(
        '自分のデッキの上から5枚を見る。好きな順でデッキの上に戻す。',
      ),
    ).toBe(false)
    expect(
      matchesDeckSearch(
        '自分のデッキから1枚をアーカイブする。別のカードを手札に加える。',
      ),
    ).toBe(false)
  })

  it('treats cheer-deck supply as acceleration but not deck search', () => {
    const text = '自分のエールデッキの上から1枚を、自分のホロメンに送る。'
    expect(matchesCheerAcceleration(text)).toBe(true)
    expect(matchesDeckSearch(text)).toBe(false)
  })

  it('allows archive cheer supply to be acceleration and recovery', () => {
    const text = '自分のアーカイブの青エール1枚を、このホロメンに送る。'
    expect(matchesCheerAcceleration(text)).toBe(true)
    expect(matchesCheerRecovery(text)).toBe(true)
    expect(matchesArchiveRecovery(text)).toBe(false)
  })

  it('detects cheer recovery without acceleration when returning to cheer deck', () => {
    const text = '自分のアーカイブのエール1〜3枚をエールデッキに戻す。'
    expect(matchesCheerRecovery(text)).toBe(true)
    expect(matchesCheerAcceleration(text)).toBe(false)
  })

  it('detects non-cheer archive recovery conservatively', () => {
    expect(
      matchesArchiveRecovery('自分のアーカイブのホロメン1枚を手札に戻す。'),
    ).toBe(true)
    expect(
      matchesArchiveRecovery('自分のアーカイブのエール1枚を手札に加える。'),
    ).toBe(false)
    expect(matchesArchiveRecovery('手札1枚をアーカイブする。')).toBe(false)
  })

  it('separates arts boost from Critical', () => {
    expect(matchesArtsBoost('このターンの間、このアーツ＋２０。')).toBe(true)
    expect(
      tags({ arts: [{ name: 'Art', requiredCheers: [], damage: 50 }] }),
    ).not.toContain('arts_boost')
    expect(
      tags({
        arts: [
          {
            name: 'Art',
            requiredCheers: [],
            damage: 50,
            critical: { color: 'blue', bonusDamage: 50 },
          },
        ],
      }),
    ).not.toContain('arts_boost')
    expect(
      tags({
        arts: [
          {
            name: 'Art',
            requiredCheers: [],
            critical: { color: 'blue', bonusDamage: 50 },
            effectText: '条件を満たすなら、このアーツ+20。',
          },
        ],
      }),
    ).toContain('arts_boost')
  })

  it('detects damage reduction without confusing LIFE or healing', () => {
    expect(matchesDamageReduction('このホロメンが受けるダメージ－２０。')).toBe(
      true,
    )
    expect(matchesDamageReduction('このターン、ダメージを受けない。')).toBe(
      true,
    )
    expect(matchesDamageReduction('ダウンした時に減るライフ-1。')).toBe(false)
    expect(matchesDamageReduction('このホロメンのHP100回復。')).toBe(false)
  })

  it('requires semantic text for special damage', () => {
    expect(
      matchesSpecialDamage('相手のホロメンに特殊ダメージ20を与える。'),
    ).toBe(true)
    expect(
      matchesSpecialDamage(
        'このホロメンが特殊ダメージを受ける時、相手に通常ダメージを与える。',
      ),
    ).toBe(false)
    expect(
      tags({ arts: [{ name: 'Art', requiredCheers: [], damage: 100 }] }),
    ).not.toContain('special_damage')
    expect(
      tags({
        arts: [
          {
            name: 'Art',
            requiredCheers: [],
            critical: { color: 'red', bonusDamage: 50 },
          },
        ],
      }),
    ).not.toContain('special_damage')
  })
})

describe('derive composition and excluded sources', () => {
  it('returns unique EffectTags in the fixed type order', () => {
    const result = tags({
      abilities: [
        {
          type: 'collab',
          text: '自分が後攻で最初のターンなら、自分のエールデッキから1枚を自分のホロメンに送る。このアーツ+20。',
        },
        { type: 'collab', text: 'このアーツ+20。' },
      ],
    })

    expect(result).toEqual([
      'second_turn_one',
      'collab_effect',
      'cheer_acceleration',
      'arts_boost',
    ])
    expect(new Set(result).size).toBe(result.length)
    expect(result).toEqual(
      EFFECT_TAG_ORDER.filter((tag) => result.includes(tag)),
    )
  })

  it('allows bloom, cheer acceleration, and cheer recovery together', () => {
    expect(
      tags({
        abilities: [
          {
            type: 'bloom',
            text: '自分のアーカイブのエール1枚をこのホロメンに送る。',
          },
        ],
      }),
    ).toEqual(['bloom_effect', 'cheer_acceleration', 'cheer_recovery'])
  })

  it('does not inspect Q&A, names, tags, products, URLs, or conflicts', () => {
    const base = card()
    const noisy = card({
      name: 'Gift 特殊ダメージ',
      tags: ['Bloom', 'ドロー'],
      products: ['デッキを1枚引く'],
      officialUrl: 'https://example.com/特殊ダメージ',
      qas: [
        {
          question: '後攻の最初のターンに特殊ダメージを与えますか？',
          answer: 'デッキを1枚引き、アーカイブのエールを手札に加える。',
          relatedCardNumbers: [],
          sourceIndex: 0,
        },
      ],
      conflicts: [
        {
          kind: 'semantic_conflict',
          cardNumber: 'hTEST-001',
          field: 'abilities',
          canonicalOfficialId: '2',
          conflictingOfficialId: '1',
          canonicalValue: [],
          conflictingValue: [{ type: 'gift', text: 'このアーツ+20' }],
        },
      ],
    })

    expect(deriveCardEffects(noisy)).toEqual(deriveCardEffects(base))
  })

  it('adds derived fields without changing the merged candidate', () => {
    const merged = card({ abilities: [{ type: 'gift', text: '効果' }] })
    const derived = toDerivedCardCandidate(merged)

    expect(derived.effectTags).toEqual(['gift'])
    expect(derived.criticalColors).toEqual([])
    expect(merged).not.toHaveProperty('effectTags')
  })
})

describe('criticalColors', () => {
  it('deduplicates structured Critical colors in art order', () => {
    const merged = card({
      arts: [
        {
          name: 'One',
          requiredCheers: [],
          critical: { color: 'blue', bonusDamage: 50 },
        },
        {
          name: 'Two',
          requiredCheers: [],
          critical: { color: 'red', bonusDamage: 20 },
        },
        {
          name: 'Three',
          requiredCheers: [],
          critical: { color: 'blue', bonusDamage: 30 },
        },
      ],
    })

    expect(deriveCriticalColors(merged)).toEqual(['blue', 'red'])
  })
})

describe('official fixture pipeline integration', () => {
  it('derives collab and arts boost from Shirogane Noel', async () => {
    const merged = await mergedFixture('detail-debut-shirogane-noel')
    expect(deriveCardEffects(merged).effectTags).toEqual([
      'collab_effect',
      'arts_boost',
    ])
  })

  it('derives draw, arts boost, and special damage from Stone Axe, not its Q&A', async () => {
    const merged = await mergedFixture('detail-tool-stone-axe')
    expect(deriveCardEffects(merged).effectTags).toEqual([
      'draw',
      'arts_boost',
      'special_damage',
    ])
  })

  it('derives deck search from Two-Tone Color PC', async () => {
    const merged = await mergedFixture('detail-limited-two-tone-pc')
    expect(deriveCardEffects(merged).effectTags).toEqual(['deck_search'])
  })

  it('uses canonical FUWAMOCO art effect and excludes its Q&A terms', async () => {
    const merged = await mergedFixture(
      'detail-multicolor-fuwamoco',
      'detail-multicolor-fuwamoco-reprint',
    )
    expect(deriveCardEffects(merged).effectTags).toEqual(['cheer_acceleration'])
  })

  it('derives Critical colors from structured Marine art data', async () => {
    const merged = await mergedFixture('detail-second-houshou-marine')
    const effects = deriveCardEffects(merged)

    expect(effects.criticalColors).toEqual(['yellow'])
    expect(effects.effectTags).toEqual(['draw', 'special_damage'])
  })
})
