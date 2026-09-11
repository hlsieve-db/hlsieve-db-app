import { describe, expect, it } from 'vitest'

import { CARD_DATA_UPDATE_HISTORY, latestFirst } from './history'
import type { CardDataUpdateEntry } from './types'

const entry = (
  id: string,
  publishedAt: string,
  overrides: Partial<CardDataUpdateEntry> = {},
): CardDataUpdateEntry => ({
  id,
  publishedAt,
  summary: 'カードデータを更新しました。',
  addedCards: 0,
  changedCards: 0,
  removedCards: 0,
  addedPrintings: 0,
  removedPrintings: 0,
  ...overrides,
})

describe('Card data update history', () => {
  it('starts empty rather than inventing an initial publication date', () => {
    expect(CARD_DATA_UPDATE_HISTORY).toEqual([])
  })

  it('returns a latest-first copy without mutating source history', () => {
    const source = [entry('older', '2026-09-01'), entry('newer', '2026-10-18')]
    expect(latestFirst(source).map((item) => item.id)).toEqual([
      'newer',
      'older',
    ])
    expect(source.map((item) => item.id)).toEqual(['older', 'newer'])
  })

  it('supports additive and correction-only entries', () => {
    expect(
      entry('additive', '2026-10-18', {
        addedCards: 42,
        addedPrintings: 82,
      }),
    ).toMatchObject({ addedCards: 42, addedPrintings: 82 })
    expect(
      entry('correction', '2026-10-19', {
        changedCards: 3,
        notes: ['カード情報を3件修正'],
      }),
    ).toMatchObject({ addedCards: 0, changedCards: 3 })
  })
})
