import { describe, expect, it } from 'vitest'

import { createVenueSlug, extractPrefecture } from './venue'

describe('Tournament venue helpers', () => {
  it('creates a stable ASCII slug from NFKC-normalized venue input', () => {
    const first = createVenueSlug('カードショップ Ａ', '東京都')
    const second = createVenueSlug('カードショップ A', '東京都')
    expect(first).toBe(second)
    expect(first).toMatch(/^venue-[a-f0-9]{16}$/)
    expect(createVenueSlug('カードショップ A', '大阪府')).not.toBe(first)
  })

  it('extracts Japanese prefectures from public addresses', () => {
    expect(extractPrefecture('愛知県名古屋市中村区')).toBe('愛知県')
    expect(extractPrefecture('東京都千代田区')).toBe('東京都')
    expect(extractPrefecture('名古屋市中村区')).toBeUndefined()
  })
})
