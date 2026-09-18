import { describe, expect, it } from 'vitest'
import { CARD_TYPE_FILTER_LABELS, DEFAULT_SEARCH_STATE } from './constants'

describe('DEFAULT_SEARCH_STATE', () => {
  it('MVPの初期検索条件を保持する', () => {
    expect(DEFAULT_SEARCH_STATE).toEqual({
      query: '',
      includeQa: false,
      colors: [],
      colorsMode: 'or',
      bloomLevels: [],
      cardTypes: [],
      criticalColors: [],
      criticalMode: 'or',
      effectTags: [],
      effectTagsMode: 'and',
      rarities: [],
      products: [],
      sort: 'default',
      perPage: 24,
      page: 1,
    })
  })

  it('カードタイプ検索の7分類と表示順を保持する', () => {
    expect(Object.entries(CARD_TYPE_FILTER_LABELS)).toEqual([
      ['oshi', '推しホロメン'],
      ['holomem', 'ホロメン'],
      ['support_limited', 'サポート（リミテッド）'],
      ['support_general', 'サポート（非リミテッド）'],
      ['support_tool', 'ツール'],
      ['support_fan', 'ファン'],
      ['support_mascot', 'マスコット'],
      ['cheer', 'エール'],
    ])
  })
})
