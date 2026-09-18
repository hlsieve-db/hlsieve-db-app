import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SEARCH_URL_STATE,
  parseSearchUrlState,
  serializeSearchUrlState,
  type SearchUrlState,
} from '../search/searchUrlState'
import {
  isSavedSearchPreset,
  isSavedSearchState,
  presetToSearchUrlState,
  toSavedSearchState,
  type SavedSearchState,
} from './types'

const fullState: SearchUrlState = {
  query: 'フワモコ',
  includeQa: true,
  colors: ['red', 'blue'],
  colorMode: 'and',
  cardTypes: ['holomem', 'support_tool'],
  bloom: ['first', 'buzz'],
  criticalColors: ['red', 'blue'],
  criticalColorMode: 'and',
  effectTags: ['draw', 'deck_search'],
  effectTagMode: 'or',
  sort: 'card_number_asc',
  page: 9,
}

describe('saved search preset types', () => {
  it('stores every supported search condition except page and restores page 1', () => {
    const saved = toSavedSearchState(fullState)

    expect(saved).toEqual({
      query: 'フワモコ',
      includeQa: true,
      colors: ['red', 'blue'],
      colorMode: 'and',
      cardTypes: ['holomem', 'support_tool'],
      bloom: ['first', 'buzz'],
      criticalColors: ['red', 'blue'],
      criticalColorMode: 'and',
      effectTags: ['draw', 'deck_search'],
      effectTagMode: 'or',
      sort: 'card_number_asc',
    })
    expect(saved).not.toHaveProperty('page')
    expect(presetToSearchUrlState(saved)).toEqual({ ...fullState, page: 1 })
  })

  it('uses the existing canonical URL serializer when applying a preset', () => {
    const restored = presetToSearchUrlState(toSavedSearchState(fullState))
    const params = serializeSearchUrlState(restored)

    expect(params.toString()).toBe(
      'q=%E3%83%95%E3%83%AF%E3%83%A2%E3%82%B3&qa=1&color=red&color=blue&colorMode=and&type=holomem&type=support_tool&bloom=first&bloom=buzz&critical=red&critical=blue&criticalMode=and&tag=draw&tag=deck_search&tagMode=or&sort=card_number_asc',
    )
    expect(parseSearchUrlState(params)).toEqual(restored)
  })

  it('accepts and canonically restores a legacy support preset', () => {
    const legacy = {
      ...toSavedSearchState(DEFAULT_SEARCH_URL_STATE),
      cardTypes: ['support'],
    }

    expect(isSavedSearchState(legacy)).toBe(true)
    const restored = presetToSearchUrlState(
      legacy as unknown as SavedSearchState,
    )
    expect(restored.cardTypes).toEqual([
      'support_limited',
      'support_general',
      'support_tool',
      'support_fan',
      'support_mascot',
    ])
    expect(serializeSearchUrlState(restored).toString()).toBe(
      'type=support_limited&type=support_general&type=support_tool&type=support_fan&type=support_mascot',
    )
  })

  it('allows the default conditions to be saved', () => {
    const saved = toSavedSearchState(DEFAULT_SEARCH_URL_STATE)
    expect(isSavedSearchState(saved)).toBe(true)
    expect(
      serializeSearchUrlState(presetToSearchUrlState(saved)).toString(),
    ).toBe('')
  })

  it('restores an older preset without includeQa as Q&A search off', () => {
    const current = toSavedSearchState(fullState)
    const legacy = { ...current } as Partial<SavedSearchState>
    delete legacy.includeQa

    expect(isSavedSearchState(legacy)).toBe(true)
    expect(
      presetToSearchUrlState(legacy as unknown as SavedSearchState),
    ).toMatchObject({ includeQa: false, page: 1 })
  })

  it('rejects malformed includeQa values without changing the schema version', () => {
    const saved = toSavedSearchState(DEFAULT_SEARCH_URL_STATE)
    expect(isSavedSearchState({ ...saved, includeQa: 'true' })).toBe(false)
  })

  it('rejects page fields, unknown filters, and malformed preset records', () => {
    const saved = toSavedSearchState(DEFAULT_SEARCH_URL_STATE)
    expect(isSavedSearchState({ ...saved, page: 2 })).toBe(false)
    expect(isSavedSearchState({ ...saved, colors: ['orange'] })).toBe(false)
    expect(
      isSavedSearchPreset({
        id: 'preset-1',
        name: ' テスト ',
        searchState: saved,
        createdAt: '2026-09-14T00:00:00.000Z',
        updatedAt: '2026-09-14T00:00:00.000Z',
      }),
    ).toBe(false)
  })
})
