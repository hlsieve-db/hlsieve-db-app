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
    expect(CARD_DATA_UPDATE_HISTORY).toContainEqual(
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
    )
  })

  it('records the official Q&A integration against the reviewed snapshot versions', () => {
    expect(CARD_DATA_UPDATE_HISTORY).toContainEqual({
      id: 'card-data-2026-09-12-official-qa',
      publishedAt: '2026-09-12',
      cardsDataVersion:
        'sha256:75896a6a8901d8c07714a8e9ece1d718bc73daeb8569fd0f40d2287b0e3960ea',
      printingsDataVersion:
        'sha256:4b9eb6b47999b1809d07f79e484ddc777c47aab7ab62eac6182b11661d67b9a4',
      summary: 'カードデータ・公式Q&A情報を更新しました',
      addedCards: 111,
      changedCards: 411,
      removedCards: 0,
      addedPrintings: 129,
      removedPrintings: 0,
      notes: [
        '9月19日発売「ボリュームヴォルテックス」のカード111枚を追加しました。',
        'カード詳細から655件の公式Q&Aを確認できるようになりました。',
      ],
    })
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

// Not every update changes the card data. This one changed a deck-building
// rule, so its counts are zero and the notes carry the whole story.
describe('the Selection Cup rule update', () => {
  const entry = CARD_DATA_UPDATE_HISTORY.find(
    (candidate) => candidate.id === 'deck-regulation-2026-09-25-selection-cup',
  )

  it('is recorded with no card data counts', () => {
    expect(entry).toBeDefined()
    expect(entry?.publishedAt).toBe('2026-09-25')
    expect(entry?.summary).toBe(
      'セレクションカップのデッキ構築ルールを更新しました',
    )
    expect(entry?.addedCards).toBe(0)
    expect(entry?.changedCards).toBe(0)
    expect(entry?.removedCards).toBe(0)
    expect(entry?.addedPrintings).toBe(0)
    expect(entry?.removedPrintings).toBe(0)
  })

  it('names the three products the rules name', () => {
    const notes = (entry?.notes ?? []).join('\n')
    expect(notes).toContain('ブースターパック バウンサーバウンド')
    expect(notes).toContain('エクストラブースター サマー・ホログラム')
    expect(notes).toContain('ブースターパック「ボリュームヴォルテックス」')
  })

  // A different event's card grouping, which this update is not about.
  it('does not name the hGS Osaka grouping', () => {
    expect((entry?.notes ?? []).join('\n')).not.toContain('セレクションロード')
  })

  it('says which parts of the deck are restricted', () => {
    const notes = (entry?.notes ?? []).join('\n')
    expect(notes).toContain('推しホロメンカードとメインデッキ')
    expect(notes).toContain('エールデッキは制限の対象外')
  })

  it('says a different printing of the same card is fine', () => {
    expect((entry?.notes ?? []).join('\n')).toContain(
      '同じカードナンバーであれば',
    )
  })

  it('gives both stretches of the event', () => {
    expect((entry?.notes ?? []).join('\n')).toContain(
      '2026年9月19日～9月23日、2026年10月1日～10月31日',
    )
  })

  // The point most likely to worry someone who already built a deck.
  it('says decks saved under the old setting still work', () => {
    expect((entry?.notes ?? []).join('\n')).toContain(
      '以前のレギュレーション設定で保存したデッキは、そのままご利用いただけます',
    )
  })

  it('is the newest entry in the history', () => {
    expect(latestFirst(CARD_DATA_UPDATE_HISTORY)[0]).toBe(entry)
  })
})
