import { describe, expect, it } from 'vitest'

import type { Card } from '../cards/types'
import { DEFAULT_CARD_PAGE_SIZE } from './constants'
import { getCardSearchResults } from './getCardSearchResults'
import {
  DEFAULT_SEARCH_URL_STATE,
  parseSearchUrlState,
  SEARCH_URL_PAGE_SIZE,
  serializeSearchUrlState,
  type SearchUrlState,
} from './searchUrlState'

function serialized(state: SearchUrlState): string {
  return serializeSearchUrlState(state).toString()
}

function withState(overrides: Partial<SearchUrlState>): SearchUrlState {
  return { ...DEFAULT_SEARCH_URL_STATE, ...overrides }
}

describe('search URL defaults', () => {
  it('parses empty parameters to the complete default state', () => {
    expect(parseSearchUrlState('')).toEqual(DEFAULT_SEARCH_URL_STATE)
  })

  it('serializes the default state to empty parameters', () => {
    expect(serialized(DEFAULT_SEARCH_URL_STATE)).toBe('')
  })

  it('canonicalizes parsed defaults to empty parameters', () => {
    expect(serialized(parseSearchUrlState('?sort=default&page=1'))).toBe('')
  })

  it('fixes the non-URL page size at the shared default', () => {
    expect(SEARCH_URL_PAGE_SIZE).toBe(DEFAULT_CARD_PAGE_SIZE)
    expect(serialized(DEFAULT_SEARCH_URL_STATE)).not.toContain('size')
  })
})

describe('search URL query', () => {
  it.each(['ドロー', 'フワモコ', 'FUWAMOCO', '  前後の空白  '])(
    'preserves user query %j through URL state',
    (query) => {
      expect(
        parseSearchUrlState(serializeSearchUrlState(withState({ query })))
          .query,
      ).toBe(query)
    },
  )

  it('omits a whitespace-only query', () => {
    expect(serialized(withState({ query: '　 \t' }))).toBe('')
  })

  it.each(['a&b=c+d#e', 'Q&A = テスト + #1'])(
    'encodes and decodes special query %j',
    (query) => {
      const params = serializeSearchUrlState(withState({ query }))
      expect(params.get('q')).toBe(query)
      expect(parseSearchUrlState(params).query).toBe(query)
    },
  )

  it('uses the first query value', () => {
    expect(parseSearchUrlState('?q=first&q=second').query).toBe('first')
  })
})

describe('search URL colors and card types', () => {
  it('parses and canonically orders repeated colors', () => {
    const state = parseSearchUrlState(
      '?color=blue&color=red&color=red&color=colorless',
    )
    expect(state.colors).toEqual(['red', 'blue', 'colorless'])
    expect(serialized(state)).toBe('color=red&color=blue&color=colorless')
  })

  it('ignores invalid colors and accepts colorless', () => {
    expect(parseSearchUrlState('?color=pink&color=colorless').colors).toEqual([
      'colorless',
    ])
  })

  it('keeps a non-default color mode only with a selection', () => {
    expect(serialized(withState({ colors: ['red'], colorMode: 'and' }))).toBe(
      'color=red&colorMode=and',
    )
    expect(serialized(withState({ colorMode: 'and' }))).toBe('')
  })

  it('falls back invalid color mode to OR', () => {
    expect(parseSearchUrlState('?color=red&colorMode=x').colorMode).toBe('or')
  })

  it('accepts every card type in canonical order', () => {
    const state = parseSearchUrlState(
      '?type=cheer&type=support&type=holomem&type=oshi',
    )
    expect(state.cardTypes).toEqual(['oshi', 'holomem', 'support', 'cheer'])
  })

  it('deduplicates types and ignores invalid or empty values', () => {
    expect(
      parseSearchUrlState('?type=holomem&type=holomem&type=buzz&type=')
        .cardTypes,
    ).toEqual(['holomem'])
  })
})

