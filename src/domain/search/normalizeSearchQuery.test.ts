import { describe, expect, it } from 'vitest'

import { normalizeSearchQuery } from './normalizeSearchQuery'

describe('normalizeSearchQuery', () => {
  it.each([
    ['ＡＢＣ', 'abc'],
    ['ABC', 'abc'],
    ['フワモコ', 'ふわもこ'],
    ['ﾌﾜﾓｺ', 'ふわもこ'],
    ['  白上フブキ  ', '白上ふぶき'],
    ['foo   bar\t baz', 'foo bar baz'],
    ['HBP03-050', 'hbp03-050'],
    ['エール', 'えーる'],
    ['ふわもこ', 'ふわもこ'],
    ['', ''],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeSearchQuery(input)).toBe(expected)
  })

  it('does not remove punctuation or the long vowel mark', () => {
    expect(normalizeSearchQuery('カード＋Q&A！')).toBe('かーど+q&a!')
  })
})
