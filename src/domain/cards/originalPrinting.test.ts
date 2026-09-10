import { describe, expect, it } from 'vitest'

import type { CardPrintingGroupPublic, CardPrintingPublic } from './types'
import { getOriginalNonParallelImageUrl } from './originalPrinting'

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
      original: printing('53', 'https://img.example/hbp01-021.png', [
        'ブースターパック「ブルーミングレディアンス」',
      ]),
      reprint: printing('2510', 'https://img.example/hbp01-021-reprint.png', [
        'エクストラブースター サマー・ホログラム',
      ]),
    },
    {
      cardNumber: 'hBP01-024',
      original: printing('57', 'https://img.example/hbp01-024.png', [
        'ブースターパック「ブルーミングレディアンス」',
      ]),
      reprint: printing('1897', 'https://img.example/hbp01-024-reprint.png', [
        'ブースターパック「ディーヴァフィーバー」',
      ]),
    },
  ])(
    'selects the dated original for the real reprint $cardNumber regardless of array order',
    ({ original, reprint }) => {
      expect(getOriginalNonParallelImageUrl(group([reprint, original]))).toBe(
        original.imageUrl,
      )
      expect(getOriginalNonParallelImageUrl(group([original, reprint]))).toBe(
        original.imageUrl,
      )
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
})
