import { describe, expect, it } from 'vitest'

import type { CardPrintingGroupPublic, CardPrintingPublic } from './types'
import {
  getOriginalNonParallelImageUrl,
  hasNoSingleProductReleaseDate,
  PRODUCTS_WITHOUT_SINGLE_RELEASE_DATE,
  PRODUCT_RELEASE_DATES,
} from './originalPrinting'

function printing(
  officialId: string,
  imageUrl: string,
  products: string[],
  isParallel = false,
): CardPrintingPublic {
  return {
    officialId,
    officialUrl: `https://example.com/cards/${officialId}`,
    isParallel,
    imageUrl,
    products,
  }
}

function group(printings: CardPrintingPublic[]): CardPrintingGroupPublic {
  return {
    defaultPrintingOfficialId: printings[0].officialId,
    printings,
  }
}

describe('getOriginalNonParallelImageUrl', () => {
  it('distinguishes the PR umbrella category from an unknown product date', () => {
    expect(PRODUCTS_WITHOUT_SINGLE_RELEASE_DATE.PRカード).toMatchObject({
      noSingleReleaseDate: true,
      reason: expect.any(String),
      sources: expect.arrayContaining([
        'https://hololive-official-cardgame.com/cardlist/',
      ]),
    })
    expect(hasNoSingleProductReleaseDate('PRカード')).toBe(true)
    expect(hasNoSingleProductReleaseDate('未登録の商品')).toBe(false)
    expect(PRODUCT_RELEASE_DATES).not.toHaveProperty('PRカード')
    expect(
      PRODUCT_RELEASE_DATES['ブースターパック「ブルーミングレディアンス」'],
    ).toBe('2024-09-20')
    expect(
      PRODUCT_RELEASE_DATES['ブースターパック「ボリュームヴォルテックス」'],
    ).toBe('2026-09-19')
  })

  it('uses the only non-parallel printing', () => {
    const value = group([
      printing('10', 'https://img.example/only.png', ['PRカード']),
    ])

    expect(getOriginalNonParallelImageUrl(value)).toBe(
      'https://img.example/only.png',
    )
  })

  it.each([
    {
      cardNumber: 'hBP01-021',
      promo: printing(
        '189',
        'https://img.example/hbp01-021-promo.png',
        ['PRカード'],
        true,
      ),
      original: printing('53', 'https://img.example/hbp01-021.png', [
        'ブースターパック「ブルーミングレディアンス」',
      ]),
      reprint: printing('2510', 'https://img.example/hbp01-021-reprint.png', [
        'エクストラブースター サマー・ホログラム',
      ]),
    },
    {
      cardNumber: 'hBP01-024',
      promo: printing(
        '177',
        'https://img.example/hbp01-024-promo.png',
        ['PRカード'],
        true,
      ),
      original: printing('57', 'https://img.example/hbp01-024.png', [
        'ブースターパック「ブルーミングレディアンス」',
      ]),
      reprint: printing('1897', 'https://img.example/hbp01-024-reprint.png', [
        'ブースターパック「ディーヴァフィーバー」',
      ]),
    },
    {
      cardNumber: 'hBP01-026',
      promo: printing(
        '206',
        'https://img.example/hbp01-026-promo.png',
        ['PRカード'],
        true,
      ),
      original: printing('59', 'https://img.example/hbp01-026.png', [
        'ブースターパック「ブルーミングレディアンス」',
      ]),
      reprint: printing('2511', 'https://img.example/hbp01-026-reprint.png', [
        'エクストラブースター サマー・ホログラム',
      ]),
    },
  ])(
    'selects the dated original for the real reprint $cardNumber without treating its PR parallel as a chronology source',
    ({ original, promo, reprint }) => {
      expect(
        getOriginalNonParallelImageUrl(group([reprint, promo, original])),
      ).toBe(original.imageUrl)
      expect(
        getOriginalNonParallelImageUrl(group([original, promo, reprint])),
      ).toBe(original.imageUrl)
    },
  )

  it('prefers an original normal printing over a same-product parallel', () => {
    const normal = printing('20', 'https://img.example/normal.png', [
      'ブースターパック「ブルーミングレディアンス」',
    ])
    const parallel = printing(
      '21',
      'https://img.example/parallel.png',
      ['ブースターパック「ブルーミングレディアンス」'],
      true,
    )

    expect(getOriginalNonParallelImageUrl(group([parallel, normal]))).toBe(
      normal.imageUrl,
    )
  })

  it('ignores later normal and parallel printings', () => {
    const original = printing('30', 'https://img.example/original.png', [
      'ブースターパック「ブルーミングレディアンス」',
    ])
    const laterNormal = printing('31', 'https://img.example/later.png', [
      'ブースターパック「エンチャントレガリア」',
    ])
    const laterParallel = printing(
      '32',
      'https://img.example/later-parallel.png',
      ['ブースターパック「ディーヴァフィーバー」'],
      true,
    )

    expect(
      getOriginalNonParallelImageUrl(
        group([laterParallel, laterNormal, original]),
      ),
    ).toBe(original.imageUrl)
  })

  it('falls back instead of guessing when no normal printing exists or chronology is ambiguous', () => {
    const fallback = 'https://img.example/fallback.png'
    const parallelOnly = group([
      printing(
        '40',
        'https://img.example/parallel-only.png',
        ['PRカード'],
        true,
      ),
    ])
    const ambiguous = group([
      printing('41', 'https://img.example/known.png', [
        'ブースターパック「ブルーミングレディアンス」',
      ]),
      printing('42', 'https://img.example/unknown.png', ['PRカード']),
    ])

    expect(getOriginalNonParallelImageUrl(parallelOnly, fallback)).toBe(
      fallback,
    )
    expect(getOriginalNonParallelImageUrl(ambiguous, fallback)).toBe(fallback)
  })

  it('falls back when multiple PR-only normal printings have no individual dates', () => {
    const fallback = 'https://img.example/fallback.png'
    const value = group([
      printing('50', 'https://img.example/promo-one.png', ['PRカード']),
      printing('51', 'https://img.example/promo-two.png', ['PRカード']),
    ])

    expect(getOriginalNonParallelImageUrl(value, fallback)).toBe(fallback)
    expect(
      getOriginalNonParallelImageUrl(
        group([...value.printings].reverse()),
        fallback,
      ),
    ).toBe(fallback)
  })
})
