import { describe, expect, it } from 'vitest'

import { normalizeSearchText } from './normalizeSearchText'

describe('normalizeSearchText', () => {
  it.each([
    ['ＡＺＫｉ', 'azki'],
    ['AZKi', 'azki'],
    ['AzKi', 'azki'],
  ])('normalizes Latin width and case: %s', (input, expected) => {
    expect(normalizeSearchText(input)).toBe(expected)
  })

  it.each([
    ['ホロライブ', 'ほろらいぶ'],
    ['ﾎﾛﾗｲﾌﾞ', 'ほろらいぶ'],
    ['ガヴァット', 'がゔぁっと'],
    ['ァィゥェォッャュョ', 'ぁぃぅぇぉっゃゅょ'],
    ['エール', 'えーる'],
  ])('converts Katakana after NFKC: %s', (input, expected) => {
    expect(normalizeSearchText(input)).toBe(expected)
  })

  it('collapses full-width spaces, tabs, LF, and CRLF', () => {
    expect(normalizeSearchText('  青　\tエール\r\n デッキ\n検索  ')).toBe(
      '青 えーる でっき 検索',
    )
  })

  it('keeps Kanji, punctuation, and symbols', () => {
    expect(normalizeSearchText('宝鐘マリン。青+赤！')).toBe(
      '宝鐘まりん。青+赤!',
    )
  })

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeSearchText('　\r\n\t ')).toBe('')
  })
})
