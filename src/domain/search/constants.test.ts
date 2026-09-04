import { describe, expect, it } from 'vitest'
import { DEFAULT_SEARCH_STATE } from './constants'

describe('DEFAULT_SEARCH_STATE', () => {
  it('MVPの初期検索条件を保持する', () => {
    expect(DEFAULT_SEARCH_STATE).toEqual({
      query: '',
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
})