describe('search URL bloom and critical colors', () => {
  it.each([
    'debut_normal',
    'debut_extra',
    'first',
    'second',
    'spot',
    'buzz',
  ] as const)('accepts bloom=%s', (bloom) => {
    expect(parseSearchUrlState(`?bloom=${bloom}`).bloom).toEqual([bloom])
  })

  it('orders and deduplicates bloom values', () => {
    const state = parseSearchUrlState(
      '?bloom=buzz&bloom=first&bloom=buzz&bloom=debut_extra',
    )
    expect(state.bloom).toEqual(['debut_extra', 'first', 'buzz'])
    expect(serialized(state)).toBe('bloom=debut_extra&bloom=first&bloom=buzz')
  })

  it('rejects debut alias, unknown, and empty bloom values', () => {
    expect(parseSearchUrlState('?bloom=debut&bloom=x&bloom=').bloom).toEqual([])
  })

  it('accepts critical colors but rejects colorless', () => {
    const state = parseSearchUrlState(
      '?critical=blue&critical=red&critical=red&critical=colorless',
    )
    expect(state.criticalColors).toEqual(['red', 'blue'])
    expect(serialized(state)).toBe('critical=red&critical=blue')
  })

  it('keeps AND critical mode only with a selection', () => {
    expect(
      serialized(
        withState({ criticalColors: ['red'], criticalColorMode: 'and' }),
      ),
    ).toBe('critical=red&criticalMode=and')
    expect(serialized(withState({ criticalColorMode: 'and' }))).toBe('')
  })

  it('falls back unknown critical mode to OR', () => {
    expect(parseSearchUrlState('?criticalMode=unknown').criticalColorMode).toBe(
      'or',
    )
  })
})

describe('search URL EffectTag', () => {
  const allTags = [
    'second_turn_one',
    'bloom_effect',
    'collab_effect',
    'gift',
    'draw',
    'deck_search',
    'cheer_acceleration',
    'cheer_recovery',
    'archive_recovery',
    'arts_boost',
    'damage_reduction',
    'special_damage',
  ] as const

  it('accepts all existing tags in domain order', () => {
    const params = new URLSearchParams()
    ;[...allTags].reverse().forEach((tag) => params.append('tag', tag))
    expect(parseSearchUrlState(params).effectTags).toEqual(allTags)
  })

  it('deduplicates tags and ignores unknown values', () => {
    expect(
      parseSearchUrlState('?tag=draw&tag=unknown&tag=draw').effectTags,
    ).toEqual(['draw'])
  })

  it('omits default AND mode and supports explicit OR', () => {
    expect(serialized(withState({ effectTags: ['draw'] }))).toBe('tag=draw')
    expect(
      serialized(withState({ effectTags: ['draw'], effectTagMode: 'or' })),
    ).toBe('tag=draw&tagMode=or')
  })

  it('omits tag mode when the selection is empty', () => {
    expect(serialized(withState({ effectTagMode: 'or' }))).toBe('')
  })
})

describe('search URL sort and page', () => {
  it.each([
    'default',
    'card_number_asc',
    'release_date_desc',
    'release_date_asc',
  ] as const)('parses sort=%s', (sort) => {
    expect(parseSearchUrlState(`?sort=${sort}`).sort).toBe(sort)
  })

  it('falls back invalid sort and omits default sort', () => {
    expect(parseSearchUrlState('?sort=garbage').sort).toBe('default')
    expect(serialized(withState({ sort: 'default' }))).toBe('')
  })

  it('serializes a non-default sort', () => {
    expect(serialized(withState({ sort: 'release_date_desc' }))).toBe(
      'sort=release_date_desc',
    )
  })

  it.each([
    ['1', 1],
    ['2', 2],
    ['999', 999],
  ] as const)('strictly parses page=%s', (value, expected) => {
    expect(parseSearchUrlState(`?page=${value}`).page).toBe(expected)
  })

  it.each(['', '0', '-1', '1.5', 'NaN', 'Infinity', '2abc'])(
    'defaults invalid page=%j',
    (page) => {
      expect(parseSearchUrlState(`?page=${page}`).page).toBe(1)
    },
  )

  it('omits page 1 and serializes pages above 1', () => {
    expect(serialized(withState({ page: 1 }))).toBe('')
    expect(serialized(withState({ page: 20 }))).toBe('page=20')
  })

  it('uses the first valid duplicated single value', () => {
    const state = parseSearchUrlState(
      '?sort=x&sort=release_date_asc&sort=card_number_asc&page=-1&page=3&page=4',
    )
    expect(state).toMatchObject({ sort: 'release_date_asc', page: 3 })
  })
})

