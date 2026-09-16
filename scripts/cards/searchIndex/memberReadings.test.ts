import { describe, expect, it } from 'vitest'

import { normalizeSearchText } from '../../../src/domain/search/normalizeSearchText'
import { getMemberSearchTerms, MEMBER_READING_ENTRIES } from './memberReadings'

describe('member reading dictionary', () => {
  it('has unique official names and nonempty canonical hiragana readings', () => {
    const names = MEMBER_READING_ENTRIES.map(({ name }) => name)

    expect(new Set(names).size).toBe(names.length)
    MEMBER_READING_ENTRIES.forEach(({ name, reading }) => {
      expect(name).not.toBe('')
      expect(reading).toMatch(/^[ぁ-ゖー]+$/)
      expect(normalizeSearchText(reading)).toBe(reading)
    })
  })

  it('registers AkiRoze as the only nickname alias', () => {
    const entriesWithAliases = MEMBER_READING_ENTRIES.filter(
      (entry) => 'aliases' in entry,
    )

    expect(entriesWithAliases).toEqual([
      {
        name: 'アキ・ローゼンタール',
        reading: 'あきろーぜんたーる',
        aliases: ['アキロゼ'],
      },
    ])
    expect(getMemberSearchTerms('さくらみこ')?.aliases).not.toContain('みこち')
    expect(getMemberSearchTerms('星街すいせい')?.aliases).not.toContain(
      'すいちゃん',
    )
  })

  it('adds a compact official-name term without changing the dictionary reading', () => {
    expect(getMemberSearchTerms('パヴォリア・レイネ')).toEqual({
      nameReading: 'ぱゔぉりあれいね',
      aliases: ['パヴォリアレイネ'],
    })
    expect(getMemberSearchTerms('アキ・ローゼンタール')).toEqual({
      nameReading: 'あきろーぜんたーる',
      aliases: ['アキローゼンタール', 'アキロゼ'],
    })
  })

  it('does not infer readings for names outside the fixed dictionary', () => {
    expect(getMemberSearchTerms('FUWAMOCO')).toBeUndefined()
    expect(getMemberSearchTerms('魔法少女みこ')).toBeUndefined()
  })
})
