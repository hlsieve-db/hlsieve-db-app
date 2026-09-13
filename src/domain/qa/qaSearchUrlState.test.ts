import { describe, expect, it } from 'vitest'

import {
  parseQaSearchUrlState,
  serializeQaSearchUrlState,
} from './qaSearchUrlState'

describe('Q&A search URL state', () => {
  it('restores Japanese queries and pages', () => {
    expect(
      parseQaSearchUrlState('?q=%E3%82%A8%E3%83%BC%E3%83%AB&page=2'),
    ).toEqual({
      query: 'エール',
      page: 2,
    })
  })

  it.each(['0', '-1', '1.5', 'abc', ''])(
    'safely falls back from invalid page %s',
    (page) => {
      expect(parseQaSearchUrlState(`?q=Q617&page=${page}`).page).toBe(1)
    },
  )

  it('canonicalizes whitespace, empty queries, and page one', () => {
    expect(
      serializeQaSearchUrlState({
        query: '  エール　手札  ',
        page: 1,
      }).toString(),
    ).toBe('q=%E3%82%A8%E3%83%BC%E3%83%AB+%E6%89%8B%E6%9C%AD')
    expect(serializeQaSearchUrlState({ query: '', page: 9 }).toString()).toBe(
      '',
    )
  })
})