describe('search URL canonical round-trip', () => {
  const complete = withState({
    query: 'フワモコ & Q&A',
    colors: ['colorless', 'blue', 'red'],
    colorMode: 'and',
    cardTypes: ['support', 'holomem'],
    bloom: ['buzz', 'first', 'debut_normal'],
    criticalColors: ['blue', 'red'],
    criticalColorMode: 'and',
    effectTags: ['deck_search', 'draw'],
    effectTagMode: 'or',
    sort: 'release_date_desc',
    page: 4,
  })

  it('round-trips every supported field semantically', () => {
    expect(parseSearchUrlState(serializeSearchUrlState(complete))).toEqual({
      ...complete,
      colors: ['red', 'blue', 'colorless'],
      cardTypes: ['holomem', 'support'],
      bloom: ['debut_normal', 'first', 'buzz'],
      criticalColors: ['red', 'blue'],
      effectTags: ['draw', 'deck_search'],
    })
  })

  it('uses fixed parameter and domain-value ordering', () => {
    expect(serialized(complete)).toBe(
      'q=%E3%83%95%E3%83%AF%E3%83%A2%E3%82%B3+%26+Q%26A&color=red&color=blue&color=colorless&colorMode=and&type=holomem&type=support&bloom=debut_normal&bloom=first&bloom=buzz&critical=red&critical=blue&criticalMode=and&tag=draw&tag=deck_search&tagMode=or&sort=release_date_desc&page=4',
    )
  })

  it('serializes equivalent selection order identically', () => {
    const reversed = withState({
      ...complete,
      colors: [...complete.colors].reverse(),
      effectTags: [...complete.effectTags].reverse(),
    })
    expect(serialized(reversed)).toBe(serialized(complete))
  })

  it('canonicalizes malformed parameters without throwing', () => {
    const state = parseSearchUrlState(
      '?foo=bar&color=pink&color=red&type=holomem&bloom=debut&sort=x&page=-5',
    )
    expect(serialized(state)).toBe('color=red&type=holomem')
  })
})

describe('search URL core integration', () => {
  function card(cardNumber: string, overrides: Partial<Card> = {}): Card {
    return {
      cardNumber,
      name: cardNumber,
      cardType: 'holomem',
      colors: ['red'],
      bloomLevel: 'first',
      isBuzz: false,
      tags: [],
      abilities: [],
      arts: [],
      batonPass: [],
      effectTags: ['draw'],
      criticalColors: [],
      rarities: [],
      products: [],
      illustrators: [],
      qas: [],
      searchText: `${cardNumber.toLowerCase()} どろー`,
      ...overrides,
    }
  }

  it('connects parsed URL state to search, sort, and pagination', () => {
    const cards = [
      card('CARD-003'),
      card('CARD-001', { colors: ['blue'] }),
      card('CARD-002'),
    ]
    const state = parseSearchUrlState(
      '?q=ドロー&color=red&type=holomem&bloom=first&tag=draw&sort=card_number_asc&page=2',
    )
    const result = getCardSearchResults(cards, {
      ...state,
      pageSize: 1,
    })

    expect(result.items.map((item) => item.cardNumber)).toEqual(['CARD-003'])
    expect(result).toMatchObject({ totalItems: 2, totalPages: 2, page: 2 })
  })

  it('does not reset a caller-provided page', () => {
    expect(parseSearchUrlState('?color=red&page=999').page).toBe(999)
  })
})
