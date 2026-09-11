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
  it('records the reviewed hBP07-076 correction against published versions', () => {
    expect(CARD_DATA_UPDATE_HISTORY).toEqual([
      expect.objectContaining({
        id: 'card-data-2026-09-11',
        publishedAt: '2026-09-11',
        cardsDataVersion:
          'sha256:91388bb696beb83acb2371b130e07792bbfd7f743322b489b9b7345eda585ad8',
        printingsDataVersion:
          'sha256:6dc8dcce77d980ca8f6aadf885d5295f9e058f8eebfea6712eed82c5a0ca630b',
        summary: 'カード情報を修正しました',
        changedCards: 1,
        notes: ['hBP07-076のBuzz分類を修正しました。'],
      }),
    ])
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
